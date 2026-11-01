//! Domain types: what a goal and a contribution *are*, plus the normalisation and
//! validation rules the contract pins down.
//!
//! Amounts never leave this module as numbers: they are strings of integer Luna
//! from the request body to the JSON response, so nothing can round a payment.

use chrono::{Duration, NaiveDate, SecondsFormat, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::error::ApiError;

pub const GOAL_ID_LEN: usize = 8;
/// The contract's id alphabet. Its literal string in docs/API.md is 33 characters
/// and includes `u`, which contradicts the documented rule "(no i, l, o, u)", so we
/// take the intersection: everything the contract lists except i, l, o and u. Every
/// id we mint is therefore valid under the literal string *and* under the rule.
pub const GOAL_ID_ALPHABET: &[u8] = b"0123456789abcdefghjkmnpqrstvwxyz";
/// User-friendly address payload alphabet (base32, no I, O, W, Z).
const ADDRESS_ALPHABET: &[u8] = b"0123456789ABCDEFGHJKLMNPQRSTUVXY";
const ADDRESS_LEN: usize = 36;

pub const LUNA_PER_NIM: u64 = 100_000;
pub const MIN_TARGET_LUNA: u64 = LUNA_PER_NIM;
/// Keeps every total comfortably inside a SQLite INTEGER while still being absurdly
/// larger than any jar (9e15 Luna = 90 billion NIM).
pub const MAX_TARGET_LUNA: u64 = 9_000_000_000_000_000;

pub const TITLE_MIN: usize = 3;
pub const TITLE_MAX: usize = 80;
pub const STORY_MAX: usize = 400;
pub const THANKS_MAX: usize = 280;
pub const DISPLAY_NAME_MAX: usize = 60;
pub const NOTE_MAX: usize = 280;
pub const ACCENT_MAX: usize = 24;

pub const GOAL_OPEN: &str = "open";
pub const GOAL_CLOSED: &str = "closed";
pub const STATUS_CONFIRMED: &str = "confirmed";
pub const STATUS_PENDING: &str = "pending";

/// A fresh goal id, 8 chars of the documented alphabet.
pub fn new_goal_id() -> String {
    let mut rng = rand::thread_rng();
    (0..GOAL_ID_LEN)
        .map(|_| GOAL_ID_ALPHABET[rng.gen_range(0..GOAL_ID_ALPHABET.len())] as char)
        .collect()
}

/// Ids are compared and parsed exactly as stored, so the check is strict.
pub fn is_valid_goal_id(id: &str) -> bool {
    id.len() == GOAL_ID_LEN && id.bytes().all(|b| GOAL_ID_ALPHABET.contains(&b))
}

/// Upper case, spaces stripped. The only address form that is stored or compared.
pub fn normalise_address(raw: &str) -> String {
    raw.chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_uppercase)
        .collect()
}

/// Shape plus the IBAN-style mod-97 checksum Nimiq uses, so a typo is rejected
/// before it becomes a jar nobody can pay into.
pub fn is_valid_address(raw: &str) -> bool {
    let address = normalise_address(raw);
    if address.len() != ADDRESS_LEN || !address.starts_with("NQ") {
        return false;
    }
    let payload = &address[4..];
    if !payload.bytes().all(|b| ADDRESS_ALPHABET.contains(&b)) {
        return false;
    }

    // IBAN check: move "NQ" + check digits to the end, letters become 10..35,
    // then the whole decimal string must be 1 mod 97.
    let mut remainder: u32 = 0;
    for byte in payload.bytes().chain(address.bytes().take(4)) {
        let digit = match byte {
            b'0'..=b'9' => u32::from(byte - b'0'),
            b'A'..=b'Z' => u32::from(byte - b'A') + 10,
            _ => return false,
        };
        remainder = if digit >= 10 {
            (remainder * 100 + digit) % 97
        } else {
            (remainder * 10 + digit) % 97
        };
    }
    remainder == 1
}

pub fn now_rfc3339() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

pub fn memo_for(goal_id: &str) -> String {
    format!("kitty:{goal_id}")
}

