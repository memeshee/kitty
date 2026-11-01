//! `POST /goals/{id}/thanks`: the owner's public note to contributors.

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use serde::Serialize;

use crate::auth;
use crate::db;
use crate::domain::{CreateThanksRequest, ThanksView};
use crate::error::ApiError;
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct ThanksEnvelope {
    pub thanks: ThanksView,
}

pub async fn create_thanks(
    State(state): State<AppState>,
    Path(id): Path<String>,
    headers: HeaderMap,
    body: Result<Json<CreateThanksRequest>, JsonRejection>,
) -> Result<(StatusCode, Json<ThanksEnvelope>), ApiError> {
    let goal = db::goal_by_id(&state.db, &id)
        .await?
        .ok_or_else(|| ApiError::goal_not_found(&id))?;
    auth::require_owner(&headers, &goal)?;

    let body = body?.0.body()?;
    let row = db::insert_thanks(&state.db, &id, &body).await?;

    Ok((
        StatusCode::CREATED,
        Json(ThanksEnvelope {
            thanks: ThanksView::from(&row),
        }),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{create_goal, request, test_state, TEST_OWNER, TEST_TOKEN};
    use axum::http::Method;
    use serde_json::json;

    #[tokio::test]
    async fn thanks_needs_the_owner_token() {
        let (state, _stub) = test_state("thanks_auth").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();
        let uri = format!("/v1/goals/{id}/thanks");

        let (status, body) = request(
            &app,
            Method::POST,
            &uri,
            Some(json!({"body": "Thank you all, we made term one."})),
            &[],
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "owner_token_invalid");

        let (status, body) = request(
            &app,
            Method::POST,
            &uri,
            Some(json!({"body": "Thank you all, we made term one."})),
            &[("x-owner-token", &"b".repeat(64))],
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["error"]["code"], "owner_token_invalid");

        let (status, body) = request(
            &app,
            Method::POST,
            &uri,
            Some(json!({"body": "Thank you all, we made term one."})),
            &[("x-owner-token", TEST_TOKEN)],
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(body["thanks"]["goal_id"], id);
        assert_eq!(body["thanks"]["body"], "Thank you all, we made term one.");

        let (status, detail) =
            request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(detail["thanks"].as_array().expect("thanks").len(), 1);
    }

    #[tokio::test]
    async fn thanks_body_is_bounded() {
        let (state, _stub) = test_state("thanks_long").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id");

        let (status, body) = request(
            &app,
            Method::POST,
            &format!("/v1/goals/{id}/thanks"),
            Some(json!({"body": "x".repeat(281)})),
            &[("x-owner-token", TEST_TOKEN)],
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(body["error"]["code"], "validation_error");
    }
}
