use crate::db_pool::DbPool;
use thunderbolt_embeddings::embedding::Embedder;
use thunderbolt_imap_client::ImapClient;
use thunderbolt_imap_sync::ImapSync;
use std::sync::Arc;

#[derive(Default)]
pub struct AppState {
    pub db_pool: Option<DbPool>,
    pub imap_client: Option<ImapClient>,
    pub imap_sync: Option<ImapSync>,
    pub embedder: Option<Arc<Embedder>>,
}
