use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use bytes::Bytes;
use indexmap::IndexMap;
use libsql::{Cipher, EncryptionConfig, Value};
use serde_json::Value as JsonValue;
use tauri::{command, State};
use tokio::sync::Mutex;

// Import AppState from the state module
use crate::state::AppState;

// Replace bind_values with this function to create params
pub fn create_params(values: &[JsonValue]) -> Result<Vec<libsql::Value>> {
    let mut params = Vec::with_capacity(values.len());

    for value in values {
        if value.is_null() {
            params.push(Value::Null);
        } else if let Some(s) = value.as_str() {
            params.push(Value::Text(s.to_string()));
        } else if let Some(n) = value.as_i64() {
            params.push(Value::Integer(n));
        } else if let Some(n) = value.as_f64() {
            params.push(Value::Real(n));
        } else if let Some(b) = value.as_bool() {
            params.push(Value::Integer(if b { 1 } else { 0 }));
        } else {
            // For complex types, serialize to JSON string
            params.push(Value::Text(value.to_string()));
        }
    }

    Ok(params)
}

pub fn value_to_json(value: Value) -> JsonValue {
    match value {
        Value::Null => JsonValue::Null,
        Value::Integer(i) => JsonValue::Number(i.into()),
        Value::Real(f) => {
            if let Some(n) = serde_json::Number::from_f64(f) {
                JsonValue::Number(n)
            } else {
                JsonValue::Null
            }
        }
        Value::Text(s) => JsonValue::String(s),
        Value::Blob(b) => {
            // Convert blob to base64 string
            let base64 = STANDARD.encode(&b);
            JsonValue::String(base64)
        }
    }
}

#[command]
pub async fn init_libsql(state: State<'_, Mutex<AppState>>, path: String) -> Result<(), String> {
    let fqdb = path.clone();

    // Ensure directory exists
    if let Some(parent) = std::path::PathBuf::from(&fqdb).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Problem creating directory: {}", e))?;
    }

    let cipher = Cipher::Aes256Cbc;
    let encryption_key_bytes = Bytes::from("your_secure_encryption_key_here");

    let encryption_config = EncryptionConfig {
        cipher,
        encryption_key: encryption_key_bytes,
    };

    let database = libsql::Builder::new_local(&fqdb)
        .encryption_config(encryption_config) // Apply encryption configuration
        .build()
        .await
        .map_err(|e| format!("Failed to build database: {}", e))?;

    let conn = database
        .connect()
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    // Store connection in state
    let mut state = state.lock().await;
    state.libsql = Some(conn);

    Ok(())
}

/// Execute a command against the database
#[command]
pub async fn execute(
    state: State<'_, Mutex<AppState>>,
    query: String,
    values: Vec<JsonValue>,
) -> Result<(u64, i64), String> {
    let mut state = state.lock().await;

    let conn = state
        .libsql
        .as_mut()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let mut stmt = conn
        .prepare(&query)
        .await
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    // Create parameter values from JSON
    let params =
        create_params(&values).map_err(|e| format!("Failed to create parameters: {}", e))?;

    // Pass params directly, not as reference
    let affected = stmt
        .execute(params)
        .await
        .map_err(|e| format!("Failed to execute statement: {}", e))?;

    // libsql just returns the count as usize, no result object
    // We'll use 0 for last_insert_id (or implement another query to get it)
    let rows_affected = affected as u64;
    let last_insert_id = 0; // Would need separate "SELECT last_insert_rowid()" to get this

    Ok((rows_affected, last_insert_id))
}

#[command]
pub async fn select(
    state: State<'_, Mutex<AppState>>,
    query: String,
    values: Vec<JsonValue>,
) -> Result<Vec<IndexMap<String, JsonValue>>, String> {
    let mut state = state.lock().await;

    let conn = state
        .libsql
        .as_mut()
        .ok_or_else(|| "Database not initialized".to_string())?;

    let mut stmt = conn
        .prepare(&query)
        .await
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    // Create parameter values from JSON
    let params =
        create_params(&values).map_err(|e| format!("Failed to create parameters: {}", e))?;

    // Pass params directly, not as reference
    let mut rows = stmt
        .query(params)
        .await
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    let mut results = Vec::new();
    while let Some(row) = rows
        .next()
        .await
        .map_err(|e| format!("Failed to fetch row: {}", e))?
    {
        let mut value = IndexMap::new();
        for i in 0..row.column_count() {
            let column_name = row.column_name(i).unwrap_or_default().to_string();
            let v = match row.get::<Value>(i) {
                Ok(v) => value_to_json(v),
                Err(_) => JsonValue::Null,
            };
            value.insert(column_name, v);
        }
        results.push(value);
    }

    Ok(results)
}
