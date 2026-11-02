//! Kitty API: a non-custodial goal jar for Nimiq.
//!
//! Kitty never holds funds. Contributors pay the goal owner directly, in NIM, with
//! a memo naming the goal; this service is a public, re-checkable index of those
//! payments. That is why every contribution is read back from the chain before it is
//! stored (see [`verifier`]) and why every goal page shows the owner's real balance
//! next to the indexed total (see `routes::goals`).

mod auth;
mod chain;
mod config;
mod db;
mod domain;
mod error;
mod routes;
mod state;
mod sweep;
mod verifier;

#[cfg(test)]
mod test_support;

use std::net::SocketAddr;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,tower_http=warn")),
        )
        .init();

    let config = Config::from_env()?;

    let pool = db::connect(&config.database_url).await?;
    db::migrate(&pool).await?;

    let chain = chain::ChainClient::new(&config)?;
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let state = AppState::new(pool, chain, config.clone());
    let app = routes::app(state);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(
        port = config.port,
        rpc = %config.rpc_url,
        database = %config.database_url,
        network = %config.network,
        "kitty api listening"
    );

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    if let Err(err) = tokio::signal::ctrl_c().await {
        tracing::warn!(error = %err, "could not listen for ctrl-c");
    }
    tracing::info!("shutting down");
}
