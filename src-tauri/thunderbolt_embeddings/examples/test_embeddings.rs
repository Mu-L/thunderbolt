use anyhow::Result;
use thunderbolt_embeddings::embedding::{generate_embedding, Embedder};

fn main() -> Result<()> {
    println!("Testing embedding generation with a sample text...");

    // Initialize the embedder
    println!("Initializing embedder...");
    let embedder = Embedder::new()?;
    println!("Embedder initialized successfully.");

    // Generate an embedding for a sample text
    let sample_text = "This is a test email to verify embedding generation works correctly.";
    println!("Generating embedding for: '{}'", sample_text);

    let embedding = generate_embedding(&embedder, sample_text)?;

    println!(
        "Successfully generated embedding with {} dimensions",
        embedding.len()
    );

    // Print first few values of the embedding
    let preview: Vec<f32> = embedding.iter().take(5).cloned().collect();
    println!("First few values: {:?}", preview);

    Ok(())
}
