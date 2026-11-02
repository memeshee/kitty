//! `POST /goals/{id}/contributions`: the write path that the verifier owns.
//!
//! The handler only enforces the goal's state and shapes the response; every fact
//! about the payment comes from [`crate::verifier`].

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::db;
use crate::domain::{self, ContributionView, CreateContributionRequest, GoalView};
use crate::error::{ApiError, ErrorDetail};
use crate::state::AppState;
use crate::verifier::{self, CODE_PENDING};

#[derive(Debug, Serialize)]
pub struct ContributionEnvelope {
    pub contribution: ContributionView,
    pub goal: GoalView,
}

/// A pending contribution is stored and shown, but the caller is told plainly that
/// it does not count yet, so a client cannot mistake a mempool entry for money.
#[derive(Debug, Serialize)]
pub struct PendingEnvelope {
    pub error: ErrorDetail,
    pub contribution: ContributionView,
    pub goal: GoalView,
}

pub async fn create_contribution(
    State(state): State<AppState>,
    Path(id): Path<String>,
    body: Result<Json<CreateContributionRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let goal = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;

    if goal.status == domain::GOAL_CLOSED {
        return Err(ApiError::new(
            StatusCode::CONFLICT,
            "goal_closed",
            "this goal is closed and no longer accepts contributions",
        ));
    }

    let body = body?.0;
    let tx_hash = body.tx_hash()?;
    let display_name = body.display_name()?;
    let note = body.note()?;

    let recorded = verifier::verify_and_record(
        &state,
        &goal,
        &tx_hash,
        display_name.as_deref(),
        note.as_deref(),
    )
    .await?;

    // Re-read so the caller sees the jar as it is *after* this contribution.
    let goal = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;

    let contribution = ContributionView::from_row(&recorded.row);
    let goal = GoalView::from_record(&goal, &state.config);

    let response = if recorded.pending {
        let error = ApiError::new(
            StatusCode::ACCEPTED,
            CODE_PENDING,
            "the transaction is not confirmed yet; it is stored and will count once it is mined",
        )
        .body()
        .error;
        let envelope = PendingEnvelope {
            error,
            contribution,
            goal,
        };
        (StatusCode::ACCEPTED, Json(envelope)).into_response()
    } else {
        let envelope = ContributionEnvelope { contribution, goal };
        (StatusCode::CREATED, Json(envelope)).into_response()
    };

    Ok(response)
}

/// `GET /contributions/{hash}`: one receipt, resolved by the chain's own hash.
///
/// A receipt is the artifact a contributor can forward into the group chat, so it
/// has to be readable by anyone, forever, without an account. The hash is the key:
/// if the index has it, this returns the payment exactly as it was verified.
pub async fn get_contribution(
    State(state): State<AppState>,
    Path(hash): Path<String>,
) -> Result<Json<ReceiptEnvelope>, ApiError> {
    let tx_hash = hash.trim().to_ascii_lowercase();
    if tx_hash.len() != 64 || !tx_hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(ApiError::new(
            StatusCode::NOT_FOUND,
            "receipt_not_found",
            "no receipt with that hash",
        ));
    }

    let row = db::contribution_by_hash(&state.db, &tx_hash)
        .await?
        .ok_or_else(|| {
            ApiError::new(
                StatusCode::NOT_FOUND,
                "receipt_not_found",
                "no receipt with that hash",
            )
        })?;

    let goal = db::goal_by_id(&state.db, &row.goal_id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&row.goal_id))?;

    Ok(Json(ReceiptEnvelope {
        contribution: ContributionView::from_row(&row),
        goal: GoalView::from_record(&goal, &state.config),
    }))
}

#[derive(Debug, Serialize)]
pub struct ReceiptEnvelope {
    pub contribution: ContributionView,
    pub goal: GoalView,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{create_goal, request, stub_tx, test_state, TEST_OWNER, TEST_TOKEN};
    use axum::http::Method;
    use serde_json::json;

    const TX: &str = "e424c64ffff0d40982ee7607c5200997eb4b95df687df7e176db89650dc27ec8";
    const SENDER: &str = "NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG";

    async fn goal_with_a_payment(
        name: &str,
        value_luna: u64,
        confirmations: i64,
    ) -> (axum::Router, crate::test_support::StubChain, String) {
        let (state, stub) = test_state(name).await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();
        stub.set_tx(stub_tx(
            TX,
            TEST_OWNER,
            SENDER,
            value_luna,
            &format!("kitty:{id}"),
            true,
            confirmations,
        ));
        (app, stub, id)
    }

    #[tokio::test]
    async fn http_contribution_records_the_chain_value() {
        let (app, _stub, id) = goal_with_a_payment("http_contribution", 154_558, 11).await;

        // The client claims 999999 Luna; the chain says 154558. The chain wins.
        let (status, body) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/contributions"),
            Some(json!({
                "tx_hash": TX,
                "display_name": "Chi Lan",
                "note": "for the books",
                "amount_luna": "999999",
            })),
            &[],
        )
        .await;

