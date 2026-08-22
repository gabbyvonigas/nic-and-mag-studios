/**
 * Schema per spec section 3. Bump SCHEMA_VERSION and add a migration step when
 * this changes; `PRAGMA user_version` is the on-device record of which version
 * a given install is at.
 */
export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY NOT NULL,
  name      TEXT NOT NULL,
  color     TEXT NOT NULL,
  icon      TEXT NOT NULL,
  is_custom INTEGER NOT NULL DEFAULT 0,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS knowts (
  id             TEXT PRIMARY KEY NOT NULL,
  tag_uid        TEXT UNIQUE,
  mode           TEXT NOT NULL CHECK (mode IN ('strict', 'soft', 'open')),
  name           TEXT NOT NULL,
  icon           TEXT NOT NULL DEFAULT 'dot',
  category_id    TEXT REFERENCES categories(id) ON DELETE SET NULL,
  location_note  TEXT,
  notes          TEXT,
  link_url       TEXT,
  refire_minutes INTEGER NOT NULL DEFAULT 5,
  snooze_minutes INTEGER NOT NULL DEFAULT 10,
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id            TEXT PRIMARY KEY NOT NULL,
  knowt_id      TEXT NOT NULL REFERENCES knowts(id) ON DELETE CASCADE,
  label         TEXT,
  time          TEXT NOT NULL,
  repeat_type   TEXT NOT NULL CHECK (repeat_type IN
                  ('daily','weekdays','weekends','days_of_week','interval','supply','once')),
  days_of_week  TEXT,
  interval_days INTEGER,
  supply_days   INTEGER,
  lead_days     INTEGER,
  start_date    TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  alarmkit_id   TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY NOT NULL,
  knowt_id     TEXT NOT NULL REFERENCES knowts(id) ON DELETE CASCADE,
  schedule_id  TEXT REFERENCES schedules(id) ON DELETE SET NULL,
  fired_at     INTEGER,
  completed_at INTEGER,
  method       TEXT CHECK (method IN ('scan', 'tap', 'override', 'missed')),
  note         TEXT,
  snooze_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedules_knowt ON schedules(knowt_id);
CREATE INDEX IF NOT EXISTS idx_events_knowt    ON events(knowt_id);
CREATE INDEX IF NOT EXISTS idx_events_schedule ON events(schedule_id);
CREATE INDEX IF NOT EXISTS idx_knowts_archived ON knowts(archived);
`;

/** Content tables, in dependency order for a reseed. Excludes app_meta. */
export const CONTENT_TABLES = ['events', 'schedules', 'knowts', 'categories'] as const;
