//! SQLite access. All SQL lives here so handlers stay about HTTP and rules.
//!
//! Amounts are stored as TEXT and summed with `CAST(... AS INTEGER)`: SQLite would
//! happily turn a SUM into a REAL and lose a Luna, so the casts are deliberate.

use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;

use crate::domain::{
    ContributionRow, GoalRecord, NewGoal, ThanksRow, GOAL_CLOSED, GOAL_OPEN, STATUS_CONFIRMED,
    STATUS_PENDING,
};

pub const MIGRATIONS: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// Opens (creating if needed) the SQLite file named by `DATABASE_URL`. The
/// documented default is a bare path; a `sqlite://` prefix is also accepted.
pub async fn connect(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let path = database_url
        .strip_prefix("sqlite://")
        .unwrap_or(database_url);

    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));

    SqlitePoolOptions::new()
        .max_connections(8)
        .acquire_timeout(Duration::from_secs(10))
        .connect_with(options)
        .await
}

pub async fn migrate(pool: &SqlitePool) -> Result<(), sqlx::migrate::MigrateError> {
    MIGRATIONS.run(pool).await
}

pub fn is_unique_violation(err: &sqlx::Error) -> bool {
    matches!(err, sqlx::Error::Database(db) if db.is_unique_violation())
}

const GOAL_COLUMNS: &str = r#"
    g.id,
    g.owner_address,
    g.owner_token_hash,
    g.title,
    g.story,
    g.target_luna,
    g.deadline,
    g.accent,
    g.status,
    g.created_at,
    COALESCE(SUM(CASE WHEN c.status = 'confirmed' THEN CAST(c.amount_luna AS INTEGER) ELSE 0 END), 0) AS raised_luna,
    COUNT(DISTINCT CASE WHEN c.status = 'confirmed' THEN c.contributor_address END) AS contributors_count
"#;

const GOAL_FROM: &str = "FROM goals g LEFT JOIN contributions c ON c.goal_id = g.id";

pub async fn insert_goal(pool: &SqlitePool, id: &str, goal: &NewGoal) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"INSERT INTO goals
           (id, owner_address, owner_token_hash, title, story, target_luna, deadline, accent, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(id)
    .bind(&goal.owner_address)
    .bind(&goal.owner_token_hash)
    .bind(&goal.title)
    .bind(&goal.story)
    .bind(&goal.target_luna)
    .bind(&goal.deadline)
    .bind(&goal.accent)
    .bind(GOAL_OPEN)
    .bind(crate::domain::now_rfc3339())
    .execute(pool)
    .await
    .map(|_| ())
}

pub async fn goal_by_id(pool: &SqlitePool, id: &str) -> Result<Option<GoalRecord>, sqlx::Error> {
    let sql = format!("SELECT {GOAL_COLUMNS} {GOAL_FROM} WHERE g.id = ? GROUP BY g.id");
    sqlx::query_as::<_, GoalRecord>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn goals_by_owner(
    pool: &SqlitePool,
    owner: Option<&str>,
    limit: i64,
) -> Result<Vec<GoalRecord>, sqlx::Error> {
    match owner {
        Some(owner) => {
            let sql = format!(
                "SELECT {GOAL_COLUMNS} {GOAL_FROM}
                 WHERE g.owner_address = ? AND g.hidden = 0
                 GROUP BY g.id
                 ORDER BY g.created_at DESC, g.rowid DESC
                 LIMIT ?"
            );
            sqlx::query_as::<_, GoalRecord>(&sql)
                .bind(owner)
                .bind(limit)
                .fetch_all(pool)
                .await
        }
        None => {
            let sql = format!(
                "SELECT {GOAL_COLUMNS} {GOAL_FROM}
                 WHERE g.hidden = 0
                 GROUP BY g.id
                 ORDER BY g.created_at DESC, g.rowid DESC
                 LIMIT ?"
            );
            sqlx::query_as::<_, GoalRecord>(&sql)
                .bind(limit)
                .fetch_all(pool)
                .await
        }
    }
}

/// Takes a jar in or out of the public list. The jar, its receipts and its hashes
/// stay exactly where they are: hiding is a listing decision, never a data one.
pub async fn set_goal_hidden(pool: &SqlitePool, id: &str, hidden: bool) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE goals SET hidden = ? WHERE id = ?")
        .bind(i64::from(hidden))
        .bind(id)
        .execute(pool)
        .await
        .map(|_| ())
}

pub async fn set_goal_status(pool: &SqlitePool, id: &str, status: &str) -> Result<(), sqlx::Error> {
    debug_assert!(status == GOAL_OPEN || status == GOAL_CLOSED);
    sqlx::query("UPDATE goals SET status = ? WHERE id = ?")
        .bind(status)
        .bind(id)
        .execute(pool)
        .await
        .map(|_| ())
}

