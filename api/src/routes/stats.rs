//! `GET /stats`: the one-click audit.
//!
//! Every number is a count or sum of rows that were themselves derived from the
//! chain, so the totals can be reproduced by replaying the indexed transactions.

use axum::extract::State;
use axum::Json;
use serde::Serialize;

use crate::db;
use crate::domain;
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct StatsResponse {
    pub goals: i64,
    pub contributions: i64,
    pub distinct_contributors: i64,
    pub total_luna: String,
    pub verified_at: String,
}

pub async fn stats(State(state): State<AppState>) -> Result<Json<StatsResponse>, ApiError> {
    let totals = db::global_stats(&state.db).await?;

    Ok(Json(StatsResponse {
        goals: totals.goals,
        contributions: totals.contributions,
        distinct_contributors: totals.distinct_contributors,
        total_luna: totals.total_luna.max(0).to_string(),
        verified_at: domain::now_rfc3339(),
    }))
}
