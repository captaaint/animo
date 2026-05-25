use crate::config::Config;
use crate::import::PreviewSession;
use sqlx::sqlite::SqlitePool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// In-memory store for CSV-import preview sessions. The map key is the
/// `session_id` returned from the preview endpoint; the commit endpoint
/// pops the matching session, validates it against the current DB, and
/// writes the rows in a single transaction.
///
/// Kept as an `Arc<Mutex<HashMap<..>>>` instead of a heavier `dashmap`
/// or `tokio::sync` primitive because:
///   - Sessions are tiny (parsed rows + counts) and rarely contended:
///     one user at a time, only mutated inside the preview/commit
///     handlers.
///   - The desktop deployment is single-process, single-user, so the
///     in-memory store survives exactly as long as the API does — there
///     is nothing to migrate or sync.
///   - Lock is held only for the duration of an `insert` / `remove`,
///     never across an `await`, so a `std::sync::Mutex` is fine.
pub type ImportSessions = Arc<Mutex<HashMap<String, PreviewSession>>>;

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub config: Arc<Config>,
    pub import_sessions: ImportSessions,
}
