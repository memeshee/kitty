//! HTTP surface. Everything here is thin: parse, delegate, serialise.

pub mod contributions;
pub mod goals;
pub mod health;
pub mod stats;
pub mod thanks;

use std::time::Duration;

use axum::http::{header, HeaderName, HeaderValue, Method, StatusCode};
use axum::routing::{get, post};
use axum::Router;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::error::ApiError;
use crate::state::AppState;

/// The whole app, including CORS and request tracing, so tests exercise the same
/// stack that runs in production.
pub fn app(state: AppState) -> Router {
    let cors = cors_layer(&state.config);

    Router::new()
        // `/health` is documented at the root; the alias under /v1 keeps clients
        // that join the base URL naively from 404ing.
        .route("/health", get(health::health))
        .route("/v1/health", get(health::health))
        .nest(
            "/v1",
            Router::new()
                .route("/goals", get(goals::list_goals).post(goals::create_goal))
                .route("/goals/{id}", get(goals::get_goal))
                .route(
                    "/goals/{id}/contributions",
                    post(contributions::create_contribution),
                )
                .route("/goals/{id}/thanks", post(thanks::create_thanks))
                .route("/goals/{id}/close", post(goals::close_goal))
                .route("/stats", get(stats::stats)),
        )
        .fallback(not_found)
        .with_state(state)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
}

async fn not_found() -> ApiError {
    ApiError::new(StatusCode::NOT_FOUND, "not_found", "no such endpoint")
}

fn cors_layer(cfg: &Config) -> CorsLayer {
    let layer = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            HeaderName::from_static("x-owner-token"),
        ])
        .max_age(Duration::from_secs(600));

    if cfg.allowed_origins.iter().any(|origin| origin == "*") {
        layer.allow_origin(Any)
    } else {
        let origins: Vec<HeaderValue> = cfg
            .allowed_origins
            .iter()
            .filter_map(|origin| origin.parse().ok())
            .collect();
        layer.allow_origin(origins)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::chain::ChainClient;
    use crate::test_support::{request, temp_db_url, test_pool, test_state};
    use serde_json::json;

    #[tokio::test]
    async fn health_reports_the_chain_head_and_network() {
        let (state, _stub) = test_state("health_ok").await;
        let app = app(state);

        let (status, body) = request(&app, Method::GET, "/health", None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["ok"], true);
        assert_eq!(body["chain_head"], 65_762_000);
        assert_eq!(body["network"], "mainnet");

        // The /v1 alias exists because clients join the base URL naively.
        let (status, body) = request(&app, Method::GET, "/v1/health", None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["chain_head"], 65_762_000);
    }

    #[tokio::test]
    async fn health_degrades_instead_of_failing_when_the_rpc_is_down() {
        let db_url = temp_db_url("health_down");
        let pool = test_pool(&db_url).await;
        let cfg = Config {
            database_url: db_url,
            rpc_url: "http://127.0.0.1:1".to_string(), // nothing listens here
            ..Config::default()
        };
        let chain = ChainClient::new(&cfg).expect("chain client");
        let app = app(AppState::new(pool, chain, cfg));

        let (status, body) = request(&app, Method::GET, "/health", None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["ok"], true);
        assert!(body["chain_head"].is_null());
        assert_eq!(body["network"], "mainnet");
    }

    #[tokio::test]
    async fn unknown_routes_return_the_structured_error() {
        let (state, _stub) = test_state("route_404").await;
        let app = app(state);

        let (status, body) = request(&app, Method::GET, "/v1/nope", None, &[]).await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(body["error"]["code"], "not_found");
    }

    #[tokio::test]
    async fn stats_report_zeroes_on_an_empty_database() {
        let (state, _stub) = test_state("stats_empty").await;
        let app = app(state);

        let (status, body) = request(&app, Method::GET, "/v1/stats", None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body,
            json!({
                "goals": 0,
                "contributions": 0,
                "distinct_contributors": 0,
                "total_luna": "0",
                "verified_at": body["verified_at"].clone(),
            })
        );
        assert!(body["verified_at"]
            .as_str()
            .expect("timestamp")
            .ends_with('Z'));
    }
}
