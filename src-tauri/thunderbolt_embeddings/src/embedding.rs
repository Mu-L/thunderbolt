use anyhow::Error as E;
use candle::{DType, IndexOp, Tensor};
use candle_core as candle;
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{BertModel, Config};
use hf_hub::{api::sync::Api, Repo, RepoType};
use std::sync::Arc;

pub struct Embedder {
    model: BertModel,
    tokenizer: tokenizers::Tokenizer,
    device: candle::Device,
}

impl Embedder {
    pub fn new() -> anyhow::Result<Self> {
        let device = candle::Device::Cpu;

        // Get model and tokenizer files - use E5-small model
        let model_name = "intfloat/e5-small-v2";
        let api = Api::new()?;
        let model = api
            .repo(Repo::new(model_name.to_string(), RepoType::Model))
            .get("model.safetensors")?;
        let tokenizer_path = api
            .repo(Repo::new(model_name.to_string(), RepoType::Model))
            .get("tokenizer.json")?;

        // Initialize tokenizer
        let tokenizer = tokenizers::Tokenizer::from_file(tokenizer_path).map_err(E::msg)?;

        // Load E5-small config
        let config_path = api
            .repo(Repo::new(model_name.to_string(), RepoType::Model))
            .get("config.json")?;
        let config_str = std::fs::read_to_string(config_path)?;
        let config: Config = serde_json::from_str(&config_str)?;

        // Create model with loaded config
        let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[model], DType::F32, &device)? };
        let model = BertModel::load(vb, &config)?;

        Ok(Self {
            model,
            tokenizer,
            device,
        })
    }

    pub fn generate_embedding(&self, text: &str) -> anyhow::Result<Tensor> {
        // Tokenize input with truncation
        // E5 models typically use a specific format - add the prefix
        let formatted_text = format!("passage: {}", text);
        let encoding = self
            .tokenizer
            .encode(formatted_text, true)
            .map_err(E::msg)?;
        let max_tokens = 512; // E5-Small has a 512 token limit

        // Always truncate to max length for simplicity and consistency
        let token_ids = if encoding.get_ids().len() > max_tokens {
            encoding.get_ids()[0..max_tokens].to_vec()
        } else {
            encoding.get_ids().to_vec()
        };

        // Get attention mask
        let attention_mask = if encoding.get_attention_mask().len() > max_tokens {
            encoding.get_attention_mask()[0..max_tokens].to_vec()
        } else {
            encoding.get_attention_mask().to_vec()
        };

        // Convert to tensors
        let token_ids = Tensor::new(&token_ids[..], &self.device)?.unsqueeze(0)?;
        let attention_mask = Tensor::new(&attention_mask[..], &self.device)?.unsqueeze(0)?;
        let token_type_ids = token_ids.zeros_like()?;

        // Get embeddings using the standard BERT model
        let embeddings = self
            .model
            .forward(&token_ids, &token_type_ids, Some(&attention_mask))?;

        // E5 uses the CLS token (first token) embedding for sentence representation
        let sentence_embedding = embeddings.i((.., 0, ..))?;

        // Normalize and flatten embeddings
        let normalized = normalize_l2(&sentence_embedding).map_err(E::msg)?;
        normalized.flatten_all().map_err(E::msg)
    }
}

pub fn generate_embedding(embedder: &Embedder, text: &str) -> anyhow::Result<Vec<f32>> {
    let tensor = embedder.generate_embedding(text)?;

    // Convert tensor to Vec<f32> and map the error type to anyhow
    tensor.to_vec1().map_err(|e| anyhow::Error::new(e))
}

fn normalize_l2(v: &Tensor) -> candle::Result<Tensor> {
    // Simple normalization that works with the expected tensor shape
    v.broadcast_div(&v.sqr()?.sum_keepdim(1)?.sqrt()?)
}

