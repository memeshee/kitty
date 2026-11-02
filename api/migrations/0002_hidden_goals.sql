-- Hidden jars. A goal can be taken out of the public list without deleting it or
-- its receipts: QA jars, deploy checks, and anything an owner wants out of
-- circulation while the ledger underneath stays truthful.
ALTER TABLE goals ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_goals_visible ON goals (hidden, created_at DESC);
