//! Goal creation, reading, listing and closing.

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::{Deserialize, Serialize};
use tracing::warn;

use crate::auth;
use crate::db;
use crate::domain::{
    self, ContributionView, CreateGoalRequest, GoalStatsView, GoalView, Reconciliation, ThanksView,
};
use crate::error::ApiError;
use crate::state::AppState;
use crate::sweep;

const MAX_GOALS_LISTED: i64 = 50;
const GOAL_ID_ATTEMPTS: usize = 8;

#[derive(Debug, Serialize)]
pub struct GoalEnvelope {
    pub goal: GoalView,
}

#[derive(Debug, Serialize)]
pub struct GoalsEnvelope {
    pub goals: Vec<GoalView>,
}

#[derive(Debug, Serialize)]
pub struct GoalDetail {
    pub goal: GoalView,
    pub contributions: Vec<ContributionView>,
    pub thanks: Vec<ThanksView>,
    /// `null` only when the chain read failed; the page still renders.
    pub reconciliation: Option<Reconciliation>,
    pub stats: GoalStatsView,
}

#[derive(Debug, Deserialize)]
pub struct ListGoalsQuery {
    #[serde(default)]
    pub owner: Option<String>,
}

pub async fn create_goal(
    State(state): State<AppState>,
    body: Result<Json<CreateGoalRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<GoalEnvelope>), ApiError> {
    let request = body?.0;
    let new_goal = request.validate(chrono::Utc::now().date_naive())?;

    // Ids are random, so a collision is a lottery ticket, not a condition; retry a
    // few times and then admit defeat rather than loop forever.
    let mut record = None;
    for _ in 0..GOAL_ID_ATTEMPTS {
        let id = domain::new_goal_id();
        match db::insert_goal(&state.db, &id, &new_goal).await {
            Ok(()) => {
                record = db::goal_by_id(&state.db, &id).await?.map(|row| (id, row));
                break;
            }
            Err(err) if db::is_unique_violation(&err) => continue,
            Err(err) => return Err(err.into()),
        }
    }

    let (_, record) = record.ok_or_else(|| ApiError::internal("could not allocate a goal id"))?;
    Ok((
        StatusCode::CREATED,
        Json(GoalEnvelope {
            goal: GoalView::from_record(&record, &state.config),
        }),
    ))
}

