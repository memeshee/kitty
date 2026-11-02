//! On-chain verification: the only reason Kitty's ledger means anything.
//!
//! **Why this re-reads the chain.** The Mini App hands us a transaction hash the
//! moment the wallet returns it, and a returned hash is not a confirmation: the
//! transaction may never be mined, it may be mined to a different recipient, with a
//! different amount, with a different memo, or it may fail execution. A client is
//! also free to send a hash it invented, or to claim an amount it wishes it had
//! paid. So every field that reaches the database is re-derived from the node:
//! `getTransactionByHash` supplies `to`, `value`, `recipientData`, `executionResult`
//! and `confirmations`, and the client's only real input is *which* hash to look at.
//!
//! The rules run in the order the contract lists them, because that order is what
//! makes the error codes useful to a human: "you paid the wrong person" is more
//! actionable than "the memo is wrong" when both happen to be true.

use axum::http::StatusCode;

use crate::chain::ChainTx;
use crate::db::{self, NewContribution};
use crate::domain::{normalise_address, ContributionRow, GoalRecord};
use crate::error::ApiError;
use crate::state::AppState;

pub const CODE_TX_NOT_FOUND: &str = "tx_not_found";
pub const CODE_WRONG_RECIPIENT: &str = "wrong_recipient";
pub const CODE_WRONG_MEMO: &str = "wrong_memo";
pub const CODE_NOT_EXECUTED: &str = "not_executed";
pub const CODE_PENDING: &str = "pending";
pub const CODE_DUPLICATE: &str = "duplicate";

/// The exact prefix a memo must start with. The chain caps memos at 64 bytes, so
/// `kitty:` plus an 8 character id leaves 42 bytes for a human note.
pub fn memo_prefix(goal_id: &str) -> String {
    format!("kitty:{goal_id}")
}

/// `recipientData` is hex on the wire, UTF-8 in the wallet. Anything that is not
/// valid hex, or not valid UTF-8, is simply "not a Kitty memo".
pub fn decode_memo(recipient_data_hex: &str) -> Option<String> {
    let bytes = hex::decode(recipient_data_hex.trim()).ok()?;
    String::from_utf8(bytes).ok()
}

pub fn memo_matches(recipient_data_hex: &str, goal_id: &str) -> bool {
    decode_memo(recipient_data_hex)
        .map(|memo| memo.starts_with(&memo_prefix(goal_id)))
        .unwrap_or(false)
}

/// A contribution that passed every rule and now exists in the database.
#[derive(Debug)]
pub struct Recorded {
    pub row: ContributionRow,
    /// True when the chain has not confirmed it yet (`confirmations < 1`).
    pub pending: bool,
}

fn reject(code: &'static str, message: impl Into<String>) -> ApiError {
    ApiError::new(StatusCode::UNPROCESSABLE_ENTITY, code, message)
}

fn duplicate() -> ApiError {
    ApiError::new(
        StatusCode::CONFLICT,
        CODE_DUPLICATE,
        "this transaction is already recorded against a goal",
    )
}

/// Rules 1-7 of the contract, in order, ending in an INSERT.
///
/// Every check runs before any write, so a rejected contribution leaves no row.
pub async fn verify_and_record(
    state: &AppState,
    goal: &GoalRecord,
    tx_hash: &str,
    display_name: Option<&str>,
    note: Option<&str>,
) -> Result<Recorded, ApiError> {
    // 1. The chain must know the hash.
    let tx = state.chain.get_transaction(tx_hash).await?.ok_or_else(|| {
        reject(
            CODE_TX_NOT_FOUND,
            "no transaction with that hash is known to the chain",
        )
    })?;

    apply_and_record(state, goal, &tx, display_name, note).await
}

