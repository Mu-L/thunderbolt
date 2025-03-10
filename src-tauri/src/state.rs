use libsql::Connection;

#[derive(Default)]
pub struct AppState {
    pub libsql: Option<Connection>,
}
