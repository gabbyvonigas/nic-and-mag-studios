/**
 * Schema per spec section 3. Bump SCHEMA_VERSION and add a migration step when
 * this changes; `PRAGMA user_version` is the on-device record of which version
 * a given install is at.
 */
export const SCHEMA_VERSION = 3;

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY NOT NULL,
  name      TEXT NOT NULL,
  -- Stable identifier for shipped categories. Starter-set JSON references this
  -- rather than the generated id or the display name, so renaming a category
  -- in the UI cannot break bundled content. NULL for user-made categories.
  key       TEXT,
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
  -- What this knowt should become once a tag is attached. Strict and Soft both
  -- require a tag, and applying a starter set creates untagged knowts, so the
  -- set's suggestion is stored rather than applied immediately.
  suggested_mode TEXT CHECK (suggested_mode IN ('strict', 'soft', 'open')),
  -- Countable habits. A knowt with a daily_target is completed N times a day
  -- rather than once, which is what a water tracker needs. NULL means the
  -- knowt is an ordinary one-per-instance task, so no separate kind column is
  -- required to tell them apart.
  daily_target   INTEGER,
  target_unit    TEXT,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_key
  ON categories(key) WHERE key IS NOT NULL;
`;

/**
 * Applied in order to an existing database. A fresh database is created
 * directly from SCHEMA_SQL above and skips these, so every step here must be
 * written only for the upgrade path.
 */
export const MIGRATIONS: { to: number; sql: string }[] = [
  {
    to: 2,
    sql: `
      ALTER TABLE categories ADD COLUMN key TEXT;
      ALTER TABLE knowts ADD COLUMN suggested_mode TEXT;

      -- Shipped categories were seeded before keys existed; their display names
      -- are still the originals, so they can be matched safely here.
      UPDATE categories SET key = lower(name) WHERE key IS NULL AND is_custom = 0;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_key
        ON categories(key) WHERE key IS NOT NULL;
    `,
  },
  {
    to: 3,
    sql: `
      ALTER TABLE knowts ADD COLUMN daily_target INTEGER;
      ALTER TABLE knowts ADD COLUMN target_unit TEXT;
    `,
  },
];

/** Content tables, in dependency order for a reseed. Excludes app_meta. */
export const CONTENT_TABLES = ['events', 'schedules', 'knowts', 'categories'] as const;
