-- Kitty v1 schema. Amounts are TEXT holding integer Luna, never REAL.
CREATE TABLE IF NOT EXISTS goals (
    id               TEXT PRIMARY KEY NOT NULL,
    owner_address    TEXT NOT NULL,
    owner_token_hash TEXT NOT NULL,
    title            TEXT NOT NULL,
    story            TEXT NOT NULL DEFAULT '',
    target_luna      TEXT NOT NULL,
    deadline         TEXT NOT NULL,
    accent           TEXT NOT NULL DEFAULT 'amber',
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goals_owner ON goals (owner_address, created_at DESC);

CREATE TABLE IF NOT EXISTS contributions (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id             TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
    tx_hash             TEXT NOT NULL UNIQUE,
    contributor_address TEXT NOT NULL,
    display_name        TEXT,
    note                TEXT,
    amount_luna         TEXT NOT NULL,
    block_number        INTEGER NOT NULL DEFAULT 0,
    confirmations       INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
    verified_at         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contributions_goal ON contributions (goal_id, id DESC);

CREATE TABLE IF NOT EXISTS thanks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id    TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thanks_goal ON thanks (goal_id, id DESC);