        assert_eq!(status, StatusCode::CREATED, "body: {body}");
        assert_eq!(body["contribution"]["amount_luna"], "154558");
        assert_eq!(
            body["contribution"]["contributor_address"],
            "NQ162SSN82TLSMQSKXT3Q01VCMALNU6F1LJG"
        );
        assert_eq!(body["contribution"]["confirmations"], 11);
        assert_eq!(body["contribution"]["block_number"], 65_761_764);
        assert_eq!(body["contribution"]["status"], "confirmed");
        assert_eq!(body["contribution"]["display_name"], "Chi Lan");
        assert_eq!(
            body["contribution"]["explorer_url"],
            format!("https://nimiq.watch/#{TX}")
        );
        assert_eq!(body["goal"]["raised_luna"], "154558");
        assert_eq!(body["goal"]["contributors_count"], 1);

        let (status, detail) =
            request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(detail["contributions"].as_array().expect("rows").len(), 1);
        assert_eq!(detail["stats"]["contributions_count"], 1);
        assert_eq!(detail["stats"]["average_luna"], "154558");
        assert!(detail["stats"]["last_contribution_at"].is_string());
    }

    #[tokio::test]
    async fn http_duplicate_hash_is_409() {
        let (app, _stub, id) = goal_with_a_payment("http_duplicate", 154_558, 11).await;
        let uri = format!("/v1/goals/{id}/contributions");
        let body = json!({"tx_hash": TX});

        let (status, _) = request(&app, Method::POST, &uri, Some(body.clone()), &[]).await;
        assert_eq!(status, StatusCode::CREATED);

        let (status, error) = request(&app, Method::POST, &uri, Some(body), &[]).await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(error["error"]["code"], "duplicate");
    }

    #[tokio::test]
    async fn http_pending_is_202_and_still_visible() {
        let (app, _stub, id) = goal_with_a_payment("http_pending", 500_000, 0).await;

        let (status, body) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/contributions"),
            Some(json!({"tx_hash": TX})),
            &[],
        )
        .await;

        assert_eq!(status, StatusCode::ACCEPTED);
        assert_eq!(body["error"]["code"], "pending");
        assert_eq!(body["contribution"]["status"], "pending");
        assert_eq!(body["contribution"]["confirmations"], 0);
        assert_eq!(
            body["goal"]["raised_luna"], "0",
            "pending money is not in the jar"
        );

        let (status, detail) =
            request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(detail["contributions"].as_array().expect("rows").len(), 1);
        assert_eq!(detail["stats"]["contributions_count"], 0);
    }

    #[tokio::test]
    async fn http_unknown_hash_is_tx_not_found() {
        let (state, stub) = test_state("http_not_found").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id");
        stub.clear_tx();

        let (status, body) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/contributions"),
            Some(json!({"tx_hash": TX})),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
        assert_eq!(body["error"]["code"], "tx_not_found");
    }

    #[tokio::test]
    async fn http_closed_goal_refuses_contributions() {
        let (app, _stub, id) = goal_with_a_payment("http_closed", 154_558, 11).await;

        let (status, _) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/close"),
            None,
            &[("x-owner-token", TEST_TOKEN)],
        )
        .await;
        assert_eq!(status, StatusCode::OK);

        let (status, body) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/contributions"),
            Some(json!({"tx_hash": TX})),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error"]["code"], "goal_closed");
    }

    #[tokio::test]
    async fn http_reconciliation_flags_a_wallet_that_is_short() {
        let (state, stub) = test_state("http_short_wallet").await;
        stub.set_account(100_000, 65_761_800); // 100000 Luna in the wallet
        let app = crate::routes::app(state);

        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();
        stub.set_tx(stub_tx(
            TX,
            TEST_OWNER,
            SENDER,
            154_558,
            &format!("kitty:{id}"),
            true,
            11,
        ));

        let (status, _) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/contributions"),
            Some(json!({"tx_hash": TX})),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);

        let (status, detail) =
            request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        let reconciliation = &detail["reconciliation"];
        assert_eq!(reconciliation["balance_luna"], "100000");
        assert_eq!(reconciliation["indexed_luna"], "154558");
        assert_eq!(reconciliation["unindexed_luna"], "0");
        assert_eq!(
            reconciliation["matches"], false,
            "the index claims more than the wallet holds"
        );
    }

    #[tokio::test]
    async fn http_malformed_tx_hash_is_rejected_before_any_chain_call() {
        let (app, stub, id) = goal_with_a_payment("http_bad_hash", 154_558, 11).await;

        let (status, body) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/contributions"),
            Some(json!({"tx_hash": "not-a-hash"})),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "validation_error");
        assert_eq!(stub.calls("getTransactionByHash"), 0);
    }
}
