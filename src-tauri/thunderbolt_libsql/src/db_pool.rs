use anyhow::Result;
use bytes::Bytes;
use libsql::{Builder, Cipher, Connection, Database, EncryptionConfig};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

pub struct DbPool {
    database: Arc<Database>,
    connections: Vec<Arc<Mutex<Connection>>>,
    next_conn: Mutex<usize>,
}

impl DbPool {
    pub async fn new(path: &str, encryption_key: Option<String>, pool_size: usize, app_handle: &tauri::AppHandle) -> Result<Self> {
        // Ensure directory exists
        if let Some(parent) = std::path::PathBuf::from(path).parent() {
            std::fs::create_dir_all(parent)?;
        }

        let mut builder = Builder::new_local(path);

        // Apply encryption configuration if key is provided
        if let Some(key) = encryption_key {
            let cipher = Cipher::Aes256Cbc;
            let encryption_key_bytes = Bytes::from(key);

            let encryption_config = EncryptionConfig {
                cipher,
                encryption_key: encryption_key_bytes,
            };

            builder = builder.encryption_config(encryption_config);
        }

        let database = Arc::new(builder.build().await?);
        let mut connections = Vec::with_capacity(pool_size);

        // Create the first connection and enable WAL mode
        let first_conn = database.connect()?;

        // Use query to handle the PRAGMA result correctly
        let mut rows = first_conn
            .query("PRAGMA journal_mode=WAL;", Vec::<libsql::Value>::new())
            .await?;

        // Consume the result (contains the string "wal")
        while (rows.next().await?).is_some() {
            // We don't need to do anything with the result
        }

        // Try to load the cr-sqlite extension from the bundled dylib
        if let Ok(resource_path) = app_handle.path().resource_dir() {
            let extension_path = resource_path.join("resources").join("crsqlite.dylib");
            if extension_path.exists() {
                println!("🔍 Found crsqlite.dylib at: {:?}", extension_path);
                
                // Enable extension loading
                match first_conn.load_extension_enable() {
                    Ok(_) => {
                        println!("✅ Extension loading enabled");
                        
                        // Load the cr-sqlite extension
                        match first_conn.load_extension(&extension_path, Some("sqlite3_crsqlite_init")) {
                            Ok(_) => {
                                println!("✅ cr-sqlite extension loaded successfully!");
                                println!("🎉 You can now use cr-sqlite functions like crsql_as_crr() in your database!");
                            }
                            Err(e) => eprintln!("❌ Failed to load cr-sqlite extension: {}", e)
                        }
                        
                        // Disable extension loading for security
                        let _ = first_conn.load_extension_disable();
                    }
                    Err(e) => eprintln!("❌ Failed to enable extension loading: {}", e)
                }
            } else {
                eprintln!("❌ crsqlite.dylib not found at: {:?}", extension_path);
            }
        } else {
            eprintln!("❌ Could not get resource directory path");
        }

        connections.push(Arc::new(Mutex::new(first_conn)));

        // Create the rest of the connections
        for _ in 1..pool_size {
            let conn = database.connect()?;
            connections.push(Arc::new(Mutex::new(conn)));
        }

        Ok(Self {
            database,
            connections,
            next_conn: Mutex::new(0),
        })
    }

    pub async fn get_connection(&self) -> Arc<Mutex<Connection>> {
        let mut next = self.next_conn.lock().await;
        let conn = self.connections[*next].clone();

        // Round-robin selection
        *next = (*next + 1) % self.connections.len();

        conn
    }

    // Get database for operations that need the database directly
    pub fn get_database(&self) -> Arc<Database> {
        self.database.clone()
    }
} 