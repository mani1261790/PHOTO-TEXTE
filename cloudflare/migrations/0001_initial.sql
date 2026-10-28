PRAGMA foreign_keys = ON;

-- Better Auth (generated from Better Auth 1.6.26, SQLite dialect).
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
  updatedAt INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY NOT NULL,
  expiresAt INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
  updatedAt INTEGER NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS session_userId_idx ON session(userId);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY NOT NULL,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt INTEGER,
  refreshTokenExpiresAt INTEGER,
  scope TEXT,
  password TEXT,
  createdAt INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
  updatedAt INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS account_userId_idx ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY NOT NULL,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER)),
  updatedAt INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsecond') * 1000 AS INTEGER))
);

CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification(identifier);

-- PHOTO-TEXTE application data. Authorization is enforced in the server-side
-- D1 client by applying the authenticated user scope to every query.
CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  email_encrypted TEXT NOT NULL,
  wrapped_data_key TEXT NOT NULL,
  display_name TEXT,
  grammatical_gender TEXT NOT NULL DEFAULT 'auto'
    CHECK (grammatical_gender IN ('male', 'female', 'neutral', 'auto')),
  cefr_level TEXT NOT NULL DEFAULT 'A2'
    CHECK (cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  politeness_pref TEXT,
  service_language TEXT NOT NULL DEFAULT 'ja'
    CHECK (service_language IN ('ja', 'fr')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  object_path TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL CHECK (size > 0),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title_fr TEXT NOT NULL,
  draft_fr TEXT NOT NULL,
  jp_auto TEXT,
  jp_intent TEXT,
  final_fr TEXT,
  photo_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  learning_highlights TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT_FR'
    CHECK (status IN ('DRAFT_FR', 'JP_AUTO_READY', 'JP_INTENT_LOCKED', 'FINAL_FR_READY', 'EXPORTED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS entry_photos (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 10),
  photo_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  draft_fr TEXT NOT NULL,
  jp_auto TEXT,
  jp_intent TEXT,
  final_fr TEXT,
  learning_highlights TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT_FR'
    CHECK (status IN ('DRAFT_FR', 'JP_AUTO_READY', 'JP_INTENT_LOCKED', 'FINAL_FR_READY', 'EXPORTED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (entry_id, position)
);

CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY NOT NULL,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  memo_type TEXT NOT NULL CHECK (memo_type IN ('TEACHER_FEEDBACK', 'SELF_NOTE')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  object_path TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_assets_user_id ON assets(user_id);
CREATE INDEX IF NOT EXISTS idx_entries_user_id_created_at ON entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entry_photos_entry_id_position ON entry_photos(entry_id, position);
CREATE INDEX IF NOT EXISTS idx_entry_photos_user_id_created_at ON entry_photos(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entry_photos_asset_id ON entry_photos(photo_asset_id);
CREATE INDEX IF NOT EXISTS idx_memos_entry_id ON memos(entry_id);
CREATE INDEX IF NOT EXISTS idx_exports_expires_at ON exports(expires_at);
