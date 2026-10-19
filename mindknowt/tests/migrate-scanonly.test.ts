/**
 * The scan_only column, against a database that predates it.
 *
 * The half that matters is what must NOT happen: no existing Knowt may become
 * a Scan Knowt on upgrade. Four Knowts applied from presets have no schedule,
 * which is exactly the shape the old derived rule mistook for one, so the
 * default has to carry every existing row to 0.
 *
 * A fresh database proves nothing here: it is built from the current schema
 * and has the column already. This builds a v16 knowts table with rows in it
 * and then runs the real migration loop over it.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs migrate-scanonly.test.ts
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { ADDED_COLUMNS, BACKFILLS, INDEXES_SQL, SCHEMA_VERSION, TABLES_SQL } =
  await import(`${ROOT}/src/db/schema.ts`);

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

/**
 * A database as an install stamped at 16 actually is: the current tables, then
 * every column added at or before 16, which is all of them but scan_only.
 */
function atVersion16(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(TABLES_SQL.replace(/PRAGMA journal_mode = WAL;/, ''));
  for (const step of ADDED_COLUMNS) {
    if (step.to > 16) continue;
    if (columnExists(db, step.table, step.column)) continue;
    db.exec(`ALTER TABLE ${step.table} ADD COLUMN ${step.column} ${step.type}`);
  }
  db.exec('PRAGMA user_version = 16');
  return db;
}

function seedKnowt(db: DatabaseSync, id: string, name: string): void {
  db.prepare(
    `INSERT INTO knowts (id, tag_uid, mode, name, icon, created_at)
     VALUES (?, NULL, 'open', ?, 'dot', 0)`,
  ).run(id, name);
}

/** A v16 install with the four preset Knowts that have no schedule. */
function seeded(): DatabaseSync {
  const db = atVersion16();
  seedKnowt(db, 'k1', 'Afternoon supplements');
  seedKnowt(db, 'k2', 'Garbage disposal cleaner');
  seedKnowt(db, 'k3', 'Pantry expiry sweep');
  seedKnowt(db, 'k4', 'Stretch or mobility');
  // One with a schedule, so the fixture is not all of one kind.
  seedKnowt(db, 'k5', 'Vitamins');
  db.prepare(
    `INSERT INTO schedules (id, knowt_id, time, repeat_type, enabled)
     VALUES ('s1', 'k5', '09:00', 'daily', 1)`,
  ).run();
  return db;
}

check('the fixture really is older, with no scan_only', () => {
  // Otherwise this whole file passes trivially against the current schema.
  const db = seeded();
  assert.equal(columnExists(db, 'knowts', 'scan_only'), false);
  const row = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  assert.equal(row.user_version, 16);
});

check('migrating adds the column and stamps 17', () => {
  const db = seeded();
  migrate(db);
  assert.equal(columnExists(db, 'knowts', 'scan_only'), true);
  const row = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  assert.equal(row.user_version, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, 17);
});

check('no existing Knowt becomes a Scan Knowt', () => {
  // The whole point of the default. Every one of these has no schedule, which
  // is what the old derived rule read as Scan Knowt.
  const db = seeded();
  migrate(db);
  const rows = db
    .prepare('SELECT id, name, scan_only FROM knowts ORDER BY id')
    .all() as { id: string; name: string; scan_only: number }[];
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.equal(row.scan_only, 0, `${row.name} came through as a Scan Knowt`);
  }
});

check('an unscheduled Knowt keeps having no schedule, untouched', () => {
  // The migration adds a column. It must not invent schedules either.
  const db = seeded();
  migrate(db);
  const counts = db
    .prepare('SELECT knowt_id, COUNT(*) AS n FROM schedules GROUP BY knowt_id')
    .all() as { knowt_id: string; n: number }[];
  assert.equal(counts.length, 1);
  assert.equal(counts[0]!.knowt_id, 'k5');
  assert.equal(counts[0]!.n, 1);
});

check('a half-applied upgrade can run again', () => {
  // The column added but the version not stamped, which is what a crash
  // between the two leaves behind.
  const db = seeded();
  db.exec('ALTER TABLE knowts ADD COLUMN scan_only INTEGER NOT NULL DEFAULT 0');
  migrate(db);
  const row = db.prepare('PRAGMA user_version').get() as {
    user_version: number;
  };
  assert.equal(row.user_version, SCHEMA_VERSION);
});

check('migrating twice changes nothing', () => {
  const db = seeded();
  migrate(db);
  db.prepare('UPDATE knowts SET scan_only = 1 WHERE id = ?').run('k2');
  migrate(db);
  const row = db
    .prepare('SELECT scan_only FROM knowts WHERE id = ?')
    .get('k2') as { scan_only: number };
  // A choice made after the upgrade survives the next one.
  assert.equal(row.scan_only, 1);
});

check('a fresh install has the column too', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA user_version = 0');
  migrate(db);
  assert.equal(columnExists(db, 'knowts', 'scan_only'), true);
});

check('scan_only is not in TABLES_SQL, so the column path is the only one', () => {
  // It arrives from ADDED_COLUMNS on a fresh database as well as an upgrade.
  // Putting it in both would be two places to change and one to forget.
  assert.ok(!/scan_only/.test(TABLES_SQL));
  assert.ok(
    ADDED_COLUMNS.some(
      (step) => step.table === 'knowts' && step.column === 'scan_only',
    ),
  );
});

check('nothing was back-filled for it', () => {
  // A back-fill is how an existing row would have been turned into a Scan
  // Knowt, so there must not be one.
  assert.ok(!BACKFILLS.some((step) => /scan_only/.test(step.sql)));
});

console.log(`\n${passed} checks passed`);
