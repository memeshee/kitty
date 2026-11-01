//! `GET /health`: liveness plus a chain head, and never a 5xx.
//!
//! The process being up matters even when the public RPC is having a bad minute,
//! so an unreachable chain degrades to `chain_head: null` instead of failing the
//! check that a load balancer uses to kill the instance.

use std::time::Duration;

use axum::extract::State;
use axum::Json;
use serde::Serialize;
use tracing::warn;

use crate::state::AppState;

const CHAIN_PROBE_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub chain_head: Option<u64>,
    pub network: String,
}

pub async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    let chain_head =
        match tokio::time::timeout(CHAIN_PROBE_TIMEOUT, state.chain.block_number()).await {
            Ok(Ok(head)) => Some(head),
            Ok(Err(err)) => {
                warn!(error = %err, "health: chain head unavailable");
                None
            }
            Err(_) => {
                warn!("health: chain head probe timed out");
                None
            }
        };

    Json(HealthResponse {
        ok: true,
        chain_head,
        network: state.chain.network().to_string(),
    })
}
