//! Ledger self-repair.
//!
//! The index is written from a client-reported hash, and a client is allowed to
//! disappear: the wallet may sign and then the WebView dies, the connection may drop
//! between the payment and the POST, or a person may simply send NIM to the owner
//! from their own wallet with the jar's memo pasted in. In every one of those cases
//! the money has moved and the jar would sit there claiming nothing happened.
//!
//! So the jar page also reads the chain forwards: the owner's recent transactions are
//! scanned for this goal's memo, and anything missing is recorded through exactly the
//! same verifier the client path uses. The sweep can only ever *add* rows that the
//! chain already proves; it cannot invent a contribution, change an amount, or touch
//! a wallet.

use tracing::{debug, info, warn};

use crate::db;
use crate::domain::GoalRecord;
use crate::state::AppState;
use crate::verifier;

/// How many of the owner's recent transactions one sweep looks at. A jar collects a
/// handful of payments from a handful of people; eighty is generous for that, and it
/// keeps the read to a single RPC call.
pub const SWEEP_PAGE: u32 = 80;

/// Repairs `goal`'s index from the chain, at most once per [`SWEEP_INTERVAL`].
///
/// Returns how many payments it recovered. Errors are logged, never raised: a page
/// must still render the receipts it already has when the node is unreachable.
pub async fn sweep_goal(state: &AppState, goal: &GoalRecord) -> usize {
    if !state.claim_sweep(&goal.id) {
        return 0;
    }

    let transactions = match state
        .chain
        .get_transactions_by_address(&goal.owner_address, SWEEP_PAGE)
        .await
    {
        Ok(transactions) => transactions,
        Err(err) => {
            warn!(error = %err, goal = %goal.id, "ledger sweep could not read the chain");
            return 0;
        }
    };

    let mut recovered = 0usize;
    for tx in &transactions {
        if !tx.execution_result {
            continue;
        }
        if !verifier::memo_matches(&tx.recipient_data, &goal.id) {
            continue;
        }
        match db::tx_hash_exists(&state.db, &tx.hash).await {
            Ok(true) => continue,
            Ok(false) => {}
            Err(err) => {
                warn!(error = %err, goal = %goal.id, "ledger sweep could not check the index");
                return recovered;
            }
        }

        match verifier::sweep_record(state, goal, tx).await {
            Ok(true) => {
                recovered += 1;
                info!(goal = %goal.id, tx = %tx.hash, amount = %tx.value_luna, "ledger sweep recovered a payment");
            }
            Ok(false) => debug!(goal = %goal.id, tx = %tx.hash, "sweep saw a payment it does not index"),
            Err(err) => debug!(error = %err, goal = %goal.id, tx = %tx.hash, "sweep refused a payment"),
        }
    }

    recovered
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};

    use crate::test_support::{create_goal, request, stub_tx, test_state, TEST_OWNER, TEST_TOKEN};

    const BUYER: &str = "NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG";
    const TX: &str = "e424c64ffff0d40982ee7607c5200997eb4b95df687df7e176db89650dc27ec8";
    const OTHER_TX: &str = "b7f0f2a1c4e69d3b8a5c1902f7e4d6b3a8c5e2f9d1b7a4c6e3f8d2b9a5c1e7f4";

    #[tokio::test]
    async fn a_payment_the_client_never_reported_still_lands_in_the_jar() {
        let (state, stub) = test_state("sweep_recover").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();

        // The money moved on chain; the Mini App never came back to say so.
        stub.set_address_txs(vec![stub_tx(
            TX,
            TEST_OWNER,
            BUYER,
            300_000,
            &format!("kitty:{id}"),
            true,
            6,
        )]);

        let (status, body) = request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK, "goal page: {body}");
        assert_eq!(body["goal"]["raised_luna"], "300000");
        assert_eq!(body["contributions"].as_array().expect("rows").len(), 1);
        assert_eq!(body["contributions"][0]["tx_hash"], TX);
        assert_eq!(body["stats"]["contributors_count"], 1);

        // The next load reads the index rather than re-recording anything.
        let (status, body) = request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["contributions"].as_array().expect("rows").len(), 1);
    }

    #[tokio::test]
    async fn the_sweep_ignores_foreign_memos_and_failed_payments() {
        let (state, stub) = test_state("sweep_ignores").await;
        let app = crate::routes::app(state);
        let goal = create_goal(&app, TEST_OWNER, TEST_TOKEN).await;
        let id = goal["id"].as_str().expect("id").to_string();

        stub.set_address_txs(vec![
            // Someone else's jar.
            stub_tx(OTHER_TX, TEST_OWNER, BUYER, 999_000, "kitty:zzzzzzzz", true, 9),
            // This jar, but the payment failed on chain.
            stub_tx(TX, TEST_OWNER, BUYER, 500_000, &format!("kitty:{id}"), false, 9),
            // A plain transfer with no memo at all.
            stub_tx(
                "1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012",
                TEST_OWNER,
                BUYER,
                700_000,
                "",
                true,
                9,
            ),
        ]);

        let (status, body) = request(&app, Method::GET, &format!("/v1/goals/{id}"), None, &[]).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body["goal"]["raised_luna"], "0");
        assert_eq!(body["contributions"].as_array().expect("rows").len(), 0);
    }
}
