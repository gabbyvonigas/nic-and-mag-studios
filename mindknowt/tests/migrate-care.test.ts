/**
 * Wellness becoming Care, against a database that already has the old name.
 *
 * The thing worth asserting is the half that must NOT happen: a category the
 * person renamed themselves is never overwritten. `is_custom = 0` only says the
 * row shipped with the app, not that its name is still the shipped one.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs migrate-care.test.ts
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { BACKFILLS, SCHEMA_VERSION } = await import(`${ROOT}/src/db/schema.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** A v15 database: categories as they stood before the rename. */
function v15(names: { key: string; name: string; isCustom?: number }[]) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE categories (
    id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, key TEXT,
    color TEXT NOT NULL, icon TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0, sort INTEGER NOT NULL DEFAULT 0,
    color_locked INTEGER NOT NULL DEFAULT 0
  );`);
  for (const [i, row] of names.entries()) {
    db.prepare(
      `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
       VALUES (?, ?, ?, '#000000', 'heart', ?, ?)`,
    ).run(`cat_${row.key}`, row.name, row.key, row.isCustom ?? 0, i);
  }
  return db;
}

/** Runs only the back-fills an install at `from` has not seen yet. */
function migrateFrom(db: InstanceType<typeof DatabaseSync>, from: number) {
  for (const step of BACKFILLS) {
    if (step.to > from && step.to <= SCHEMA_VERSION) {
      db.exec(step.sql);
    }
  }
}

const nameOf = (db: InstanceType<typeof DatabaseSync>, key: string) =>
  (db.prepare('SELECT name FROM categories WHERE key = ?').get(key) as
    | { name: string }
    | undefined)?.name;

check('the shipped Wellness is renamed to Care', () => {
  const db = v15([{ key: 'care', name: 'Wellness' }]);
  migrateFrom(db, 15);
  assert.equal(nameOf(db, 'care'), 'Care');
});

check('a name the person chose themselves is left alone', () => {
  // The case `is_custom = 0` alone would get wrong: a shipped row whose name
  // was edited. Renaming it would quietly undo their edit.
  const db = v15([{ key: 'care', name: 'Health stuff' }]);
  migrateFrom(db, 15);
  assert.equal(nameOf(db, 'care'), 'Health stuff');
});

check('a custom category that happens to be called Wellness survives', () => {
  const db = v15([
    { key: 'care', name: 'Wellness' },
    { key: 'mine', name: 'Wellness', isCustom: 1 },
  ]);
  migrateFrom(db, 15);
  assert.equal(nameOf(db, 'care'), 'Care');
  assert.equal(nameOf(db, 'mine'), 'Wellness');
});

check('running it twice changes nothing the second time', () => {
  const db = v15([{ key: 'care', name: 'Wellness' }]);
  migrateFrom(db, 15);
  migrateFrom(db, 15);
  assert.equal(nameOf(db, 'care'), 'Care');
});

check('an install coming all the way from v9 lands on Care', () => {
  // v10's rename runs on the way through, so this proves the two agree
  // rather than fighting.
  const db = v15([{ key: 'care', name: 'Self care' }, { key: 'go', name: 'Out' }]);
  migrateFrom(db, 9);
  assert.equal(nameOf(db, 'care'), 'Care');
  assert.equal(nameOf(db, 'go'), 'Activity');
});

check('the other shipped names are untouched by this step', () => {
  const db = v15([
    { key: 'care', name: 'Wellness' },
    { key: 'home', name: 'Home' },
    { key: 'daily', name: 'Daily' },
  ]);
  migrateFrom(db, 15);
  assert.equal(nameOf(db, 'home'), 'Home');
  assert.equal(nameOf(db, 'daily'), 'Daily');
});

// The seed, and the labels a person actually reads.

check('a new install seeds Care, not Wellness', async () => {
  const seed = await (await import('node:fs/promises')).readFile(
    `${ROOT}/src/db/seed.ts`,
    'utf8',
  );
  assert.match(seed, /key: 'care', name: 'Care'/);
  assert.ok(!/name: 'Wellness'/.test(seed), 'the seed still says Wellness');
});

check('no user-facing label anywhere still says Wellness', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const path = await import('node:path');

  const files: string[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.expo', '.git'].includes(entry.name)) continue;
        await walk(full);
      } else if (/\.(ts|tsx|json)$/.test(entry.name)) {
        files.push(full);
      }
    }
  }
  await walk(`${ROOT}/src`);
  files.push(`${ROOT}/assets/starter-sets.json`);

  const allowed = [
    // The migration has to name the old word to match on it.
    'src/db/schema.ts',
    // Set ids, which are keys and never rendered.
    'src/sets/presentation.ts',
    'assets/starter-sets.json',
  ];

  const offenders: string[] = [];
  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    if (allowed.some((a) => rel === a)) continue;
    const text = await readFile(file, 'utf8');
    if (/wellness/i.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `Wellness still appears in: ${offenders.join(', ')}`);
});

console.log(`\n${passed} checks passed`);
