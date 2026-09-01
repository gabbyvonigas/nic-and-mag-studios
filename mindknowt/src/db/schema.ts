import { CATEGORY_COLORS } from '../theme/categoryColors';

/**
 * Schema per spec section 3. Bump SCHEMA_VERSION and add a migration step when
 * this changes; `PRAGMA user_version` is the on-device record of which version
 * a given install is at.
 */
export const SCHEMA_VERSION = 4;

export const TABLES_SQL = `
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
  snooze_minutes INTEGER NOT NULL DEFAULT 5,
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

CREATE TABLE IF NOT EXISTS pending_alarms (
  id          TEXT PRIMARY KEY NOT NULL,
  knowt_id    TEXT NOT NULL REFERENCES knowts(id) ON DELETE CASCADE,
  -- NULL for a re-fire, a snooze, or a test ring, none of which belong to a
  -- particular schedule.
  schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
  -- The id AlarmKit handed back, which is what cancelling needs.
  alarmkit_id TEXT NOT NULL,
  fires_at    INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('scheduled', 'refire', 'snooze', 'test')),
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

`;

/**
 * Created after any migration has run. `idx_categories_key` references a column
 * that migration 2 adds, so creating it alongside the tables would fail on an
 * older database, where the column does not exist yet.
 */
export const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_schedules_knowt ON schedules(knowt_id);
CREATE INDEX IF NOT EXISTS idx_events_knowt    ON events(knowt_id);
CREATE INDEX IF NOT EXISTS idx_events_schedule ON events(schedule_id);
CREATE INDEX IF NOT EXISTS idx_knowts_archived ON knowts(archived);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_key
  ON categories(key) WHERE key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_knowt ON pending_alarms(knowt_id);
CREATE INDEX IF NOT EXISTS idx_pending_fires ON pending_alarms(fires_at);
`;

/** Columns each version adds, applied only when missing. */
export const ADDED_COLUMNS: { to: number; table: string; column: string; type: string }[] = [
  { to: 2, table: 'categories', column: 'key', type: 'TEXT' },
  { to: 2, table: 'knowts', column: 'suggested_mode', type: 'TEXT' },
  { to: 3, table: 'knowts', column: 'daily_target', type: 'INTEGER' },
  { to: 3, table: 'knowts', column: 'target_unit', type: 'TEXT' },
];

/**
 * Repaints the shipped categories. `categories.color` is written once at seed
 * time, so changing the palette constant alone leaves every existing install on
 * the old colors. Custom categories are matched by `is_custom = 0` and never
 * touched, because their color is the user's choice.
 */
const RECOLOR_SQL = Object.entries(CATEGORY_COLORS)
  .map(
    ([key, color]) =>
      `UPDATE categories SET color = '${color}' WHERE key = '${key}' AND is_custom = 0;`,
  )
  .join('\n');

/** Data fixes that run once, after the columns for that version exist. */
export const BACKFILLS: { to: number; sql: string }[] = [
  {
    to: 2,
    // Shipped categories were seeded before keys existed, and their display
    // names are still the originals, so they can be matched safely.
    sql: `UPDATE categories SET key = lower(name) WHERE key IS NULL AND is_custom = 0;`,
  },
  { to: 4, sql: RECOLOR_SQL },
  {
    to: 4,
    // Ten minutes was too long in testing. Nothing edits this value yet, so
    // every row still holds the old default and none of this is a user choice
    // being overwritten.
    sql: `UPDATE knowts SET snooze_minutes = 5 WHERE snooze_minutes = 10;`,
  },
];

/** Content tables, in dependency order for a reseed. Excludes app_meta. */
export const CONTENT_TABLES = ['events', 'schedules', 'knowts', 'categories'] as const;
