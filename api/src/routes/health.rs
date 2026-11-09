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

/// `GET /ready`: the probe a wake-up needs, and the reason it is not `/health`.
///
/// The process binds its port only after the pool is open and the migrations have
/// run (see `main`), so "listening" already means "ready". This answer therefore
/// costs microseconds and touches nothing — which is what a frontend wants when it
/// fires a speculative request to pull a scaled-to-zero machine out of its snapshot.
/// `/health` stays the honest, chain-reading check for humans and monitors.
#[derive(Debug, Serialize)]
pub struct ReadyResponse {
    pub ok: bool,
}

pub async fn ready() -> Json<ReadyResponse> {
    Json(ReadyResponse { ok: true })
}

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
