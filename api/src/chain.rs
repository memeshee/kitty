//! Nimiq JSON-RPC client.
//!
//! Two rules shape this module:
//!
//! * Amounts come back as strings of integer Luna and never touch a float.
//! * A read that fails is an error, not a zero. Only an explicit "not found"
//!   from the node is allowed to become `Ok(None)`.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};
use tracing::debug;

use crate::config::{Config, ACCOUNT_CACHE_TTL};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, thiserror::Error)]
pub enum ChainError {
    #[error("chain transport error: {0}")]
    Transport(String),
    #[error("chain rpc error {code}: {message}")]
    Rpc {
        code: i64,
        message: String,
        detail: Option<String>,
    },
    #[error("unexpected chain response: {0}")]
    Decode(String),
}

impl ChainError {
    /// The public node signals an unknown hash/address with a generic internal
    /// error whose text is the only discriminator it gives us.
    fn is_not_found(&self) -> bool {
        match self {
            ChainError::Rpc {
                message, detail, ..
            } => {
                let haystack = format!("{message} {}", detail.as_deref().unwrap_or(""));
                haystack.to_ascii_lowercase().contains("not found")
            }
            _ => false,
        }
    }
}

/// A transaction as the chain reports it. Anything the client said is absent.
#[derive(Debug, Clone)]
pub struct ChainTx {
    pub hash: String,
    pub from: String,
    pub to: Option<String>,
    pub value_luna: String,
    pub block_number: i64,
    pub confirmations: i64,
    pub recipient_data: String,
    pub execution_result: bool,
}

#[derive(Debug, Clone)]
pub struct AccountInfo {
    pub balance_luna: String,
    pub block_number: Option<i64>,
    /// When the node actually answered, so a cached read can say so honestly.
    pub checked_at: String,
}

#[derive(Clone)]
pub struct ChainClient {
    http: reqwest::Client,
    rpc_url: String,
    network: String,
    cache: Arc<Mutex<HashMap<String, CachedAccount>>>,
}

#[derive(Clone)]
struct CachedAccount {
    account: Option<AccountInfo>,
    fetched_at: Instant,
}

impl ChainClient {
    pub fn new(cfg: &Config) -> Result<Self, ChainError> {
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .connect_timeout(Duration::from_secs(5))
            .user_agent(concat!("kitty-api/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|err| ChainError::Transport(err.to_string()))?;

        Ok(Self {
            http,
            rpc_url: cfg.rpc_url.clone(),
            network: cfg.network.clone(),
            cache: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn network(&self) -> &str {
        &self.network
    }

    /// Returns the `result` object of a JSON-RPC call.
    async fn call(&self, method: &str, params: Value) -> Result<Value, ChainError> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        });

        let response = self
            .http
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|err| ChainError::Transport(err.to_string()))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|err| ChainError::Transport(err.to_string()))?;

        if !status.is_success() {
            return Err(ChainError::Transport(format!(
                "http {status} from {}: {}",
                self.rpc_url,
                text.chars().take(200).collect::<String>()
            )));
        }

        let envelope: Envelope = serde_json::from_str(&text).map_err(|err| {
            ChainError::Decode(format!(
                "{err}: {}",
                text.chars().take(200).collect::<String>()
            ))
        })?;

        if let Some(error) = envelope.error {
            debug!(method, code = error.code, message = %error.message, "rpc error");
            return Err(ChainError::Rpc {
                code: error.code,
                message: error.message,
                detail: error.data.map(|data| data.to_string()),
            });
        }

        envelope
            .result
            .ok_or_else(|| ChainError::Decode("response had neither result nor error".into()))
    }

    pub async fn block_number(&self) -> Result<u64, ChainError> {
        let result = self.call("getBlockNumber", json!([])).await?;
        result
            .get("data")
            .and_then(Value::as_u64)
            .ok_or_else(|| ChainError::Decode("getBlockNumber returned no height".into()))
    }

    /// `Ok(None)` means the node does not know this hash — the transaction was
    /// never mined (or was rejected before relay) and must not be indexed.
    pub async fn get_transaction(&self, hash: &str) -> Result<Option<ChainTx>, ChainError> {
        let result = match self.call("getTransactionByHash", json!([hash])).await {
            Ok(result) => result,
            Err(err) if err.is_not_found() => return Ok(None),
            Err(err) => return Err(err),
        };

        let data = match result.get("data") {
            Some(Value::Null) | None => return Ok(None),
            Some(data) => data,
        };

        Ok(Some(decode_tx(data)?))
    }

    /// Every transaction touching `address`, newest first, as the node reports it.
    ///
    /// This is what lets the index repair itself: a payment whose client never came
    /// back to report it (crash, dropped connection, a person paying from the wallet
    /// directly with the memo) is still discoverable from the chain alone.
    pub async fn get_transactions_by_address(
        &self,
        address: &str,
        max: u32,
    ) -> Result<Vec<ChainTx>, ChainError> {
        let result = match self
            .call("getTransactionsByAddress", json!([address, max, null]))
            .await
        {
            Ok(result) => result,
            Err(err) if err.is_not_found() => return Ok(Vec::new()),
            Err(err) => return Err(err),
        };

        let items = match result.get("data") {
            Some(Value::Null) | None => return Ok(Vec::new()),
            Some(Value::Array(items)) => items,
            Some(_) => {
                return Err(ChainError::Decode(
                    "getTransactionsByAddress returned a non-list".into(),
                ))
            }
        };

        let mut out = Vec::with_capacity(items.len());
        for item in items {
            match decode_tx(item) {
                Ok(tx) => out.push(tx),
                // One malformed entry must not hide the rest of the address history.
                Err(err) => debug!(error = %err, "skipping an undecodable transaction"),
            }
        }
        Ok(out)
    }