/// Rules 2-7 applied to a transaction the caller has already read from the chain.
///
/// Shared by the client-reported path and the ledger sweep, so a payment the sweep
/// discovered passes exactly the same checks as one the Mini App handed us. There is
/// no shortcut in this function, and there must never be one.
pub async fn apply_and_record(
    state: &AppState,
    goal: &GoalRecord,
    tx: &ChainTx,
    display_name: Option<&str>,
    note: Option<&str>,
) -> Result<Recorded, ApiError> {
    // 2. It must have been paid to the goal's owner.
    let recipient = tx.to.as_deref().map(normalise_address).unwrap_or_default();
    if recipient != goal.owner_address {
        return Err(reject(
            CODE_WRONG_RECIPIENT,
            format!(
                "transaction pays {recipient}, this goal is owned by {}",
                goal.owner_address
            ),
        ));
    }

    // 3. It must carry this goal's memo.
    if !memo_matches(&tx.recipient_data, &goal.id) {
        return Err(reject(
            CODE_WRONG_MEMO,
            format!(
                "the transaction memo does not start with {}",
                memo_prefix(&goal.id)
            ),
        ));
    }

    // 4. It must have executed.
    if !tx.execution_result {
        return Err(reject(
            CODE_NOT_EXECUTED,
            "the transaction failed on chain and moved no value",
        ));
    }

    // 5. The amount is the chain's, never the caller's.
    if tx.value_luna.is_empty() || !tx.value_luna.bytes().all(|b| b.is_ascii_digit()) {
        tracing::error!(tx_hash = %tx.hash, value = %tx.value_luna, "chain returned a non-integer value");
        return Err(ApiError::internal("chain returned a non-integer value"));
    }

    // 6. A hash may only be counted once, ever.
    if db::tx_hash_exists(&state.db, &tx.hash).await? {
        return Err(duplicate());
    }

    // 7. Unconfirmed transactions are stored, flagged, and excluded from totals.
    let pending = tx.confirmations < 1;

    let row = match db::insert_contribution(
        &state.db,
        &NewContribution {
            goal_id: &goal.id,
            tx_hash: &tx.hash,
            contributor_address: &normalise_address(&tx.from),
            display_name,
            note,
            amount_luna: &tx.value_luna,
            block_number: tx.block_number,
            confirmations: tx.confirmations,
            pending,
        },
    )
    .await
    {
        Ok(row) => row,
        // Two clients can race the same hash; the UNIQUE index decides, and the
        // loser gets exactly the error a second attempt would have produced.
        Err(err) if db::is_unique_violation(&err) => return Err(duplicate()),
        Err(err) => return Err(err.into()),
    };

    Ok(Recorded { row, pending })
}

