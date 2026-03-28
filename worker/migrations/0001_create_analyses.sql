CREATE TABLE IF NOT EXISTS analyses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  url         TEXT    NOT NULL,
  plugins     TEXT    NOT NULL DEFAULT '[]',  -- JSON array
  spam_detected INTEGER NOT NULL DEFAULT 0,
  spam_methods  TEXT  NOT NULL DEFAULT '[]',  -- JSON array
  notes       TEXT    NOT NULL DEFAULT '',
  analyzed_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analyses_url ON analyses(url);
CREATE INDEX IF NOT EXISTS idx_analyses_analyzed_at ON analyses(analyzed_at);
