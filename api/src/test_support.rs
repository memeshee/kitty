//! Test-only helpers: a stub Nimiq RPC and throwaway SQLite files.
//!
//! The stub speaks the same JSON-RPC envelope as `rpc.nimiqwatch.com`, including
//! the "Transaction not found" error, so the chain client is exercised for real
//! while the answers stay deterministic.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::post;
use axum::{Json, Router};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower::ServiceExt;

use crate::chain::ChainClient;
use crate::config::Config;
use crate::state::AppState;

#[derive(Clone, Default)]
pub struct StubChain {
    inner: Arc<Mutex<StubInner>>,
}

#[derive(Default)]
struct StubInner {
    tx: Option<Value>,
    address_txs: Vec<Value>,
    account: Option<Value>,
    account_block: i64,
    calls: HashMap<String, usize>,
    /// Method name -> how many of the next calls to refuse at the transport level.
    failures: HashMap<String, usize>,
}

impl StubChain {
    pub fn set_tx(&self, tx: Value) {
        self.lock().tx = Some(tx);
    }

    /// The history `getTransactionsByAddress` reports for any address.
    pub fn set_address_txs(&self, txs: Vec<Value>) {
        self.lock().address_txs = txs;
    }

    pub fn clear_tx(&self) {
        self.lock().tx = None;
    }

    pub fn set_account(&self, balance_luna: u64, block_number: i64) {
        self.lock().account = Some(json!({
            "address": "NQ87 BLXR 6NUY 1TAJ TDTA SP4Y 53DJ X96M CLCK",
            "balance": balance_luna,
            "type": "basic",
        }));
        self.lock().account_block = block_number;
    }

    pub fn calls(&self, method: &str) -> usize {
        *self.lock().calls.get(method).unwrap_or(&0)
    }

    /// Makes the next `times` calls of `method` fail the way a dead socket does:
    /// an HTTP error with no JSON-RPC envelope, which the client reports as a
    /// transport failure rather than as a statement about the chain.
    pub fn fail_next(&self, method: &str, times: usize) {
        self.lock().failures.insert(method.to_string(), times);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, StubInner> {
        self.inner.lock().unwrap_or_else(|p| p.into_inner())
    }
}

pub fn stub_tx(
    hash: &str,
    to: &str,
    from: &str,
    value_luna: u64,
    memo: &str,
    executed: bool,
    confirmations: i64,
) -> Value {
    json!({
        "hash": hash,
        "blockNumber": 65_761_764,
        "timestamp": 1_793_550_633_575i64,
        "confirmations": confirmations,
        "from": from,
        "to": to,
        "value": value_luna,
        "fee": 0,
        "senderData": "",
        "recipientData": hex::encode(memo.as_bytes()),
        "executionResult": executed,
        "networkId": 24,
    })
}

async fn rpc_handler(State(stub): State<StubChain>, body: String) -> (StatusCode, Json<Value>) {
    let request: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    {
        let mut inner = stub.lock();
        *inner.calls.entry(method.clone()).or_insert(0) += 1;
    }

    // A refused connection, before any JSON-RPC meaning exists: this is what a
    // resumed machine sees when it reuses a socket the node has already dropped.
    {
        let mut inner = stub.lock();
        if let Some(remaining) = inner.failures.get_mut(&method) {
            if *remaining > 0 {
                *remaining -= 1;
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({"error": "node closed the connection"})),
                );
            }
        }
    }

    let inner = stub.lock();
    let response = match method.as_str() {
        "getBlockNumber" => json!({"data": 65_762_000, "metadata": null}),
        "getTransactionByHash" => match &inner.tx {
            Some(tx) => json!({"data": tx.clone(), "metadata": null}),
            None => json!({
                "error": {
                    "code": -32603,
                    "message": "Internal error",
                    "data": "Transaction not found: 1111"
                }
            }),
        },
        "getAccountByAddress" => match &inner.account {
            Some(account) => json!({
                "data": account.clone(),
                "metadata": {"blockNumber": inner.account_block, "blockHash": "00"}
            }),
            None => json!({
                "error": {"code": -32603, "message": "Internal error", "data": "Account not found"}
            }),
        },
        "getTransactionsByAddress" => json!({
            "data": inner.address_txs.clone(),
            "metadata": null
        }),
        other => json!({
            "error": {"code": -32601, "message": format!("Method not found: {other}")}
        }),
    };

    // Same envelope the real node uses: payload under `result`, failure under `error`.
    let envelope = match response.get("error") {
        Some(error) => json!({"jsonrpc": "2.0", "id": 1, "error": error}),
        None => json!({"jsonrpc": "2.0", "id": 1, "result": response}),
    };
    (StatusCode::OK, Json(envelope))
}