/// `value` of a confirmed or pending index row, as stored.
pub fn parse_luna(value: &str) -> Option<u64> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    value.parse::<u64>().ok()
}

// ---------------------------------------------------------------------------
// Stored rows
// ---------------------------------------------------------------------------

/// A goal plus the aggregates a client always wants with it. One query, no N+1.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct GoalRecord {
    pub id: String,
    pub owner_address: String,
    pub owner_token_hash: String,
    pub title: String,
    pub story: String,
    pub target_luna: String,
    pub deadline: String,
    pub accent: String,
    pub status: String,
    pub created_at: String,
    pub raised_luna: i64,
    pub contributors_count: i64,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ContributionRow {
    pub id: i64,
    pub goal_id: String,
    pub tx_hash: String,
    pub contributor_address: String,
    pub display_name: Option<String>,
    pub note: Option<String>,
    pub amount_luna: String,
    pub block_number: i64,
    pub confirmations: i64,
    pub status: String,
    pub verified_at: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ThanksRow {
    pub id: i64,
    pub goal_id: String,
    pub body: String,
    pub created_at: String,
}

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CreateGoalRequest {
    pub owner_address: String,
    pub owner_token: String,
    pub title: String,
    #[serde(default)]
    pub story: String,
    pub target_luna: String,
    pub deadline: String,
    #[serde(default)]
    pub accent: Option<String>,
}

/// A request that survived validation, in storable form.
#[derive(Debug)]
pub struct NewGoal {
    pub owner_address: String,
    pub owner_token_hash: String,
    pub title: String,
    pub story: String,
    pub target_luna: String,
    pub deadline: String,
    pub accent: String,
}

impl CreateGoalRequest {
    /// `today` is injected so the deadline window is testable without a clock.
    pub fn validate(self, today: NaiveDate) -> Result<NewGoal, ApiError> {
        let owner_address = normalise_address(&self.owner_address);
        if !is_valid_address(&owner_address) {
            return Err(ApiError::validation(
                "owner_address is not a valid Nimiq address",
            ));
        }

        let token = self.owner_token.trim().to_string();
        if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(ApiError::validation(
                "owner_token must be 64 hex characters",
            ));
        }

        let title = self.title.trim().to_string();
        let title_len = title.chars().count();
        if !(TITLE_MIN..=TITLE_MAX).contains(&title_len) {
            return Err(ApiError::validation(format!(
                "title must be {TITLE_MIN}..{TITLE_MAX} characters"
            )));
        }

        let story = self.story.trim().to_string();
        if story.chars().count() > STORY_MAX {
            return Err(ApiError::validation(format!(
                "story must be at most {STORY_MAX} characters"
            )));
        }

        let target = parse_luna(&self.target_luna)
            .ok_or_else(|| ApiError::validation("target_luna must be a string of integer Luna"))?;
        if target < MIN_TARGET_LUNA {
            return Err(ApiError::validation(format!(
                "target_luna must be at least {MIN_TARGET_LUNA}"
            )));
        }
        if target > MAX_TARGET_LUNA {
            return Err(ApiError::validation("target_luna is out of range"));
        }

        let deadline = NaiveDate::parse_from_str(self.deadline.trim(), "%Y-%m-%d")
            .map_err(|_| ApiError::validation("deadline must be YYYY-MM-DD"))?;
        if deadline < today || deadline > today + Duration::days(365) {
            return Err(ApiError::validation(
                "deadline must be between today and 365 days from today",
            ));
        }

        let accent = self.accent.unwrap_or_default().trim().to_string();
        let accent = if accent.is_empty() {
            "amber".to_string()
        } else if accent.chars().count() > ACCENT_MAX
            || !accent
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        {
            return Err(ApiError::validation(
                "accent must be a short lower-case token such as \"amber\"",
            ));
        } else {
            accent
        };

        Ok(NewGoal {
            owner_address,
            owner_token_hash: crate::auth::hash_token(&token),
            title,
            story,
            target_luna: target.to_string(),
            deadline: deadline.format("%Y-%m-%d").to_string(),
            accent,
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateContributionRequest {
    pub tx_hash: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
}

impl CreateContributionRequest {
    pub fn tx_hash(&self) -> Result<String, ApiError> {
        let hash = self.tx_hash.trim().to_ascii_lowercase();
        let hash = hash.strip_prefix("0x").unwrap_or(&hash).to_string();
        if hash.len() != 64 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(ApiError::validation("tx_hash must be 64 hex characters"));
        }
        Ok(hash)
    }

    pub fn display_name(&self) -> Result<Option<String>, ApiError> {
        clean_optional(
            self.display_name.as_deref(),
            DISPLAY_NAME_MAX,
            "display_name",
        )
    }

    pub fn note(&self) -> Result<Option<String>, ApiError> {
        clean_optional(self.note.as_deref(), NOTE_MAX, "note")
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateThanksRequest {
    pub body: String,
}

impl CreateThanksRequest {
    pub fn body(&self) -> Result<String, ApiError> {
        let body = self.body.trim().to_string();
        if body.is_empty() {
            return Err(ApiError::validation("body must not be empty"));
        }
        if body.chars().count() > THANKS_MAX {
            return Err(ApiError::validation(format!(
                "body must be at most {THANKS_MAX} characters"
            )));
        }
        Ok(body)
    }
}

fn clean_optional(raw: Option<&str>, max: usize, field: &str) -> Result<Option<String>, ApiError> {
    let Some(value) = raw else { return Ok(None) };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > max {
        return Err(ApiError::validation(format!(
            "{field} must be at most {max} characters"
        )));
    }
    Ok(Some(value.to_string()))
}

#[derive(Debug, Serialize)]
pub struct GoalView {
    pub id: String,
    pub owner_address: String,
    pub title: String,
    pub story: String,
    pub target_luna: String,
    pub deadline: String,
    pub accent: String,
    pub status: String,
    pub created_at: String,
    pub raised_luna: String,
    pub contributors_count: i64,
    pub share_url: String,
    pub memo: String,
}

impl GoalView {
    pub fn from_record(record: &GoalRecord, cfg: &Config) -> Self {
        Self {
            id: record.id.clone(),
            owner_address: record.owner_address.clone(),
            title: record.title.clone(),
            story: record.story.clone(),
            target_luna: record.target_luna.clone(),
            deadline: record.deadline.clone(),
            accent: record.accent.clone(),
            status: record.status.clone(),
            created_at: record.created_at.clone(),
            raised_luna: record.raised_luna.max(0).to_string(),
            contributors_count: record.contributors_count,
            share_url: cfg.share_url(&record.id),
            memo: memo_for(&record.id),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ContributionView {
    pub id: i64,
    pub goal_id: String,
    pub tx_hash: String,
    pub contributor_address: String,
    pub display_name: Option<String>,
    pub note: Option<String>,
    pub amount_luna: String,
    pub block_number: i64,
    pub confirmations: i64,
    /// "confirmed" or "pending". Extra to the contract, additive and useful.
    pub status: String,
    pub verified_at: String,
    pub explorer_url: String,
}

impl ContributionView {
    pub const EXPLORER_BASE: &'static str = "https://nimiq.watch/#";

    pub fn from_row(row: &ContributionRow) -> Self {
        Self {
            id: row.id,
            goal_id: row.goal_id.clone(),
            tx_hash: row.tx_hash.clone(),
            contributor_address: row.contributor_address.clone(),
            display_name: row.display_name.clone(),
            note: row.note.clone(),
            amount_luna: row.amount_luna.clone(),
            block_number: row.block_number,
            confirmations: row.confirmations,
            status: row.status.clone(),
            verified_at: row.verified_at.clone(),
            explorer_url: format!("{}{}", Self::EXPLORER_BASE, row.tx_hash),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ThanksView {
    pub id: i64,
    pub goal_id: String,
    pub body: String,
    pub created_at: String,
}

impl From<&ThanksRow> for ThanksView {
    fn from(row: &ThanksRow) -> Self {
        Self {
            id: row.id,
            goal_id: row.goal_id.clone(),
            body: row.body.clone(),
            created_at: row.created_at.clone(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct GoalStatsView {
    pub contributors_count: i64,
    pub contributions_count: i64,
    pub average_luna: String,
    pub last_contribution_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Reconciliation {
    pub balance_luna: String,
    pub indexed_luna: String,
    pub unindexed_luna: String,
    pub block_number: i64,
    pub checked_at: String,
    pub matches: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_OWNER: &str = "NQ87 BLXR 6NUY 1TAJ TDTA SP4Y 53DJ X96M CLCK";

    #[test]
    fn normalises_an_address_to_upper_case_without_spaces() {
        assert_eq!(
            normalise_address("nq87 blxr 6nuy 1taj tdta sp4y 53dj x96m clck"),
            "NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCK"
        );
        assert_eq!(
            normalise_address("  NQ16 2SSN\t82TL SMQS KXT3 Q01V CMAL NU6F 1LJG "),
            "NQ162SSN82TLSMQSKXT3Q01VCMALNU6F1LJG"
        );
    }

    #[test]
    fn accepts_real_mainnet_addresses() {
        // Both taken from live mainnet traffic, one of them the memo test fixture.
        assert!(is_valid_address(REAL_OWNER));
        assert!(is_valid_address(
            "NQ16 2SSN 82TL SMQS KXT3 Q01V CMAL NU6F 1LJG"
        ));
        assert!(is_valid_address("NQ0231N63KM5T6G522TNEPF55XPYRLHKRMB3"));
    }

    #[test]
    fn rejects_a_corrupted_checksum() {
        // One payload character swapped: shape is fine, checksum is not.
        assert!(!is_valid_address("NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCJ"));
        assert!(!is_valid_address("NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLC"));
        assert!(!is_valid_address("NQ87BLXR6NUY1TAJTDTASP4Y53DJX96MCLCKK"));
        assert!(!is_valid_address(""));
    }

    #[test]
    fn goal_ids_use_the_documented_alphabet() {
        assert_eq!(GOAL_ID_ALPHABET.len(), 32);
        for banned in *b"ilou" {
            assert!(!GOAL_ID_ALPHABET.contains(&banned));
        }
        // Still a subset of the literal string in docs/API.md, so a client that
        // validates against that string accepts everything we mint.
        let documented = b"0123456789abcdefghjkmnpqrstuvwxyz";
        for byte in GOAL_ID_ALPHABET {
            assert!(
                documented.contains(byte),
                "{} is not documented",
                *byte as char
            );
        }
    }

    #[test]
    fn generated_goal_ids_are_valid_and_varied() {
        let ids: Vec<String> = (0..64).map(|_| new_goal_id()).collect();
        assert!(ids.iter().all(|id| is_valid_goal_id(id)));
        assert_eq!(ids[0].len(), 8);
        // 64 draws from 32^8 should not collide.
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len());
    }

    #[test]
    fn goal_id_validation_is_strict() {
        assert!(is_valid_goal_id("k3f9x2ab"));
        assert!(!is_valid_goal_id("k3f9x2a")); // too short
        assert!(!is_valid_goal_id("k3f9x2abc")); // too long
        assert!(!is_valid_goal_id("k3f9x2ai")); // i is not in the alphabet
        assert!(!is_valid_goal_id("K3F9X2AB")); // upper case is not the alphabet
    }

    #[test]
    fn memo_is_kitty_colon_goal_id() {
        assert_eq!(memo_for("k3f9x2ab"), "kitty:k3f9x2ab");
    }

    #[test]
    fn luna_parsing_refuses_floats_and_empty_strings() {
        assert_eq!(parse_luna("100000"), Some(100_000));
        assert_eq!(parse_luna("1.5"), None);
        assert_eq!(parse_luna("-1"), None);
        assert_eq!(parse_luna(""), None);
        assert_eq!(parse_luna(" 1"), None);
    }
}
