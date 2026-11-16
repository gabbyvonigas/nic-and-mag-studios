import * as SQLite from 'expo-sqlite';

import {
  ADDED_COLUMNS,
  BACKFILLS,
  CONTENT_TABLES,
  INDEXES_SQL,
  SCHEMA_VERSION,
  TABLES_SQL,
} from './schema';

const DATABASE_NAME = 'mindknowt.db';

/**
 * Spec section 3: stamped on first run and never changed. If advertising or
 * additional monetization is ever introduced, this identifies buyers from the
 * original paid-only era so they can be excluded. Cheap now, impossible to
 * retrofit, which is exactly why it is written before anything else.
 */
export const INSTALL_GENERATION = 'pre_ads';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function columnExists(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.getAllAsync<{ name: string }>(
    `PRAGMA table_info(${table})`,
  );
  return rows.some((r) => r.name === column);
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const current = row?.user_version ?? 0;

  // Tables first. Every statement is CREATE ... IF NOT EXISTS, so this creates
  // the current shape on a fresh database and does nothing on an existing one.
  await db.execAsync(TABLES_SQL);

  // Columns next, and only when actually missing. A fresh database already has
  // them from TABLES_SQL, and an upgrade that half-applied before must be able
  // to run again rather than failing forever on a duplicate column.
  for (const step of ADDED_COLUMNS) {
    if (current >= step.to) continue;
    if (await columnExists(db, step.table, step.column)) continue;
    await db.execAsync(
      `ALTER TABLE ${step.table} ADD COLUMN ${step.column} ${step.type}`,
    );
  }

  for (const backfill of BACKFILLS) {
    if (current < backfill.to) await db.execAsync(backfill.sql);
  }

  // Indexes last: some reference columns the steps above add, so creating them
  // any earlier fails on a database that predates those columns.
  await db.execAsync(INDEXES_SQL);

  if (current < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
}

/**
 * INSERT OR IGNORE is the whole point: these keys are written if absent and
 * never overwritten, so a value stamped at first launch survives every
 * subsequent launch, migration and reseed.
 */
async function ensureAppMeta(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.runAsync(
    'INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)',
    'install_generation',
    INSTALL_GENERATION,
  );
  await db.runAsync(
    'INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)',
    'first_launch_at',
    String(Date.now()),
  );
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrate(db);
      await ensureAppMeta(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function getAppMeta(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

/**
 * Keys stamped once at first launch. Spec section 3 requires
 * `install_generation` to be immutable, so the generic setter refuses to touch
 * it rather than relying on every caller to remember.
 */
const IMMUTABLE_META_KEYS = new Set(['install_generation', 'first_launch_at']);

export async function setAppMeta(key: string, value: string): Promise<void> {
  if (IMMUTABLE_META_KEYS.has(key)) {
    throw new Error(
      `app_meta.${key} is stamped at first launch and must never be rewritten.`,
    );
  }
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
    key,
    value,
  );
}

export async function getAllAppMeta(): Promise<Record<string, string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM app_meta ORDER BY key',
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Empties the content tables but deliberately leaves `app_meta` intact, so a
 * dev reseed cannot rewrite `install_generation` or `first_launch_at`. Use
 * `destroyDatabase` to simulate a genuine first launch.
 */
export async function clearContent(): Promise<void> {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    for (const table of CONTENT_TABLES) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });
}

/** Deletes the database file entirely. The next `getDatabase()` is a first launch. */
export async function destroyDatabase(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    await db.closeAsync();
    dbPromise = null;
  }
  await SQLite.deleteDatabaseAsync(DATABASE_NAME);
}
