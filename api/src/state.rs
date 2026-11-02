//! Shared application state handed to every handler.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use sqlx::SqlitePool;

use crate::chain::ChainClient;
use crate::config::Config;

/// How often one goal may be swept for payments the client never reported. The
/// sweep is a chain read, so a popular jar must not turn page views into RPC load.
pub const SWEEP_INTERVAL: Duration = Duration::from_secs(20);

#[derive(Clone)]
pub struct AppState {
    pub db: SqlitePool,
    pub chain: ChainClient,
    pub config: Arc<Config>,
    sweeps: Arc<Mutex<HashMap<String, Instant>>>,
}

impl AppState {
    pub fn new(db: SqlitePool, chain: ChainClient, config: Config) -> Self {
        Self {
            db,
            chain,
            config: Arc::new(config),
            sweeps: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// True at most once per [`SWEEP_INTERVAL`] for a key. The first caller wins and
    /// does the chain read; everyone else is served from the index as it stands.
    pub fn claim_sweep(&self, key: &str) -> bool {
        let mut guard = self
            .sweeps
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if let Some(last) = guard.get(key) {
            if last.elapsed() < SWEEP_INTERVAL {
                return false;
            }
        }
        // Cheap bound: this is a throttle, not a store.
        if guard.len() > 4096 {
            guard.clear();
        }
        guard.insert(key.to_string(), Instant::now());
        true
    }

    /// Test hook: forget every sweep claim so a test can force one.
    pub fn reset_sweeps(&self) {
        self.sweeps
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
    }
}
