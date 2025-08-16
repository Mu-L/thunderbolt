use libsql::{Database, Builder};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Testing if cr-sqlite is available in libsql...");
    
    // Create an in-memory database
    let db = Database::open(":memory:")?;
    let conn = db.connect()?;
    
    // Try to call crsql_version to see if cr-sqlite is available
    match conn.query("SELECT crsql_version()", Vec::<libsql::Value>::new()).await {
        Ok(mut rows) => {
            if let Some(row) = rows.next().await? {
                let version = row.get_str(0)?;
                println!("✅ cr-sqlite is available! Version: {}", version);
            }
        }
        Err(e) => {
            println!("❌ cr-sqlite is not available: {}", e);
            
            // Try to see what functions are available
            println!("Checking available functions...");
            match conn.query("SELECT name FROM sqlite_master WHERE type='function'", Vec::<libsql::Value>::new()).await {
                Ok(mut rows) => {
                    println!("Available functions:");
                    while let Some(row) = rows.next().await? {
                        if let Ok(name) = row.get_str(0) {
                            if name.contains("crsql") {
                                println!("  - {}", name);
                            }
                        }
                    }
                }
                Err(e) => println!("Could not list functions: {}", e)
            }
        }
    }
    
    Ok(())
}