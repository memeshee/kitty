//! Structured API errors.
//!
//! Every failure leaves the process as `{"error": {"code": "...", "message": "..."}}`
//! with a stable machine-readable code, so the Mini App can branch on the code and
//! show its own copy instead of parsing English.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::chain::ChainError;

#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Debug, Serialize)]
pub struct ErrorDetail {
    pub code: &'static str,
    pub message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self::new(StatusCode::BAD_REQUEST, "validation_error", message)
    }

    pub fn goal_not_found(id: &str) -> Self {
        Self::new(
            StatusCode::NOT_FOUND,
            "goal_not_found",
            format!("no goal with id {id}"),
        )
    }

    pub fn owner_token_invalid() -> Self {
        Self::new(
            StatusCode::FORBIDDEN,
            "owner_token_invalid",
            "X-Owner-Token does not match this goal",
        )
    }

    pub fn duplicate() -> Self {
        Self::new(
            StatusCode::CONFLICT,
            "duplicate",
            "this transaction is already recorded against a goal",
        )
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "internal_error", message)
    }

    pub fn body(&self) -> ErrorBody {
        ErrorBody {
            error: ErrorDetail {
                code: self.code,
                message: self.message.clone(),
            },
        }
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.code, self.message)
    }
}

impl std::error::Error for ApiError {}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.body())).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(err: sqlx::Error) -> Self {
        // The detail goes to the log, never to the caller.
        tracing::error!(error = %err, "database error");
        ApiError::internal("storage error")
    }
}

impl From<ChainError> for ApiError {
    fn from(err: ChainError) -> Self {
        tracing::warn!(error = %err, "chain read failed");
        ApiError::new(
            StatusCode::BAD_GATEWAY,
            "chain_unavailable",
            "could not read the Nimiq chain; retry shortly",
        )
    }
}

impl From<axum::extract::rejection::JsonRejection> for ApiError {
    fn from(err: axum::extract::rejection::JsonRejection) -> Self {
        ApiError::validation(format!("invalid JSON body: {}", err.body_text()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialises_the_documented_error_envelope() {
        let err = ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, "wrong_memo", "no memo");
        let json = serde_json::to_value(err.body()).expect("serialisable");
        assert_eq!(json["error"]["code"], "wrong_memo");
        assert_eq!(json["error"]["message"], "no memo");
    }
}
