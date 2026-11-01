//! Shared application state handed to every handler.

use std::sync::Arc;

use sqlx::SqlitePool;

use crate::chain::ChainClient;
use crate::config::Config;

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub chain: ChainClient,
    pub config: Arc<Config>,
}

impl AppState {
    pub fn new(db: SqlitePool, chain: ChainClient, config: Config) -> Self {
        Self {
            db,
            chain,
            config: Arc::new(config),
        }
    }
}