/// Binds the stub on an ephemeral port and returns its base URL.
pub async fn spawn_stub(stub: StubChain) -> String {
    let app = Router::new().route("/", post(rpc_handler)).with_state(stub);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind stub");
    let addr = listener.local_addr().expect("addr");
    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });
    format!("http://{addr}")
}

pub fn temp_db_url(name: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_nanos();
    let path = std::env::temp_dir().join(format!("kitty-test-{name}-{nanos}.db"));
    for suffix in ["", "-wal", "-shm"] {
        let _ = std::fs::remove_file(format!("{}{suffix}", path.display()));
    }
    path.to_string_lossy().to_string()
}

pub async fn test_pool(url: &str) -> SqlitePool {
    let pool = crate::db::connect(url).await.expect("open test database");
    crate::db::migrate(&pool).await.expect("migrate");
    pool
}

/// An [`AppState`] whose chain reads hit a stub, plus the stub for assertions.
pub async fn test_state(name: &str) -> (AppState, StubChain) {
    let stub = StubChain::default();
    let url = spawn_stub(stub.clone()).await;
    let db_url = temp_db_url(name);
    let pool = test_pool(&db_url).await;
    let cfg = Config {
        database_url: db_url,
        rpc_url: url,
        ..Config::default()
    };
    let chain = ChainClient::new(&cfg).expect("chain client");
    (AppState::new(pool, chain, cfg), stub)
}

/// An [`AppState`] wired to the real public RPC. Used by the live mainnet tests.
pub async fn live_state(name: &str) -> AppState {
    let db_url = temp_db_url(name);
    let pool = test_pool(&db_url).await;
    let cfg = Config {
        database_url: db_url,
        ..Config::default()
    };
    let chain = ChainClient::new(&cfg).expect("chain client");
    AppState::new(pool, chain, cfg)
}

pub async fn chain_reachable(state: &AppState) -> bool {
    state.chain.block_number().await.is_ok()
}

pub async fn request(
    app: &Router,
    method: axum::http::Method,
    uri: &str,
    body: Option<Value>,
    headers: &[(&str, &str)],
) -> (StatusCode, Value) {
    let mut builder = axum::http::Request::builder().method(method).uri(uri);
    if body.is_some() {
        builder = builder.header(axum::http::header::CONTENT_TYPE, "application/json");
    }
    for (key, value) in headers {
        builder = builder.header(*key, *value);
    }
    let payload = body.map(|value| value.to_string()).unwrap_or_default();
    let request = builder
        .body(axum::body::Body::from(payload))
        .expect("request");

    let response = app.clone().oneshot(request).await.expect("router call");
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 4 * 1024 * 1024)
        .await
        .expect("body");
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, json)
}

pub const TEST_OWNER: &str = "NQ87 BLXR 6NUY 1TAJ TDTA SP4Y 53DJ X96M CLCK";
pub const TEST_TOKEN: &str = "9f2c1b6d0a7e4c3b8d5f1a2e6c9b0d3f7a4e8c1b5d2f9a6c3b0e7d4f1a8c5b2e";

pub async fn create_goal(app: &Router, owner: &str, token: &str) -> Value {
    let deadline = (chrono::Utc::now().date_naive() + chrono::Duration::days(30))
        .format("%Y-%m-%d")
        .to_string();
    let (status, body) = request(
        app,
        axum::http::Method::POST,
        "/v1/goals",
        Some(json!({
            "owner_address": owner,
            "owner_token": token,
            "title": "Mai's school fees",
            "story": "Two terms, one jar. Anything helps.",
            "target_luna": "4000000000",
            "deadline": deadline,
            "accent": "amber",
        })),
        &[],
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "create goal: {body}");
    body["goal"].clone()
}