// Add a new function to handle performance-managed embedding generation
fn generate_embedding_with_performance_tracking(
    embedder: &Embedder,
    text: &str,
    consecutive_slow_embeddings: &mut u32,
    last_embedding_time: &mut std::time::Instant,
) -> anyhow::Result<Vec<f32>> {
    let start_time = std::time::Instant::now();
    let embedding = generate_embedding(embedder, text)?;
    let duration = start_time.elapsed();

    // If embedding took a long time, track it
    if duration > std::time::Duration::from_millis(1000) {
        *consecutive_slow_embeddings += 1;

        // If we've had multiple slow embeddings in a row, force a longer cooldown
        if *consecutive_slow_embeddings > 2 {
            println!("Detected performance degradation, cooling down GPU for 2 seconds");
            std::thread::sleep(std::time::Duration::from_secs(2));
            *consecutive_slow_embeddings = 0;
        }
    } else {
        *consecutive_slow_embeddings = 0;
    }

    // A small delay between operations can help GPU stability
    // Adaptive delay based on previous embedding time
    let delay = if last_embedding_time.elapsed() > std::time::Duration::from_millis(500) {
        // If last embedding was slow, wait longer
        50
    } else {
        10
    };
    std::thread::sleep(std::time::Duration::from_millis(delay));

    *last_embedding_time = std::time::Instant::now();
    Ok(embedding)
}

pub fn generate_embeddings(embedder: &Embedder, texts: &[String]) -> anyhow::Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(Vec::new());
    }

    // Adjust batch size based on average text length to optimize memory usage
    let avg_text_len = texts.iter().map(|s| s.len()).sum::<usize>() / texts.len();
    let max_batch_size = if avg_text_len > 1000 {
        5 // Use smaller batches for longer texts
    } else if avg_text_len > 500 {
        10
    } else {
        15 // Use smaller batches overall to prevent memory buildup
    };

    // Optimize single text case
    if texts.len() == 1 {
        return Ok(vec![generate_embedding(embedder, &texts[0])?]);
    }

    let mut results = Vec::with_capacity(texts.len());
    let mut consecutive_slow_embeddings = 0;
    let mut last_embedding_time = std::time::Instant::now();

    // Process in batches to optimize memory usage and GPU utilization
    for (batch_idx, chunk) in texts.chunks(max_batch_size).enumerate() {
        // Force cleanup between larger batches
        if batch_idx > 0 && batch_idx % 5 == 0 {
            // Force a longer cooldown period every 5 batches
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        if chunk.len() == 1 {
            // Single item in chunk - process directly with performance tracking
            let embedding = generate_embedding_with_performance_tracking(
                embedder,
                &chunk[0],
                &mut consecutive_slow_embeddings,
                &mut last_embedding_time,
            )?;
            results.push(embedding);
        } else {
            // Process batch sequentially to avoid GPU command buffer conflicts
            for text in chunk {
                let embedding = generate_embedding_with_performance_tracking(
                    embedder,
                    text,
                    &mut consecutive_slow_embeddings,
                    &mut last_embedding_time,
                )?;
                results.push(embedding);
            }
        }

        // A slight pause between batches to allow GPU to catch up
        // Adaptive pause based on batch processing time
        let batch_pause = if consecutive_slow_embeddings > 0 {
            // If we've had slow embeddings, pause longer between batches
            100
        } else {
            20
        };
        std::thread::sleep(std::time::Duration::from_millis(batch_pause));
    }

    Ok(results)
}

// Add a new function to work with Arc<Embedder>
pub fn generate_embeddings_arc(
    embedder: &Arc<Embedder>,
    texts: &[String],
) -> anyhow::Result<Vec<Vec<f32>>> {
    generate_embeddings(embedder, texts)
}

// Add convenience function for backward compatibility with examples
pub fn get_embedding(text: &str) -> anyhow::Result<Vec<f32>> {
    let embedder = Embedder::new()?;
    generate_embedding(&embedder, text)
}
