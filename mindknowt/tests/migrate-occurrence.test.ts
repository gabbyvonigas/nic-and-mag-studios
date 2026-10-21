/**
 * The occurrence_at column, against a database that predates it.
 *
 * The half that matters is what must NOT happen: no existing completion may
 * acquire a firing it never named. A row written before this column cannot say
 * which of a day's firings it answered, and guessing one from `completed_at`
 * would either silence a real alarm or raise one for something already done.
 * So the column is nullable with no back-fill, and an old row keeps covering
 * its whole day exactly as it did.
 *
 * A fresh database proves nothing here: `TABLES_SQL` carries the column, so an
 * install built from it has one already. This builds the v17 events table by
 * hand, with rows in it, and then runs the real migration loop over it.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs migrate-occurrence.test.ts
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { ADDED_COLUMNS, BACKFILLS, INDEXES_SQL, SCHEMA_VERSION, TABLES_SQL } =
  await import(`${ROOT}/src/db/schema.ts`);
const { completedOccurrences, isOccurrenceDone } = await import(
  `${ROOT}/src/knowts/completions.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.some((row) => row.name === column);
}

/** Mirrors the order in `migrate()` in database.ts. */
function migrate(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
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
  if (current < SCHEMA_VERSION) {
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

/** Tuesday, October 20 2026. Two firings, 8:17 pm and 10:00 pm. */
const AT_817 = new Date(2026, 9, 20, 20, 17);
const AT_2200 = new Date(2026, 9, 20, 22, 0);

/**
 * The events table as a v17 install actually has it: everything but
 * `occurrence_at`, written out rather than taken from `TABLES_SQL`, which
 * already carries the column.
 */
const V17_EVENTS = `
CREATE TABLE events (
  id           TEXT PRIMARY KEY NOT NULL,
  knowt_id     TEXT NOT NULL,
  schedule_id  TEXT,
  fired_at     INTEGER,
  completed_at INTEGER,
  method       TEXT CHECK (method IN ('scan', 'tap', 'override', 'missed')),
  note         TEXT,
  snooze_count INTEGER NOT NULL DEFAULT 0
);
`;

function atVersion17(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(V17_EVENTS);
  // Three rows an install would plausibly be carrying: a tap, a scan, and a
  // ringing session that was opened and never completed.
  db.exec(`
    INSERT INTO events (id, knowt_id, schedule_id, fired_at, completed_at, method, note, snooze_count)
    VALUES
      ('e-tap',  'k1', 's1', NULL,            ${AT_817.getTime()}, 'tap',  NULL, 0),
      ('e-scan', 'k2', 's2', ${AT_817.getTime()}, ${AT_817.getTime()}, 'scan', NULL, 0),
      ('e-open', 'k3', 's3', ${AT_817.getTime()}, NULL,            NULL,   NULL, 0);
  `);
  db.exec('PRAGMA user_version = 17');
  return db;
}

type Row = Record<string, unknown>;

const read = (db: DatabaseSync): Row[] =>
  db.prepare('SELECT * FROM events ORDER BY id').all() as Row[];

// --- The upgrade. --------------------------------------------------------

check('the column is missing at 17 and present after', () => {
  const db = atVersion17();
  assert.equal(columnExists(db, 'events', 'occurrence_at'), false);
  migrate(db);
  assert.equal(columnExists(db, 'events', 'occurrence_at'), true);
  assert.equal(SCHEMA_VERSION, 18);
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(row.user_version, 18);
});

check('every existing row comes through with it null', () => {
  const db = atVersion17();
  migrate(db);
  const rows = read(db);
  assert.equal(rows.length, 3, 'a row was lost');
  for (const row of rows) {
    assert.equal(row.occurrence_at, null, `${row.id} acquired a firing`);
  }
  // And nothing else about them moved.
  const tap = rows.find((row) => row.id === 'e-tap') as Row;
  assert.equal(tap.completed_at, AT_817.getTime());
  assert.equal(tap.method, 'tap');
  const open = rows.find((row) => row.id === 'e-open') as Row;
  assert.equal(open.completed_at, null);
  assert.equal(open.fired_at, AT_817.getTime());
});

check('and an upgraded row still covers its whole day, as it always did', () => {
  const db = atVersion17();
  migrate(db);
  const rows = read(db);
  const done = completedOccurrences(rows as never);
  // The tap at 8:17 pm. It cannot say which firing it answered, so it covers
  // the day: both 8:17 and 10:00 read as done.
  assert.ok(isOccurrenceDone(done, 's1', AT_817));
  assert.ok(isOccurrenceDone(done, 's1', AT_2200));
  // The one that was never completed is not a completion at all.
  assert.ok(!isOccurrenceDone(done, 's3', AT_817));
});

check('a row written after the upgrade covers one firing only', () => {
  const db = atVersion17();
  migrate(db);
  db.exec(`
    INSERT INTO events (id, knowt_id, schedule_id, fired_at, completed_at, method, note, snooze_count, occurrence_at)
    VALUES ('e-new', 'k9', 's9', NULL, ${AT_817.getTime()}, 'tap', NULL, 0, ${AT_817.getTime()});
  `);
  const done = completedOccurrences(read(db) as never);
  assert.ok(isOccurrenceDone(done, 's9', AT_817));
  assert.ok(!isOccurrenceDone(done, 's9', AT_2200), 'it covered the whole day');
});

check('running it twice changes nothing', () => {
  // A half applied upgrade has to be able to run again, which is why the loop
  // checks `PRAGMA table_info` rather than trusting the version alone.
  const db = atVersion17();
  migrate(db);
  const before = JSON.stringify(read(db));
  migrate(db);
  assert.equal(JSON.stringify(read(db)), before);
});

check('a fresh database has the column from the table definition', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(TABLES_SQL.replace(/PRAGMA journal_mode = WAL;/, ''));
  assert.equal(columnExists(db, 'events', 'occurrence_at'), true);
  // Which is exactly why the checks above build the old shape by hand.
  assert.match(TABLES_SQL, /occurrence_at INTEGER/);
});

check('the step is declared at 18 and adds nothing else', () => {
  const steps = (ADDED_COLUMNS as Row[]).filter((step) => step.to === 18);
  assert.equal(steps.length, 1);
  assert.equal(steps[0]!.table, 'events');
  assert.equal(steps[0]!.column, 'occurrence_at');
  // Nullable, so no existing row has to be given a value.
  assert.equal(steps[0]!.type, 'INTEGER');
  // And no back-fill, which is the whole point.
  assert.equal((BACKFILLS as Row[]).filter((fill) => fill.to === 18).length, 0);
});

console.log(`\n${passed} checks passed against a v17 database.`);