pub async fn get_goal(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<GoalDetail>, ApiError> {
    // Ids are opaque to clients, but the alphabet is part of the contract: a
    // malformed one cannot exist, so there is no reason to ask the database.
    if !domain::is_valid_goal_id(&id) {
        return Err(ApiError::goal_not_found(&id));
    }

    let record = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;

    // Self-repair before the page is composed, so a payment whose client never
    // reported back is already in the receipts on this load, not the next one.
    // Bounded to one chain read per goal per SWEEP_INTERVAL.
    sweep::sweep_goal(&state, &record).await;

    // Re-read: the sweep may have added rows, and the aggregates come from them.
    let record = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;

    let contributions = db::contributions_for_goal(&state.db, &id).await?;
    let thanks = db::thanks_for_goal(&state.db, &id).await?;
    let stats = db::stats_for_goal(&state.db, &id).await?;

    let reconciliation = reconcile(&state, &record.owner_address, stats.total_luna).await;

    let contribution_views: Vec<ContributionView> = contributions
        .iter()
        .map(ContributionView::from_row)
        .collect();

    Ok(Json(GoalDetail {
        goal: GoalView::from_record(&record, &state.config),
        contributions: contribution_views,
        thanks: thanks.iter().map(ThanksView::from).collect(),
        reconciliation,
        stats: GoalStatsView {
            contributors_count: stats.contributors_count,
            contributions_count: stats.contributions_count,
            average_luna: if stats.contributions_count > 0 {
                (stats.total_luna / stats.contributions_count).to_string()
            } else {
                "0".to_string()
            },
            last_contribution_at: stats.last_contribution_at,
        },
    }))
}

pub async fn list_goals(
    State(state): State<AppState>,
    Query(query): Query<ListGoalsQuery>,
) -> Result<Json<GoalsEnvelope>, ApiError> {
    let owner = match query.owner.as_deref().map(str::trim) {
        Some(raw) if !raw.is_empty() => {
            let owner = domain::normalise_address(raw);
            if !domain::is_valid_address(&owner) {
                return Err(ApiError::validation("owner is not a valid Nimiq address"));
            }
            Some(owner)
        }
        _ => None,
    };

    let records = db::goals_by_owner(&state.db, owner.as_deref(), MAX_GOALS_LISTED).await?;
    Ok(Json(GoalsEnvelope {
        goals: records
            .iter()
            .map(|record| GoalView::from_record(record, &state.config))
            .collect(),
    }))
}

pub async fn close_goal(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<GoalEnvelope>, ApiError> {
    let record = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;
    auth::require_owner(&headers, &record)?;

    // Closing twice is not an error: the caller wanted it closed, it is closed.
    if record.status != domain::GOAL_CLOSED {
        db::set_goal_status(&state.db, &id, domain::GOAL_CLOSED).await?;
    }

    let record = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;
    Ok(Json(GoalEnvelope {
        goal: GoalView::from_record(&record, &state.config),
    }))
}

#[derive(Debug, Deserialize)]
pub struct VisibilityRequest {
    pub hidden: bool,
}

/// `POST /goals/{id}/edit`: the owner fixes what they typed.
///
/// A jar is three fields typed on a phone, and a typo in the title is the sort of
/// thing that makes someone delete a collection and start again. The token decides
/// who may edit; the ledger is untouched, because nothing here can move a coin.
pub async fn edit_goal(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Result<Json<domain::UpdateGoalRequest>, JsonRejection>,
) -> Result<Json<GoalEnvelope>, ApiError> {
    let record = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;
    auth::require_owner(&headers, &record)?;

    let edit = body?.0.validate(chrono::Utc::now().date_naive())?;

    db::replace_goal_fields(
        &state.db,
        &id,
        edit.title.as_deref().unwrap_or(&record.title),
        edit.story.as_deref().unwrap_or(&record.story),
        edit.target_luna.as_deref().unwrap_or(&record.target_luna),
        edit.deadline.as_deref().unwrap_or(&record.deadline),
    )
    .await?;

    let record = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;
    Ok(Json(GoalEnvelope {
        goal: GoalView::from_record(&record, &state.config),
    }))
}

/// `POST /admin/goals/{id}/visibility`: take a jar in or out of the public list.
///
/// Guarded by `ADMIN_TOKEN`. When that is unset the route answers 404 rather than
/// pretending to be a disabled endpoint, so a deployment without an operator token
/// has no admin surface at all. Hiding never touches receipts: it only decides
/// whether the jar is advertised on the front page.
pub async fn set_goal_visibility(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Result<Json<VisibilityRequest>, JsonRejection>,
) -> Result<Json<GoalEnvelope>, ApiError> {
    let expected = match state.config.admin_token.as_deref() {
        Some(token) => token,
        None => {
            return Err(ApiError::new(
                StatusCode::NOT_FOUND,
                "not_found",
                "no such endpoint",
            ))
        }
    };

    let presented = headers
        .get("x-admin-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !constant_time_eq(presented.as_bytes(), expected.as_bytes()) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "admin_token_invalid",
            "X-Admin-Token does not match",
        ));
    }

    if !domain::is_valid_goal_id(&id) {
        return Err(ApiError::goal_not_found(&id));
    }
    db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;

    db::set_goal_hidden(&state.db, &id, body?.0.hidden).await?;

    let record = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;
    Ok(Json(GoalEnvelope {
        goal: GoalView::from_record(&record, &state.config),
    }))
}

/// Length-checked comparison that does not return early on the first wrong byte.
fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut difference = 0u8;
    for (a, b) in left.iter().zip(right) {
        difference |= a ^ b;
    }
    difference == 0
}

