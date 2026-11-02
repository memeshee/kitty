//! Runtime configuration, read once at startup.
//!
//! Every value has a working default so `cargo run` just works locally; the
//! environment only has to override what differs in deployment.

use std::env;
use std::time::Duration;

pub const DEFAULT_PORT: u16 = 8080;
pub const DEFAULT_DATABASE_URL: &str = "./kitty.db";
pub const DEFAULT_RPC_URL: &str = "https://rpc.nimiqwatch.com";
pub const DEFAULT_ALLOWED_ORIGINS: &str = "*";
pub const DEFAULT_WEB_BASE_URL: &str = "https://kitty.example/g";
pub const DEFAULT_NETWORK: &str = "mainnet";

/// How long a `getAccountByAddress` result may be reused. A goal page that is
/// being refreshed by a crowd should not multiply into RPC load.
pub const ACCOUNT_CACHE_TTL: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub rpc_url: String,
    /// `["*"]` means any origin; otherwise an explicit allow list.
    pub allowed_origins: Vec<String>,
    /// Prefix used to build `share_url` for a goal.
    pub web_base_url: String,
    pub network: String,
    /// When set, `POST /v1/admin/goals/{id}/visibility` works. Unset means the
    /// endpoint does not exist at all, which is the right default for a public API.
    pub admin_token: Option<String>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: DEFAULT_PORT,
            database_url: DEFAULT_DATABASE_URL.to_string(),
            rpc_url: DEFAULT_RPC_URL.to_string(),
            allowed_origins: vec![DEFAULT_ALLOWED_ORIGINS.to_string()],
            web_base_url: DEFAULT_WEB_BASE_URL.to_string(),
            network: DEFAULT_NETWORK.to_string(),
            admin_token: None,
        }
    }
}

impl Config {
    /// Layers the environment over the defaults. Blank values are treated as unset
    /// so `PORT=` in a compose file cannot silently break startup.
    pub fn from_env() -> Result<Self, ConfigError> {
        let mut cfg = Config::default();

        if let Some(raw) = non_empty("PORT") {
            cfg.port = raw
                .parse()
                .map_err(|_| ConfigError::new(format!("PORT is not a port number: {raw}")))?;
        }
        if let Some(raw) = non_empty("DATABASE_URL") {
            cfg.database_url = raw;
        }
        if let Some(raw) = non_empty("NIMIQ_RPC_URL") {
            cfg.rpc_url = raw;
        }
        if let Some(raw) = non_empty("ALLOWED_ORIGINS") {
            let origins: Vec<String> = raw
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect();
            if !origins.is_empty() {
                cfg.allowed_origins = origins;
            }
        }
        if let Some(raw) = non_empty("WEB_BASE_URL") {
            cfg.web_base_url = raw.trim_end_matches('/').to_string();
        }
        if let Some(raw) = non_empty("NIMIQ_NETWORK") {
            cfg.network = raw;
        }
        if let Some(raw) = non_empty("ADMIN_TOKEN") {
            cfg.admin_token = Some(raw);
        }

        Ok(cfg)
    }

    pub fn share_url(&self, goal_id: &str) -> String {
        format!("{}/{}", self.web_base_url.trim_end_matches('/'), goal_id)
    }
}

fn non_empty(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

#[derive(Debug, thiserror::Error)]
#[error("invalid configuration: {0}")]
pub struct ConfigError(String);

impl ConfigError {
    fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_documented_local_setup() {
        let cfg = Config::default();
        assert_eq!(cfg.port, 8080);
        assert_eq!(cfg.rpc_url, "https://rpc.nimiqwatch.com");
        assert_eq!(cfg.allowed_origins, vec!["*".to_string()]);
    }

    #[test]
    fn share_url_never_doubles_slashes() {
        let cfg = Config {
            web_base_url: "https://kitty.example/g/".to_string(),
            ..Config::default()
        };
        assert_eq!(
            cfg.share_url("k3f9x2ab"),
            "https://kitty.example/g/k3f9x2ab"
        );
    }
}
