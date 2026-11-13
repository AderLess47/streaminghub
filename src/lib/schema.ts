/**
 * Relational schema (SQLite). Applied idempotently at runtime and by scripts/init-db.mjs.
 * All timestamps are ISO-8601 UTC strings.
 */
export const SCHEMA_SQL = `
-- Only statements that are valid on every historical database belong here.
-- Indexes on columns added by migrate() (e.g. customer_playlists.device_id,
-- outbox_emails.provider_id) are created inside migrate() after the column exists;
-- otherwise CREATE INDEX fails on an old database before migrate() can run.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'de',
  role TEXT NOT NULL DEFAULT 'customer',
  email_verified INTEGER NOT NULL DEFAULT 0,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  disabled_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  mfa_ok INTEGER NOT NULL DEFAULT 1,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,               -- 'verify_email' | 'reset_password'
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, kind);

CREATE TABLE IF NOT EXISTS mfa_secrets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  confirmed_at TEXT,
  recovery_codes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'revoked'
  activated_at TEXT,
  last_seen_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

CREATE TABLE IF NOT EXISTS customer_playlists (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_requested INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_tokens (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS pairing_requests (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  code_prefix TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT,
  poll_token_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_pairing_prefix ON pairing_requests(code_prefix);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'premium',
  status TEXT NOT NULL DEFAULT 'none',  -- none | pending | active | past_due | canceled | incomplete
  channel TEXT NOT NULL DEFAULT 'web', -- web | amazon
  provider TEXT NOT NULL DEFAULT 'none',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_event_id TEXT UNIQUE,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | pending | closed
  priority TEXT NOT NULL DEFAULT 'normal',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL,  -- customer | staff | system
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  ip TEXT,
  created_at TEXT NOT NULL
);

-- Widerruf (§ 356a BGB) und Kündigung (§ 312k BGB) über die Website.
-- Die Zeile ist der Beleg: wann welche Erklärung zu welchem Vertrag einging.
CREATE TABLE IF NOT EXISTS contract_requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,                 -- withdrawal | cancellation
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  contract TEXT NOT NULL DEFAULT '',
  note TEXT,
  status TEXT NOT NULL,               -- received | canceled_web | store_channel | no_subscription | no_account | failed
  channel TEXT,
  effective_at TEXT,
  handled_at TEXT,                    -- NULL = noch offen für den Support
  handled_by TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contract_requests_created ON contract_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_contract_requests_email ON contract_requests(email);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip TEXT,
  user_agent TEXT,
  meta TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbox_emails (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed
  provider_id TEXT,
  provider_status TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL,          -- bounce | complaint | manual
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS faq_items (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  question_de TEXT NOT NULL,
  answer_de TEXT NOT NULL,
  question_en TEXT NOT NULL,
  answer_en TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS data_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,       -- export | deletion
  status TEXT NOT NULL DEFAULT 'requested',
  note TEXT,
  created_at TEXT NOT NULL,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS iap_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'amazon',
  receipt_id TEXT NOT NULL,
  app_user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  term_sku TEXT,
  product_type TEXT NOT NULL,
  status TEXT NOT NULL,            -- active | canceled | expired | invalid
  auto_renewing INTEGER NOT NULL DEFAULT 0,
  purchase_date TEXT,
  renewal_date TEXT,
  cancel_date TEXT,
  grace_period_end TEXT,
  test_transaction INTEGER NOT NULL DEFAULT 0,
  raw_response TEXT,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_iap_receipt ON iap_receipts(provider, receipt_id);
CREATE INDEX IF NOT EXISTS idx_iap_user ON iap_receipts(user_id, provider);

-- One Amazon customer may only ever hold premium on one account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_amazon_customer
  ON subscriptions(provider_customer_id) WHERE provider = 'amazon';

-- Dasselbe fuer den App Store: eine Transaktion gehoert zu genau einem Konto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subs_apple_customer
  ON subscriptions(provider_customer_id) WHERE provider = 'apple';

-- Cross-device resume for premium accounts: one position per title and user.
CREATE TABLE IF NOT EXISTS watch_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
  position_ms INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, media_url)
);
CREATE INDEX IF NOT EXISTS idx_watch_progress_user ON watch_progress(user_id, updated_at);

CREATE TABLE IF NOT EXISTS request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route TEXT NOT NULL,
  status INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
`;