/// Reads the owner's real balance and compares it with what we indexed.
///
/// `matches` is `balance >= indexed`, not `==`: an owner may keep other money in
/// the same wallet, and a jar must never be called fraudulent for that. A pending
/// contribution counts for nothing on either side, because it is not in the balance
/// yet either.
async fn reconcile(
    state: &AppState,
    owner_address: &str,
    indexed_luna: i64,
) -> Option<Reconciliation> {
    let account = match state.chain.get_account_cached(owner_address).await {
        Ok(account) => account,
        Err(err) => {
            warn!(error = %err, owner = owner_address, "reconciliation unavailable");
            return None;
        }
    };

    let (balance_luna, block_number, checked_at) = match account {
        Some(account) => (
            account.balance_luna,
            account.block_number.unwrap_or(0),
            account.checked_at,
        ),
        // A wallet that has never been funded has no account on chain yet.
        None => ("0".to_string(), 0, domain::now_rfc3339()),
    };

    let balance = domain::parse_luna(&balance_luna).unwrap_or(0) as i64;
    let unindexed = (balance - indexed_luna).max(0);

    Some(Reconciliation {
        balance_luna,
        indexed_luna: indexed_luna.to_string(),
        unindexed_luna: unindexed.to_string(),
        block_number,
        checked_at,
        matches: balance >= indexed_luna,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{create_goal, request, test_state, TEST_OWNER, TEST_TOKEN};
    use axum::http::Method;
    use serde_json::json;

    fn deadline_in(days: i64) -> String {
        (chrono::Utc::now().date_naive() + chrono::Duration::days(days))
            .format("%Y-%m-%d")
            .to_string()
    }

    fn goal_body(owner: &str, title: &str) -> serde_json::Value {
        json!({
            "owner_address": owner,
            "owner_token": TEST_TOKEN,
            "title": title,
            "story": "Two terms, one jar.",
            "target_luna": "4000000000",
            "deadline": deadline_in(30),
            "accent": "amber",
        })
    }

    #[tokio::test]
    async fn creates_and_reads_a_goal() {
        let (state, stub) = test_state("goal_roundtrip").await;
        stub.set_account(300_000_000, 65_761_800);
        let app = crate::routes::app(state);

        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        assert_eq!(
            goal["owner_address"],
            "NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK"
        );
        assert_eq!(goal["status"], "open");
        assert_eq!(goal["raised_luna"], "0");
        assert_eq!(goal["contributors_count"], 0);
        assert_eq!(goal["target_luna"], "4000000000");

        let id = goal["id"].as_str().expect("id").to_string();
        assert_eq!(goal["memo"], format!("kitty:{id}"));
        assert_eq!(goal["share_url"], format!("https://kitty.example/g/{id}"));

        let (status, detail) =
            request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(detail["goal"]["id"], id);
        assert_eq!(detail["contributions"].as_array().expect("array").len(), 0);
        assert_eq!(detail["thanks"].as_array().expect("array").len(), 0);

        let reconciliation = &detail["reconciliation"];
        assert_eq!(reconciliation["balance_luna"], "300000000");
        assert_eq!(reconciliation["indexed_luna"], "0");
        assert_eq!(reconciliation["unindexed_luna"], "300000000");
        assert_eq!(reconciliation["block_number"], 65_761_800);
        assert_eq!(reconciliation["matches"], true);

        assert_eq!(detail["stats"]["contributions_count"], 0);
        assert_eq!(detail["stats"]["average_luna"], "0");
        assert!(detail["stats"]["last_contribution_at"].is_null());
    }

    #[tokio::test]
    async fn rejects_a_title_that_is_too_short() {
        let (state, _stub) = test_state("bad_title").await;
        let app = crate::routes::app(state);
        let (status, body) = request(
            &app,
            Method::POST,
            "/v1/goals",
            Some(goal_body(TEST_OWNER, "ab")),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "validation_error");
    }

    #[tokio::test]
    async fn rejects_a_deadline_beyond_a_year() {
        let (state, _stub) = test_state("bad_deadline").await;
        let app = crate::routes::app(state);
        let mut body = goal_body(TEST_OWNER, "Mai's school fees");
        body["deadline"] = json!(deadline_in(400));
        let (status, body) = request(&app, Method::POST, "/v1/goals", Some(body), &[]).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "validation_error");

        let mut past = goal_body(TEST_OWNER, "Mai's school fees");
        past["deadline"] = json!(deadline_in(-1));
        let (status, _body) = request(&app, Method::POST, "/v1/goals", Some(past), &[]).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn rejects_amounts_sent_as_numbers_and_bad_addresses() {
        let (state, _stub) = test_state("bad_amount").await;
        let app = crate::routes::app(state);

        let mut body = goal_body(TEST_OWNER, "Mai's school fees");
        body["target_luna"] = json!(4_000_000_000i64); // a JSON number, not a string
        let (status, error) = request(&app, Method::POST, "/v1/goals", Some(body), &[]).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(error["error"]["code"], "validation_error");

        let mut body = goal_body("NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCJ", "Mai's school fees");
        body["target_luna"] = json!("4000000000");
        let (status, error) = request(&app, Method::POST, "/v1/goals", Some(body), &[]).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(error["error"]["code"], "validation_error");
    }

    #[tokio::test]
    async fn unknown_and_malformed_ids_are_404() {
        let (state, _stub) = test_state("goal_404").await;
        let app = crate::routes::app(state);

        let (status, body) = request(&app, Method::GET, "/v1/goals/k3f9x2ab", None, &[]).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "goal_not_found");

        let (status, body) = request(&app, Method::GET, "/v1/goals/nope!", None, &[]).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "goal_not_found");
    }

    #[tokio::test]
    async fn an_owner_can_fix_a_typo_and_nobody_else_can() {
        let (state, _stub) = test_state("edit_goal").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();

        let (status, body) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/edit"),
            Some(json!({ "title": "Mai's school shoes", "story": "Term starts on the 5th." })),
            &[("x-owner-token", TEST_TOKEN)],
        )
        .await;
        assert_eq!(status, StatusCode::OK, "edit: {body}");
        assert_eq!(body["goal"]["title"], "Mai's school shoes");
        assert_eq!(body["goal"]["story"], "Term starts on the 5th.");
        // Untouched fields keep their value.
        assert_eq!(body["goal"]["target_luna"], "4000000000");

        let (status, _) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/edit"),
            Some(json!({ "title": "Someone else's jar" })),
            &[("x-owner-token", "0".repeat(64).as_str())],
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        let (_, detail) = request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(detail["goal"]["title"], "Mai's school shoes");
    }

    #[tokio::test]
    async fn an_edit_still_rejects_a_nonsense_title() {
        let (state, _stub) = test_state("edit_validation").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();

        let (status, body) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/edit"),
            Some(json!({ "title": "ab" })),
            &[("x-owner-token", TEST_TOKEN)],
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "validation_error");
    }

    #[tokio::test]
    async fn lists_an_owners_goals_newest_first() {
        let (state, _stub) = test_state("goal_list").await;
        let app = crate::routes::app(state);

        let first = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let second = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;

        let (status, body) = request(
            &app,
            Method::GET,
            &format!("/v1/goals?owner={}", TEST_OWNER.replace(' ', "%20")),
            None,
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        let goals = body["goals"].as_array().expect("goals");
        assert_eq!(goals.len(), 2);
        assert_eq!(goals[0]["id"], second["id"]);
        assert_eq!(goals[1]["id"], first["id"]);

        let (status, body) = request(&app, Method::GET, "/v1/goals?owner=NQnope", None, &[]).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "validation_error");
    }

    #[tokio::test]
    async fn reconciliation_reuses_one_chain_read_for_a_hot_page() {
        let (state, stub) = test_state("goal_cache").await;
        stub.set_account(1_000, 65_761_800);
        let app = crate::routes::app(state);

        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id");
        let uri = format!("/v1/goals/{id}");

        for _ in 0..3 {
            let (status, _body) = request(&app, Method::GET, &uri, None, &[]).await;
            assert_eq!(status, StatusCode::OK);
        }

        assert_eq!(
            stub.calls("getAccountByAddress"),
            1,
            "three page loads must not be three RPC reads"
        );
    }

    #[tokio::test]
    async fn a_goal_page_still_renders_when_the_chain_is_down() {
        let db_url = crate::test_support::temp_db_url("goal_chain_down");
        let pool = crate::test_support::test_pool(&db_url).await;
        let cfg = crate::config::Config {
            database_url: db_url,
            rpc_url: "http://127.0.0.1:1".to_string(),
            ..crate::config::Config::default()
        };
        let chain = crate::chain::ChainClient::new(&cfg).expect("client");
        let app = crate::routes::app(crate::state::AppState::new(pool, chain, cfg));

        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id");

        let (status, detail) =
            request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK, "the jar must still render");
        assert!(
            detail["reconciliation"].is_null(),
            "an unreadable chain is reported as null, not as a zero balance"
        );
        assert_eq!(detail["goal"]["id"], id);
    }
}
