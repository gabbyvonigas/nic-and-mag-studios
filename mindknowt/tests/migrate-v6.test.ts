/**
 * The v5 to v6 upgrade against a database built in the v5 shape.
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs migrate-v6.test.ts
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

import {
  ADDED_COLUMNS,
  BACKFILLS,
  INDEXES_SQL,
  SCHEMA_VERSION,
  TABLES_SQL,
} from '../src/db/schema.ts';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** The v5 shape: no priority, no interval_months, and 'soft' still in use. */
const V5_SQL = `
CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, key TEXT,
  color TEXT NOT NULL, icon TEXT NOT NULL,
  is_custom INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE knowts (
  id TEXT PRIMARY KEY NOT NULL, tag_uid TEXT UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('strict','soft','open')),
  name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'dot',
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  location_note TEXT, notes TEXT, link_url TEXT,
  suggested_mode TEXT CHECK (suggested_mode IN ('strict','soft','open')),
  daily_target INTEGER, target_unit TEXT,
  refire_minutes INTEGER NOT NULL DEFAULT 5,
  snooze_minutes INTEGER NOT NULL DEFAULT 5,
  archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE schedules (
  id TEXT PRIMARY KEY NOT NULL,
  knowt_id TEXT NOT NULL REFERENCES knowts(id) ON DELETE CASCADE,
  label TEXT, time TEXT NOT NULL,
  repeat_type TEXT NOT NULL CHECK (repeat_type IN
    ('daily','weekdays','weekends','days_of_week','interval','supply','once')),
  days_of_week TEXT, interval_days INTEGER, supply_days INTEGER,
  lead_days INTEGER, start_date TEXT,
  enabled INTEGER NOT NULL DEFAULT 1, alarmkit_id TEXT
);
CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  knowt_id TEXT NOT NULL REFERENCES knowts(id) ON DELETE CASCADE,
  schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
  fired_at INTEGER, completed_at INTEGER,
  method TEXT, note TEXT, snooze_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE pending_alarms (
  id TEXT PRIMARY KEY NOT NULL,
  knowt_id TEXT NOT NULL REFERENCES knowts(id) ON DELETE CASCADE,
  schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
  alarmkit_id TEXT NOT NULL, fires_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('scheduled','refire','snooze','test')),
  signature TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
PRAGMA user_version = 5;
`;

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/** Mirrors the order in database.ts migrate(). */
function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row?.user_version ?? 0;

  db.exec(TABLES_SQL.replace(/PRAGMA journal_mode = WAL;/, ''));
  for (const step of ADDED_COLUMNS) {
    if (current >= step.to) continue;
    if (columnExists(db, step.table, step.column)) continue;
    db.exec(`ALTER TABLE ${step.table} ADD COLUMN ${step.column} ${step.type}`);
  }
  for (const backfill of BACKFILLS) {
    if (current < backfill.to) db.exec(backfill.sql);
  }
  db.exec(INDEXES_SQL);
  if (current < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const db = new DatabaseSync(':memory:');
db.exec(V5_SQL);
db.exec(`
INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
  VALUES ('cHome','Home','home','#C06A4C','house',0,0);
INSERT INTO knowts (id, tag_uid, mode, suggested_mode, name, icon, category_id, created_at)
  VALUES ('kStrict','04aa','strict',NULL,'Fridge filter','dot','cHome',1),
         ('kSoft','04bb','soft',NULL,'Pills','dot','cHome',2),
         ('kOpen',NULL,'open','soft','Walk','dot','cHome',3);
INSERT INTO schedules (id, knowt_id, time, repeat_type, interval_days, start_date)
  VALUES ('s1','kStrict','08:00','interval',3,'2026-01-01');
INSERT INTO events (id, knowt_id, schedule_id, completed_at, method)
  VALUES ('e1','kStrict','s1',1000,'scan');
`);

migrate(db);

check('stamps v6', () => {
  const v = db.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(v.user_version, SCHEMA_VERSION);
});

check('adds priority, defaulting everything to normal', () => {
  assert.ok(columnExists(db, 'knowts', 'priority'));
  const rows = db.prepare('SELECT id, priority FROM knowts').all() as
    { id: string; priority: number }[];
  assert.equal(rows.length, 3);
  for (const r of rows) assert.equal(r.priority, 1, `${r.id} should be normal`);
});

check('adds interval_months without disturbing interval_days', () => {
  assert.ok(columnExists(db, 'schedules', 'interval_months'));
  const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get('s1') as
    { interval_days: number; interval_months: number | null; start_date: string };
  assert.equal(row.interval_days, 3, 'the existing rhythm survives');
  assert.equal(row.interval_months, null);
  assert.equal(row.start_date, '2026-01-01');
});

check('soft becomes open, and strict is untouched', () => {
  const rows = db.prepare('SELECT id, mode FROM knowts ORDER BY id').all() as
    { id: string; mode: string }[];
  const byId = new Map(rows.map((r) => [r.id, r.mode]));
  assert.equal(byId.get('kSoft'), 'open', 'soft collapses into Alarm Only');
  assert.equal(byId.get('kStrict'), 'strict', 'Scan Knowt stays');
  assert.equal(byId.get('kOpen'), 'open');
});

check('a soft suggestion also becomes open', () => {
  const row = db.prepare('SELECT suggested_mode FROM knowts WHERE id = ?').get('kOpen') as
    { suggested_mode: string | null };
  assert.equal(row.suggested_mode, 'open');
});

check('the tag survives the mode collapse', () => {
  const row = db.prepare('SELECT tag_uid FROM knowts WHERE id = ?').get('kSoft') as
    { tag_uid: string | null };
  assert.equal(row.tag_uid, '04bb', 'an Alarm Only knowt can still hold a tag');
});

check('no knowt is left on soft', () => {
  const row = db.prepare("SELECT COUNT(*) AS n FROM knowts WHERE mode = 'soft'").get() as
    { n: number };
  assert.equal(row.n, 0);
});

check('history survives', () => {
  const row = db.prepare('SELECT COUNT(*) AS n FROM events').get() as { n: number };
  assert.equal(row.n, 1);
});

check('open is still a writable mode after the migration', () => {
  db.exec(`INSERT INTO knowts (id, tag_uid, mode, name, icon, created_at)
           VALUES ('kNew',NULL,'open','New','dot',9)`);
  const row = db.prepare('SELECT priority FROM knowts WHERE id = ?').get('kNew') as
    { priority: number };
  assert.equal(row.priority, 1, 'the column default applies to new rows too');
});

check('a monthly schedule can be written on an upgraded database', () => {
  // The whole reason months ride on repeat_type 'interval': the old CHECK
  // constraint is still on this table and would reject a new repeat value.
  db.exec(`INSERT INTO schedules (id, knowt_id, time, repeat_type, interval_months, start_date)
           VALUES ('s2','kStrict','09:00','interval',6,'2026-02-15')`);
  const row = db.prepare('SELECT interval_months FROM schedules WHERE id = ?').get('s2') as
    { interval_months: number };
  assert.equal(row.interval_months, 6);
});

check('the old CHECK really would have rejected a new repeat value', () => {
  assert.throws(
    () =>
      db.exec(`INSERT INTO schedules (id, knowt_id, time, repeat_type)
               VALUES ('s3','kStrict','09:00','monthly')`),
    'confirms why months ride on interval rather than a new type',
  );
});

check('is safe to run twice', () => {
  migrate(db);
  const v = db.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(v.user_version, SCHEMA_VERSION);
});

check('a second run does not re-collapse an edited mode', () => {
  db.exec(`UPDATE knowts SET mode = 'soft' WHERE id = 'kSoft'`);
  migrate(db);
  const row = db.prepare('SELECT mode FROM knowts WHERE id = ?').get('kSoft') as
    { mode: string };
  assert.equal(row.mode, 'soft', 'back-fills must not run again once stamped');
});

console.log(`\n${passed} checks passed against a v5 database.`);