    /// An account that has never received NIM is reported by the node as an error;
    /// that is a genuine zero balance, not a failure to read the chain.
    pub async fn get_account(&self, address: &str) -> Result<Option<AccountInfo>, ChainError> {
        let result = match self.call("getAccountByAddress", json!([address])).await {
            Ok(result) => result,
            Err(err) if err.is_not_found() => return Ok(None),
            Err(err) => return Err(err),
        };

        let data = match result.get("data") {
            Some(Value::Null) | None => return Ok(None),
            Some(data) => data,
        };

        let balance = amount_string(data.get("balance"))
            .ok_or_else(|| ChainError::Decode("account balance was not an integer".into()))?;

        let block_number = result
            .get("metadata")
            .and_then(|meta| meta.get("blockNumber"))
            .and_then(Value::as_i64);

        Ok(Some(AccountInfo {
            balance_luna: balance,
            block_number,
            checked_at: crate::domain::now_rfc3339(),
        }))
    }

    /// Same as [`ChainClient::get_account`] but reused for [`ACCOUNT_CACHE_TTL`].
    /// A popular goal page can be refreshed by hundreds of people a minute; without
    /// this the public RPC becomes the bottleneck of the whole product.
    pub async fn get_account_cached(
        &self,
        address: &str,
    ) -> Result<Option<AccountInfo>, ChainError> {
        let key = crate::domain::normalise_address(address);

        let cached = {
            let guard = self
                .cache
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            guard.get(&key).cloned()
        };
        if let Some(entry) = cached {
            if entry.fetched_at.elapsed() < ACCOUNT_CACHE_TTL {
                return Ok(entry.account);
            }
        }

        let fresh = self.get_account(&key).await?;

        {
            let mut guard = self
                .cache
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            // Cheap bound: the cache is a short-lived convenience, not a store.
            if guard.len() > 4096 {
                guard.clear();
            }
            guard.insert(
                key,
                CachedAccount {
                    account: fresh.clone(),
                    fetched_at: Instant::now(),
                },
            );
        }

        Ok(fresh)
    }
}

/// One transaction as the node reported it. Shared by the single-hash read and the
/// by-address read so both apply exactly the same decoding rules.
fn decode_tx(data: &Value) -> Result<ChainTx, ChainError> {
    let raw: RawTx = serde_json::from_value(data.clone())
        .map_err(|err| ChainError::Decode(err.to_string()))?;

    let value_luna = amount_string(raw.value.as_ref())
        .ok_or_else(|| ChainError::Decode("transaction value was not an integer".into()))?;

    Ok(ChainTx {
        hash: raw.hash,
        from: raw.from.unwrap_or_default(),
        to: raw.to.map(|to| crate::domain::normalise_address(&to)),
        value_luna,
        block_number: raw.block_number.unwrap_or(0),
        confirmations: raw.confirmations.unwrap_or(0),
        recipient_data: raw.recipient_data.unwrap_or_default(),
        execution_result: raw.execution_result.unwrap_or(false),
    })
}

/// Accepts a JSON number or a decimal string, refuses anything else. A float here
/// would mean the node broke its own contract; better to fail loudly.
fn amount_string(value: Option<&Value>) -> Option<String> {
    match value? {
        Value::Number(number) => number.as_u64().map(|n| n.to_string()),
        Value::String(text) => {
            if !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit()) {
                Some(text.clone())
            } else {
                None
            }
        }
        _ => None,
    }
}

#[derive(Debug, Deserialize)]
struct Envelope {
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<RpcError>,
}

#[derive(Debug, Deserialize)]
struct RpcError {
    code: i64,
    message: String,
    #[serde(default)]
    data: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct RawTx {
    hash: String,
    #[serde(default)]
    from: Option<String>,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    value: Option<Value>,
    #[serde(default, rename = "blockNumber")]
    block_number: Option<i64>,
    #[serde(default)]
    confirmations: Option<i64>,
    #[serde(default, rename = "recipientData")]
    recipient_data: Option<String>,
    #[serde(default, rename = "executionResult")]
    execution_result: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn amounts_accept_numbers_and_digit_strings_only() {
        assert_eq!(amount_string(Some(&json!(154558))), Some("154558".into()));
        assert_eq!(amount_string(Some(&json!("154558"))), Some("154558".into()));
        assert_eq!(amount_string(Some(&json!(1.5))), None);
        assert_eq!(amount_string(Some(&json!("1.5"))), None);
        assert_eq!(amount_string(Some(&json!(-1))), None);
        assert_eq!(amount_string(None), None);
    }

    #[test]
    fn not_found_is_recognised_from_the_node_wording() {
        let err = ChainError::Rpc {
            code: -32603,
            message: "Internal error".into(),
            detail: Some("\"Transaction not found: abc\"".into()),
        };
        assert!(err.is_not_found());

        let transport = ChainError::Transport("connection refused".into());
        assert!(!transport.is_not_found());
    }
}