pub async fn tx_hash_exists(pool: &SqlitePool, tx_hash: &str) -> Result<bool, sqlx::Error> {
    let row: Option<(i64,)> = sqlx::query_as("SELECT 1 FROM contributions WHERE tx_hash = ?")
        .bind(tx_hash)
        .fetch_optional(pool)
        .await?;
    Ok(row.is_some())
}

pub struct NewContribution<'a> {
    pub goal_id: &'a str,
    pub tx_hash: &'a str,
    pub contributor_address: &'a str,
    pub display_name: Option<&'a str>,
    pub note: Option<&'a str>,
    pub amount_luna: &'a str,
    pub block_number: i64,
    pub confirmations: i64,
    pub pending: bool,
}

pub async fn insert_contribution(
    pool: &SqlitePool,
    new: &NewContribution<'_>,
) -> Result<ContributionRow, sqlx::Error> {
    sqlx::query_as::<_, ContributionRow>(
        r#"INSERT INTO contributions
           (goal_id, tx_hash, contributor_address, display_name, note, amount_luna,
            block_number, confirmations, status, verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING id, goal_id, tx_hash, contributor_address, display_name, note,
                     amount_luna, block_number, confirmations, status, verified_at"#,
    )
    .bind(new.goal_id)
    .bind(new.tx_hash)
    .bind(new.contributor_address)
    .bind(new.display_name)
    .bind(new.note)
    .bind(new.amount_luna)
    .bind(new.block_number)
    .bind(new.confirmations)
    .bind(if new.pending {
        STATUS_PENDING
    } else {
        STATUS_CONFIRMED
    })
    .bind(crate::domain::now_rfc3339())
    .fetch_one(pool)
    .await
}

pub async fn contributions_for_goal(
    pool: &SqlitePool,
    goal_id: &str,
) -> Result<Vec<ContributionRow>, sqlx::Error> {
    sqlx::query_as::<_, ContributionRow>(
        r#"SELECT id, goal_id, tx_hash, contributor_address, display_name, note,
                  amount_luna, block_number, confirmations, status, verified_at
           FROM contributions
           WHERE goal_id = ?
           ORDER BY id DESC"#,
    )
    .bind(goal_id)
    .fetch_all(pool)
    .await
}

/// One receipt, by the hash the chain gave it. A shared receipt link resolves
/// against this: the hash is the address of the proof.
pub async fn contribution_by_hash(
    pool: &SqlitePool,
    tx_hash: &str,
) -> Result<Option<ContributionRow>, sqlx::Error> {
    sqlx::query_as::<_, ContributionRow>(
        r#"SELECT id, goal_id, tx_hash, contributor_address, display_name, note,
                  amount_luna, block_number, confirmations, status, verified_at
           FROM contributions
           WHERE tx_hash = ?
           LIMIT 1"#,
    )
    .bind(tx_hash)
    .fetch_optional(pool)
    .await
}

/// A receipt with the name of the jar it landed in, for the public ledger.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RecentContributionRow {
    pub tx_hash: String,
    pub goal_id: String,
    pub goal_title: String,
    pub contributor_address: String,
    pub display_name: Option<String>,
    pub amount_luna: String,
    pub verified_at: String,
}

pub async fn recent_contributions(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<RecentContributionRow>, sqlx::Error> {
    sqlx::query_as::<_, RecentContributionRow>(
        r#"SELECT c.tx_hash, c.goal_id, g.title AS goal_title, c.contributor_address,
                  c.display_name, c.amount_luna, c.verified_at
           FROM contributions c
           JOIN goals g ON g.id = c.goal_id
           WHERE c.status = 'confirmed'
           ORDER BY c.id DESC
           LIMIT ?"#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await
}

/// Every wallet that has put a confirmed coin in a jar, as the chain named it.
///
/// This is the number the competition scores and the number a stranger can recount
/// from the receipts themselves, so it is published rather than described.
pub async fn distinct_wallets(pool: &SqlitePool, limit: i64) -> Result<Vec<String>, sqlx::Error> {
    let rows: Vec<(String,)> = sqlx::query_as(
        r#"SELECT contributor_address
           FROM contributions
           WHERE status = 'confirmed'
           GROUP BY contributor_address
           ORDER BY MIN(id) DESC
           LIMIT ?"#,
    )
    .bind(limit)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(address,)| address).collect())
}

pub async fn visible_goal_count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM goals WHERE hidden = 0")
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct StatsAggregate {
    pub contributions_count: i64,
    pub contributors_count: i64,
    pub total_luna: i64,
    pub last_contribution_at: Option<String>,
}

