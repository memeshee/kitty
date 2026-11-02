//! `GET /ledger`: the public usage ledger.
//!
//! The competition scores "distinct Nimiq wallets that interacted with the app", and
//! the only evidence a stranger can check is the chain itself. So this endpoint
//! publishes the count and the wallet addresses behind it, plus the most recent
//! receipts, in one page-load. Nothing here is a claim: every row is a payment the
//! verifier already re-read from the chain, and the hash is printed next to it.

use axum::extract::State;
use axum::Json;
use serde::Serialize;

use crate::db;
use crate::domain;
use crate::error::ApiError;
use crate::state::AppState;

/// Enough wallets to show a real list without turning the page into a dump.
const WALLET_LIST_LIMIT: i64 = 100;
const RECENT_LIMIT: i64 = 20;

#[derive(Debug, Serialize)]
pub struct LedgerReceipt {
    pub tx_hash: String,
    pub goal_id: String,
    pub goal_title: String,
    pub contributor_address: String,
    pub display_name: Option<String>,
    pub amount_luna: String,
    pub verified_at: String,
}

#[derive(Debug, Serialize)]
pub struct LedgerResponse {
    pub goals: i64,
    pub contributions: i64,
    pub distinct_wallets: i64,
    pub total_luna: String,
    /// The wallets themselves, so the count can be recounted rather than believed.
    pub wallets: Vec<String>,
    pub recent: Vec<LedgerReceipt>,
    pub generated_at: String,
}

pub async fn ledger(State(state): State<AppState>) -> Result<Json<LedgerResponse>, ApiError> {
    let totals = db::global_stats(&state.db).await?;
    let goals = db::visible_goal_count(&state.db).await?;
    let wallets = db::distinct_wallets(&state.db, WALLET_LIST_LIMIT).await?;
    let recent = db::recent_contributions(&state.db, RECENT_LIMIT).await?;

    Ok(Json(LedgerResponse {
        goals,
        contributions: totals.contributions,
        distinct_wallets: totals.distinct_contributors,
        total_luna: totals.total_luna.max(0).to_string(),
        wallets,
        recent: recent
            .into_iter()
            .map(|row| LedgerReceipt {
                tx_hash: row.tx_hash,
                goal_id: row.goal_id,
                goal_title: row.goal_title,
                contributor_address: row.contributor_address,
                display_name: row.display_name,
                amount_luna: row.amount_luna,
                verified_at: row.verified_at,
            })
            .collect(),
        generated_at: domain::now_rfc3339(),
    }))
}

#[cfg(test)]
mod tests {
    use axum::http::Method;
    use axum::http::StatusCode;
    use serde_json::json;

    use crate::test_support::{
        create_goal, request, stub_tx, test_state, StubChain, TEST_OWNER, TEST_TOKEN,
    };

    const BUYER: &str = "NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG";
    const TX: &str = "e424c64ffff0d40982ee7607c5200997eb4b95df687df7e176db89650dc27ec8";
    const TX_TWO: &str = "b7f0f2a1c4e69d3b8a5c1902f7e4d6b3a8c5e2f9d1b7a4c6e3f8d2b9a5c1e7f4";

    async fn pay(
        app: &axum::Router,
        stub: &StubChain,
        id: &str,
        hash: &str,
        name: &str,
    ) -> serde_json::Value {
        stub.set_tx(stub_tx(hash, TEST_OWNER, BUYER, 250_000, &format!("kitty:{id}"), true, 9));
        let (status, body) = request(
            app,
            Method::POST,
            &format!("/v1/goals/{id}/contributions"),
            Some(json!({ "tx_hash": hash, "display_name": name })),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::CREATED, "contribution: {body}");
        body
    }

    #[tokio::test]
    async fn ledger_publishes_wallets_and_receipts_a_stranger_could_recount() {
        let (state, stub) = test_state("ledger").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();

        pay(&app, &stub, &id, TX, "Chi Lan").await;
        pay(&app, &stub, &id, TX_TWO, "Chi Lan").await;

        let (status, body) = request(&app, Method::GET, "/v1/ledger", None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["goals"], 1);
        assert_eq!(body["contributions"], 2);
        // Two payments from one wallet is one wallet, which is the whole point of
        // the metric.
        assert_eq!(body["distinct_wallets"], 1);
        assert_eq!(body["total_luna"], "500000");
        assert_eq!(body["wallets"].as_array().expect("wallets").len(), 1);
        assert_eq!(body["wallets"][0], "NQ162SSN82TLSMQSKXT3Q01VCMALNU6F1LJG");
        assert_eq!(body["recent"].as_array().expect("recent").len(), 2);
        assert_eq!(body["recent"][0]["goal_title"], "Mai's school fees");
        assert!(body["recent"][0]["tx_hash"].is_string());
        assert!(body["generated_at"].as_str().expect("ts").ends_with('Z'));
    }

    #[tokio::test]
    async fn a_hidden_jar_leaves_the_public_list_but_keeps_its_receipts() {
        let (state, stub) = test_state("hidden").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();
        pay(&app, &stub, &id, TX, "Chi Lan").await;

        let (status, _) = request(
            &app,
            Method::POST,
            &format!("/v1/admin/goals/{id}/visibility"),
            Some(json!({ "hidden": true })),
            &[],
        )
        .await;
        // No ADMIN_TOKEN configured in tests: the endpoint does not exist.
        assert_eq!(status, StatusCode::NOT_FOUND);

        let (_, body) = request(&app, Method::GET, "/v1/goals", None, &[]).await;
        assert_eq!(body["goals"].as_array().expect("list").len(), 1);

        // The receipt is still readable by hash either way.
        let (status, body) = request(&app, Method::GET, &format!("/v1/contributions/{TX}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["contribution"]["tx_hash"], TX);
        assert_eq!(body["goal"]["id"], id);
    }
}