/// The sweep's entry point. Returns `true` when it recorded something new.
///
/// A transaction the index already knows, or one that is not a payment for this jar
/// (wrong recipient, foreign memo, failed execution), is simply not news: the sweep
/// reports it and moves on rather than failing the page render over it.
pub async fn sweep_record(
    state: &AppState,
    goal: &GoalRecord,
    tx: &ChainTx,
) -> Result<bool, ApiError> {
    match apply_and_record(state, goal, tx, None, None).await {
        Ok(_) => Ok(true),
        Err(err) if err.code == CODE_DUPLICATE => Ok(false),
        Err(err) if err.status == StatusCode::UNPROCESSABLE_ENTITY => Ok(false),
        Err(err) => Err(err),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{stub_tx, test_state};

    const GOAL_ID: &str = "k3f9x2ab";
    const OWNER: &str = "NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK";
    const OTHER: &str = "NQ162SSN82TLSMQSKXT3Q01VCMALNU6F1LJG";
    const TX_HASH: &str = "e424c64ffff0d40982ee7607c5200997eb4b95df687df7e176db89650dc27ec8";
    const MISSING_TX: &str = "1111111111111111111111111111111111111111111111111111111111111111";

    fn hex_of(memo: &str) -> String {
        hex::encode(memo.as_bytes())
    }

    #[test]
    fn memo_prefix_is_kitty_plus_the_goal_id() {
        assert_eq!(memo_prefix("k3f9x2ab"), "kitty:k3f9x2ab");
        assert_eq!(memo_prefix("k3f9x2ab").len(), 14);
    }

    #[test]
    fn decodes_the_real_mainnet_memo() {
        let decoded = decode_memo("596f75206d696e6564204e494d206f6e204e696d69712e537061636521");
        assert_eq!(decoded.as_deref(), Some("You mined NIM on Nimiq.Space!"));
    }

    #[test]
    fn accepts_the_exact_prefix_and_a_longer_memo() {
        assert!(memo_matches(&hex_of("kitty:k3f9x2ab"), GOAL_ID));
        assert!(memo_matches(
            &hex_of("kitty:k3f9x2ab for the books"),
            GOAL_ID
        ));
    }

    #[test]
    fn rejects_memos_for_other_goals_and_garbage() {
        assert!(!memo_matches(&hex_of("kitty:zzzzzzzz"), GOAL_ID));
        assert!(!memo_matches(&hex_of("kitty k3f9x2ab"), GOAL_ID));
        assert!(!memo_matches(
            &hex_of("You mined NIM on Nimiq.Space!"),
            GOAL_ID
        ));
        assert!(!memo_matches("", GOAL_ID));
        assert!(!memo_matches("zzzz", GOAL_ID)); // not hex
        assert!(!memo_matches("ff", GOAL_ID)); // hex, but not UTF-8
        assert!(!memo_matches(&hex_of("KITTY:k3f9x2ab"), GOAL_ID)); // case matters
    }

    async fn goal_fixture(state: &AppState, owner: &str) -> GoalRecord {
        let new = crate::domain::NewGoal {
            owner_address: owner.to_string(),
            owner_token_hash: crate::auth::hash_token(&"a".repeat(64)),
            title: "Mai's school fees".into(),
            story: String::new(),
            target_luna: "4000000000".into(),
            deadline: "2026-12-20".into(),
            accent: "amber".into(),
        };
        db::insert_goal(&state.db, GOAL_ID, &new)
            .await
            .expect("goal");
        db::goal_by_id(&state.db, GOAL_ID)
            .await
            .expect("query")
            .expect("goal exists")
    }

    #[tokio::test]
    async fn records_the_chain_value_not_the_client_claim() {
        let (state, stub) = test_state("happy").await;
        stub.set_tx(stub_tx(
            TX_HASH,
            OWNER,
            OTHER,
            154_558,
            "kitty:k3f9x2ab",
            true,
            11,
        ));
        let goal = goal_fixture(&state, OWNER).await;

        let recorded = verify_and_record(
            &state,
            &goal,
            TX_HASH,
            Some("Chi Lan"),
            Some("for the books"),
        )
        .await
        .expect("verifies");

        assert!(!recorded.pending);
        assert_eq!(recorded.row.amount_luna, "154558");
        assert_eq!(recorded.row.contributor_address, OTHER);
        assert_eq!(recorded.row.block_number, 65_761_764);
        assert_eq!(recorded.row.confirmations, 11);
        assert_eq!(recorded.row.display_name.as_deref(), Some("Chi Lan"));

        let stored = db::contributions_for_goal(&state.db, GOAL_ID)
            .await
            .expect("rows");
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].amount_luna, "154558");
    }

    #[tokio::test]
    async fn below_one_confirmation_is_stored_as_pending() {
        let (state, stub) = test_state("pending").await;
        stub.set_tx(stub_tx(
            TX_HASH,
            OWNER,
            OTHER,
            500_000,
            "kitty:k3f9x2ab",
            true,
            0,
        ));
        let goal = goal_fixture(&state, OWNER).await;

        let recorded = verify_and_record(&state, &goal, TX_HASH, None, None)
            .await
            .expect("stored");
        assert!(recorded.pending);

        let stored = db::contributions_for_goal(&state.db, GOAL_ID)
            .await
            .expect("rows");
        assert_eq!(stored.len(), 1, "a pending row is still shown");
        assert_eq!(stored[0].status, "pending");

        // ...but it does not inflate the jar.
        let goal = db::goal_by_id(&state.db, GOAL_ID)
            .await
            .expect("q")
            .expect("g");
        assert_eq!(goal.raised_luna, 0);
    }

    #[tokio::test]
    async fn the_same_hash_cannot_count_twice() {
        let (state, stub) = test_state("duplicate").await;
        stub.set_tx(stub_tx(
            TX_HASH,
            OWNER,
            OTHER,
            154_558,
            "kitty:k3f9x2ab",
            true,
            11,
        ));
        let goal = goal_fixture(&state, OWNER).await;

        verify_and_record(&state, &goal, TX_HASH, None, None)
            .await
            .expect("first");
        let second = verify_and_record(&state, &goal, TX_HASH, None, None).await;
        match second {
            Err(err) => assert_eq!(err.code, CODE_DUPLICATE),
            Ok(_) => panic!("second insert must be rejected"),
        }
    }

    #[tokio::test]
    async fn unknown_hash_is_tx_not_found_and_writes_nothing() {
        let (state, stub) = test_state("notfound").await;
        stub.clear_tx();
        let goal = goal_fixture(&state, OWNER).await;

        let err = verify_and_record(&state, &goal, MISSING_TX, None, None)
            .await
            .expect_err("must fail");
        assert_eq!(err.code, CODE_TX_NOT_FOUND);
        assert!(db::contributions_for_goal(&state.db, GOAL_ID)
            .await
            .expect("rows")
            .is_empty());
    }

    #[tokio::test]
    async fn a_payment_to_someone_else_is_wrong_recipient() {
        let (state, stub) = test_state("wrong_recipient").await;
        stub.set_tx(stub_tx(
            TX_HASH,
            OTHER,
            OTHER,
            154_558,
            "kitty:k3f9x2ab",
            true,
            11,
        ));
        let goal = goal_fixture(&state, OWNER).await;

        let err = verify_and_record(&state, &goal, TX_HASH, None, None)
            .await
            .expect_err("must fail");
        assert_eq!(err.code, CODE_WRONG_RECIPIENT);
    }

    #[tokio::test]
    async fn a_payment_without_the_memo_is_wrong_memo() {
        let (state, stub) = test_state("wrong_memo").await;
        stub.set_tx(stub_tx(TX_HASH, OWNER, OTHER, 154_558, "", true, 11));
        let goal = goal_fixture(&state, OWNER).await;

        let err = verify_and_record(&state, &goal, TX_HASH, None, None)
            .await
            .expect_err("must fail");
        assert_eq!(err.code, CODE_WRONG_MEMO);
    }

    #[tokio::test]
    async fn a_failed_execution_is_not_executed() {
        let (state, stub) = test_state("not_executed").await;
        stub.set_tx(stub_tx(
            TX_HASH,
            OWNER,
            OTHER,
            154_558,
            "kitty:k3f9x2ab",
            false,
            11,
        ));
        let goal = goal_fixture(&state, OWNER).await;

        let err = verify_and_record(&state, &goal, TX_HASH, None, None)
            .await
            .expect_err("must fail");
        assert_eq!(err.code, CODE_NOT_EXECUTED);
    }

    #[tokio::test]
    async fn a_memo_for_another_goal_is_wrong_memo() {
        let (state, stub) = test_state("other_goal").await;
        stub.set_tx(stub_tx(
            TX_HASH,
            OWNER,
            OTHER,
            154_558,
            "kitty:zzzzzzzz",
            true,
            11,
        ));
        let goal = goal_fixture(&state, OWNER).await;

        let err = verify_and_record(&state, &goal, TX_HASH, None, None)
            .await
            .expect_err("must fail");
        assert_eq!(err.code, CODE_WRONG_MEMO);
    }

    // -----------------------------------------------------------------------
    // Live mainnet tests. These talk to rpc.nimiqwatch.com; if the node cannot
    // be reached they print SKIP and return rather than failing a build on a
    // flaky public endpoint. Everything else in this file is offline.
    // -----------------------------------------------------------------------

    const LIVE_TX: &str = "e424c64ffff0d40982ee7607c5200997eb4b95df687df7e176db89650dc27ec8";

    #[tokio::test]
    async fn live_mainnet_fixture_still_matches_the_recorded_facts() {
        let state = crate::test_support::live_state("live_fixture").await;
        if !crate::test_support::chain_reachable(&state).await {
            eprintln!(
                "SKIP live_mainnet_fixture_still_matches_the_recorded_facts: rpc unreachable"
            );
            return;
        }

        let tx = state
            .chain
            .get_transaction(LIVE_TX)
            .await
            .expect("chain read")
            .expect("transaction exists");

        assert_eq!(
            tx.to.as_deref(),
            Some("NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK"),
            "the fixture's recipient moved"
        );
        assert_eq!(tx.value_luna, "154558");
        assert_eq!(
            decode_memo(&tx.recipient_data).as_deref(),
            Some("You mined NIM on Nimiq.Space!")
        );
        assert!(tx.execution_result);
        assert!(tx.confirmations >= 1);
        assert_eq!(tx.block_number, 65_761_764);
    }

    #[tokio::test]
    async fn live_real_tx_with_a_foreign_memo_is_wrong_memo() {
        let state = crate::test_support::live_state("live_wrong_memo").await;
        if !crate::test_support::chain_reachable(&state).await {
            eprintln!("SKIP live_real_tx_with_a_foreign_memo_is_wrong_memo: rpc unreachable");
            return;
        }
        // A goal owned by the transaction's real recipient, but a different id, so
        // the recipient check passes and only the memo can fail.
        let goal = goal_fixture(&state, OWNER).await;

        let err = verify_and_record(&state, &goal, LIVE_TX, None, None)
            .await
            .expect_err("a Nimiq.Space memo is not a Kitty memo");
        assert_eq!(err.code, CODE_WRONG_MEMO);
        assert!(db::contributions_for_goal(&state.db, GOAL_ID)
            .await
            .expect("rows")
            .is_empty());
    }

    #[tokio::test]
    async fn live_real_tx_to_a_different_owner_is_wrong_recipient() {
        let state = crate::test_support::live_state("live_wrong_recipient").await;
        if !crate::test_support::chain_reachable(&state).await {
            eprintln!("SKIP live_real_tx_to_a_different_owner_is_wrong_recipient: rpc unreachable");
            return;
        }
        // The fixture's sender, used here as a goal owner: the money never went here.
        let goal = goal_fixture(&state, OTHER).await;

        let err = verify_and_record(&state, &goal, LIVE_TX, None, None)
            .await
            .expect_err("the transaction pays someone else");
        assert_eq!(err.code, CODE_WRONG_RECIPIENT);
    }
}