/// Confirmed rows only: a pending transaction is not yet part of the jar, and
/// counting it would make `reconciliation.matches` lie.
pub async fn stats_for_goal(
    pool: &SqlitePool,
    goal_id: &str,
) -> Result<StatsAggregate, sqlx::Error> {
    sqlx::query_as::<_, StatsAggregate>(
        r#"SELECT COUNT(*) AS contributions_count,
                  COUNT(DISTINCT contributor_address) AS contributors_count,
                  COALESCE(SUM(CAST(amount_luna AS INTEGER)), 0) AS total_luna,
                  MAX(verified_at) AS last_contribution_at
           FROM contributions
           WHERE goal_id = ? AND status = 'confirmed'"#,
    )
    .bind(goal_id)
    .fetch_one(pool)
    .await
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct GlobalStats {
    pub goals: i64,
    pub contributions: i64,
    pub distinct_contributors: i64,
    pub total_luna: i64,
}

pub async fn global_stats(pool: &SqlitePool) -> Result<GlobalStats, sqlx::Error> {
    sqlx::query_as::<_, GlobalStats>(
        r#"SELECT (SELECT COUNT(*) FROM goals) AS goals,
                  (SELECT COUNT(*) FROM contributions WHERE status = 'confirmed') AS contributions,
                  (SELECT COUNT(DISTINCT contributor_address) FROM contributions WHERE status = 'confirmed') AS distinct_contributors,
                  (SELECT COALESCE(SUM(CAST(amount_luna AS INTEGER)), 0) FROM contributions WHERE status = 'confirmed') AS total_luna"#,
    )
    .fetch_one(pool)
    .await
}

pub async fn insert_thanks(
    pool: &SqlitePool,
    goal_id: &str,
    body: &str,
) -> Result<ThanksRow, sqlx::Error> {
    sqlx::query_as::<_, ThanksRow>(
        r#"INSERT INTO thanks (goal_id, body, created_at)
           VALUES (?, ?, ?)
           RETURNING id, goal_id, body, created_at"#,
    )
    .bind(goal_id)
    .bind(body)
    .bind(crate::domain::now_rfc3339())
    .fetch_one(pool)
    .await
}

pub async fn thanks_for_goal(
    pool: &SqlitePool,
    goal_id: &str,
) -> Result<Vec<ThanksRow>, sqlx::Error> {
    sqlx::query_as::<_, ThanksRow>(
        "SELECT id, goal_id, body, created_at FROM thanks WHERE goal_id = ? ORDER BY id DESC",
    )
    .bind(goal_id)
    .fetch_all(pool)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{temp_db_url, test_pool};

    #[tokio::test]
    async fn aggregate_sums_only_confirmed_rows() {
        let url = temp_db_url("aggregate");
        let pool = test_pool(&url).await;

        let goal = NewGoal {
            owner_address: "NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK".into(),
            owner_token_hash: "0".repeat(64),
            title: "Testing".into(),
            story: String::new(),
            target_luna: "1000000".into(),
            deadline: "2026-12-20".into(),
            accent: "amber".into(),
        };
        insert_goal(&pool, "k3f9x2ab", &goal)
            .await
            .expect("insert goal");

        for (hash, amount, pending) in [
            ("aa", "500000", false),
            ("bb", "250000", false),
            ("cc", "999999", true),
        ] {
            insert_contribution(
                &pool,
                &NewContribution {
                    goal_id: "k3f9x2ab",
                    tx_hash: hash,
                    contributor_address: "NQ16BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK",
                    display_name: None,
                    note: None,
                    amount_luna: amount,
                    block_number: 1,
                    confirmations: if pending { 0 } else { 3 },
                    pending,
                },
            )
            .await
            .expect("insert contribution");
        }

        let goal = goal_by_id(&pool, "k3f9x2ab")
            .await
            .expect("query")
            .expect("found");
        assert_eq!(goal.raised_luna, 750_000);
        assert_eq!(goal.contributors_count, 1);

        let stats = stats_for_goal(&pool, "k3f9x2ab").await.expect("stats");
        assert_eq!(stats.contributions_count, 2);
        assert_eq!(stats.total_luna, 750_000);

        let global = global_stats(&pool).await.expect("global");
        assert_eq!(global.goals, 1);
        assert_eq!(global.contributions, 2);
        assert_eq!(global.total_luna, 750_000);
    }

    #[tokio::test]
    async fn tx_hashes_are_unique() {
        let url = temp_db_url("unique");
        let pool = test_pool(&url).await;
        let goal = NewGoal {
            owner_address: "NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK".into(),
            owner_token_hash: "0".repeat(64),
            title: "Testing".into(),
            story: String::new(),
            target_luna: "1000000".into(),
            deadline: "2026-12-20".into(),
            accent: "amber".into(),
        };
        insert_goal(&pool, "k3f9x2ab", &goal)
            .await
            .expect("insert goal");

        let row = NewContribution {
            goal_id: "k3f9x2ab",
            tx_hash: "deadbeef",
            contributor_address: "NQ16BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK",
            display_name: None,
            note: None,
            amount_luna: "1",
            block_number: 1,
            confirmations: 1,
            pending: false,
        };
        insert_contribution(&pool, &row)
            .await
            .expect("first insert");

        let second = insert_contribution(&pool, &row).await;
        assert!(second.is_err());
        assert!(is_unique_violation(&second.expect_err("must fail")));
    }
}
