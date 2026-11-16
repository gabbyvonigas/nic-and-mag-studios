/**
 * The category palette back-fills, against a database carrying an older one.
 *
 * v4 is where the recolor first ran, so an install that is already past v4
 * never runs it again. That is the whole reason v7 exists, and the reason this
 * starts at v6 rather than at nothing.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs migrate-palette.test.ts
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
import {
  CATEGORY_COLORS,
  CATEGORY_FILL,
  CATEGORY_INK,
} from '../src/theme/categoryColors.ts';
import { palette } from '../src/theme/palette.ts';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** The v6 shape: everything v6 added, holding the pre-brightening colors. */
const V6_SQL = `
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
  daily_target INTEGER, target_unit TEXT, priority INTEGER NOT NULL DEFAULT 1,
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
  days_of_week TEXT, interval_days INTEGER, interval_months INTEGER, supply_days INTEGER,
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
PRAGMA user_version = 6;
`;

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/** Mirrors the order in database.ts migrate(). */
/**
 * A database as an install stamped at `from` would actually be.
 *
 * The v6 table plus every column added at or before that version. Without this,
 * the fixture claims to be at 15 while carrying v6's columns, and `migrate`
 * correctly skips the ones it believes are already there.
 */
function olderAt(from: number): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(V6_SQL.replace('PRAGMA user_version = 6;', `PRAGMA user_version = ${from};`));
  for (const step of ADDED_COLUMNS) {
    if (step.to > from) continue;
    if (columnExists(db, step.table, step.column)) continue;
    db.exec(`ALTER TABLE ${step.table} ADD COLUMN ${step.column} ${step.type}`);
  }
  return db;
}

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

const { swatchGrid } = await import(
  `${ROOT}/src/theme/colorGrid.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** The colors every install was carrying before this change. */
const WAS = {
  home: '#C06A4C',
  daily: '#C4972C',
  care: '#AE7B92',
  ritual: '#7C8A4E',
  go: '#5F8FB4',
  admin: '#96897C',
} as const;

/** A color someone chose. It must survive untouched. */
const MINE = '#123456';

const db = new DatabaseSync(':memory:');
db.exec(V6_SQL);
for (const [key, color] of Object.entries(WAS)) {
  db.exec(
    `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
       VALUES ('c_${key}','${key}','${key}','${color}','dot',0,0);`,
  );
}
db.exec(
  `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
     VALUES ('c_mine','Garage',NULL,'${MINE}','dot',1,9);`,
);

function colorOf(id: string): string {
  const row = db.prepare('SELECT color FROM categories WHERE id = ?').get(id) as
    { color: string };
  return row.color;
}

migrate(db);

check('stamps the current version', () => {
  const v = db.prepare('PRAGMA user_version').get() as { user_version: number };
  assert.equal(v.user_version, SCHEMA_VERSION);
});

check('a database stamped at any older version ends on the current colors', () => {
  // RECOLOR_SQL paints whatever the constant currently says, and an install
  // already past an entry never runs it again, so every palette change needs a
  // repaint stamped at its own version. This walks each version that predates
  // the newest repaint, carrying the colors of its era, and insists it lands
  // on the current ones.
  //
  // It stops below the newest repaint on purpose. A database stamped at that
  // version already ran it, so it holds the current colors by definition, and
  // seeding it with older ones would be testing a state that cannot exist.
  const newestRepaint = Math.max(
    ...BACKFILLS.filter((b) => b.sql.includes('UPDATE categories SET color')).map((b) => b.to),
  );
  for (let from = 4; from < newestRepaint; from += 1) {
    const older = olderAt(from);
    for (const [key, color] of Object.entries(WAS)) {
      older.exec(
        `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
           VALUES ('c_${key}','${key}','${key}','${color}','dot',0,0);`,
      );
    }
    migrate(older);
    for (const key of Object.keys(WAS) as (keyof typeof WAS)[]) {
      const row = older.prepare('SELECT color FROM categories WHERE id = ?').get(`c_${key}`) as
        { color: string };
      assert.equal(
        row.color,
        CATEGORY_COLORS[key],
        `a database stamped at v${from} kept the old ${key} color, so that repaint has no entry`,
      );
    }
    older.close();
  }
});

check('Routine gets a real icon, from every version that predates it', () => {
  // It shipped as 'sparkle', which CategoryIcon drew as a vertical bar crossed
  // by a horizontal one: a plus sign, wherever a category appeared.
  const iconStep = BACKFILLS.find((b) => b.sql.includes("icon = 'clock'"));
  assert.ok(iconStep, 'the icon migration exists');

  for (let from = 4; from < iconStep!.to; from += 1) {
    const older = olderAt(from);
    older.exec(
      `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
         VALUES ('c_ritual','Ritual','ritual','#7C8A4E','sparkle',0,3);`,
    );
    // Someone who picked sparkle for their own category keeps it. The step is
    // scoped to the shipped row, and this is what holds it to that.
    older.exec(
      `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
         VALUES ('c_mine','Garage',NULL,'${MINE}','sparkle',1,9);`,
    );
    migrate(older);

    const shipped = older.prepare('SELECT icon FROM categories WHERE id = ?')
      .get('c_ritual') as { icon: string };
    assert.equal(shipped.icon, 'clock', `a database stamped at v${from} kept the plus sign`);

    const custom = older.prepare('SELECT icon FROM categories WHERE id = ?')
      .get('c_mine') as { icon: string };
    assert.equal(custom.icon, 'sparkle', 'a custom category was rewritten');
    older.close();
  }
});

check('a color someone picked survives the next palette repaint', () => {
  // This is the whole reason color_locked exists. Shipped categories are
  // repainted whenever the palette moves, and five such repaints have already
  // shipped. Without the flag the next one silently undoes their choice.
  const MINE_OWN = '#0F9D58';
  for (let from = 4; from < SCHEMA_VERSION; from += 1) {
    const older = olderAt(from);
    for (const [key, color] of Object.entries(WAS)) {
      older.exec(
        `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
           VALUES ('c_${key}','${key}','${key}','${color}','dot',0,0);`,
      );
    }
    migrate(older);

    // Recolor Home by hand, the way the screen does.
    older
      .prepare('UPDATE categories SET color = ?, color_locked = 1 WHERE id = ?')
      .run(MINE_OWN, 'c_home');

    // Now replay every repaint, which is what a later upgrade does.
    older.exec('PRAGMA user_version = 3');
    migrate(older);

    const home = older.prepare('SELECT color, color_locked FROM categories WHERE id = ?')
      .get('c_home') as { color: string; color_locked: number };
    assert.equal(home.color, MINE_OWN, `a repaint from v${from} overwrote it`);
    assert.equal(home.color_locked, 1, 'the lock was cleared');

    // Everything they did not touch still follows the palette.
    const daily = older.prepare('SELECT color FROM categories WHERE id = ?')
      .get('c_daily') as { color: string };
    assert.equal(daily.color, CATEGORY_COLORS.daily, `daily missed the repaint from v${from}`);
    older.close();
  }
});

check('an unlocked category is still repainted, so the flag is doing the work', () => {
  const db2 = new DatabaseSync(':memory:');
  db2.exec(V6_SQL.replace('PRAGMA user_version = 6;', 'PRAGMA user_version = 4;'));
  db2.exec(
    `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
       VALUES ('c_home','home','home','${WAS.home}','dot',0,0);`,
  );
  migrate(db2);
  const home = db2.prepare('SELECT color, color_locked FROM categories WHERE id = ?')
    .get('c_home') as { color: string; color_locked: number };
  assert.equal(home.color_locked, 0, 'nothing locks a category on its own');
  assert.equal(home.color, CATEGORY_COLORS.home);
  db2.close();
});

check('repaints every shipped category, which v4 alone would not have', () => {
  for (const key of Object.keys(WAS) as (keyof typeof WAS)[]) {
    assert.equal(
      colorOf(`c_${key}`),
      CATEGORY_COLORS[key],
      `${key} kept its old color`,
    );
    assert.notEqual(colorOf(`c_${key}`), WAS[key], `${key} did not move`);
  }
});

check('the values are the ones design-notes.md documents', () => {
  assert.deepEqual({ ...CATEGORY_COLORS }, {
    home: '#FF4D3D',
    daily: '#D9FA3C',
    care: '#24C2B5',
    ritual: '#A435F0',
    go: '#FF2D8A',
    admin: '#1F5FD8',
    seasonal: '#8A1F3D',
  });
});

check('nothing in the palette is muted, measured the way that can tell', () => {
  // Measured as HSL saturation, not HSV. The palette now includes deliberate
  // pastels (butter, lime, icy periwinkle) and a pastel is light but clean,
  // where muted meant gray with a hue attached. HSV cannot separate those:
  // butter yellow reads 0.50 on it, below the threshold the vivid set needed.
  // On HSL the new set runs 0.63 to 1.00 and the old mauve and taupe sat at
  // 0.24 and 0.14, which is the distinction that actually matters.
  const hslSaturation = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const l = (max + min) / 2;
    return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  };

  for (const [key, hex] of Object.entries(CATEGORY_COLORS)) {
    assert.ok(
      hslSaturation(hex) >= 0.6,
      `${key} is only ${hslSaturation(hex).toFixed(2)} saturated`,
    );
  }
  // The old muted pair must still fail, or the metric proves nothing.
  for (const wasMuted of ['#AE7B92', '#A89A8B']) {
    assert.ok(
      hslSaturation(wasMuted) < 0.6,
      `${wasMuted} was muted and the check no longer says so`,
    );
  }
  // The fixed CUSTOM_PALETTE became a generated grid. Its last row is
  // deliberately neutral, for someone who wants a quiet category; every hue
  // row still has to stay out of the muted register that was rejected.
  const grid = swatchGrid();
  for (const row of grid.slice(0, 3)) {
    for (const hex of row) {
      assert.ok(hslSaturation(hex) >= 0.45, `grid swatch ${hex} is muted`);
    }
  }
});

check('every category ink is legible on white and on the page', () => {
  const luminance = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const channel = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * channel((n >> 16) & 255) +
      0.7152 * channel((n >> 8) & 255) +
      0.0722 * channel(n & 255)
    );
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const [key, ink] of Object.entries(CATEGORY_INK)) {
    assert.ok(ratio(ink, '#FFFFFF') >= 4.5, `${key} ink fails on white`);
    assert.ok(ratio(ink, palette.page) >= 4.5, `${key} ink fails on the page`);
  }
  // No mark shade any more: every swatch draws literally, and a dot that would
  // be too faint gets a hairline ring instead of being dimmed. The ring is the
  // ink, so what matters is that ink and swatch are far enough apart to show an
  // edge. Lime against its own ink is the case this exists for.
  for (const [key, color] of Object.entries(CATEGORY_COLORS)) {
    const ink = CATEGORY_INK[key as keyof typeof CATEGORY_INK];
    const faint = ratio(color, palette.page) < 2.0;
    if (!faint) continue;
    assert.ok(
      ratio(color, ink) >= 1.5,
      `${key} is faint on the page and its ring does not show against it`,
    );
  }
});

check('Seasonal is inserted on an upgrade, not just on a fresh seed', () => {
  const row = db.prepare("SELECT name, color FROM categories WHERE key = 'seasonal'").get() as
    { name: string; color: string } | undefined;
  assert.ok(row, 'seasonal was never added');
  assert.equal(row.name, 'Seasonal');
  assert.equal(row.color, CATEGORY_COLORS.seasonal);
});

check('delete is its own state, separate from archived', () => {
  const cols = db.prepare('PRAGMA table_info(knowts)').all() as
    { name: string; notnull: number }[];
  const deleted = cols.find((c) => c.name === 'deleted_at');
  assert.ok(deleted, 'deleted_at was not added');
  assert.equal(deleted.notnull, 0, 'null is what "not deleted" means');
  assert.ok(cols.find((c) => c.name === 'archived'), 'archived must survive alongside it');
});

check('the neutrals are cool, not warm', () => {
  // Red minus blue. The old page, border and muted text were all +2 warm,
  // which is what made white cards look faintly yellow on top of them.
  const warmth = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) - (n & 255);
  };
  for (const [name, hex] of [
    ['page', palette.page],
    ['lightGray', palette.lightGray],
    ['gray', palette.gray],
  ] as const) {
    assert.ok(warmth(hex) <= 0, `${name} (${hex}) is still warm at ${warmth(hex)}`);
  }
});

check('a custom category is never repainted', () => {
  assert.equal(colorOf('c_mine'), MINE);
});

check('a custom category cannot borrow a shipped key to begin with', () => {
  // Which is what actually protects a chosen color: RECOLOR_SQL matches on
  // key, and the unique index means only the shipped row can hold one. The
  // is_custom = 0 clause is the second lock, not the first.
  assert.throws(
    () =>
      db.exec(
        `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
           VALUES ('c_clash','My home','home','${MINE}','dot',1,8);`,
      ),
    /UNIQUE/,
  );
});

check('ink and fill stay legible on a white card', () => {
  const luminance = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const channel = (c: number) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * channel((n >> 16) & 255) +
      0.7152 * channel((n >> 8) & 255) +
      0.0722 * channel(n & 255)
    );
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const key of Object.keys(CATEGORY_INK) as (keyof typeof CATEGORY_INK)[]) {
    assert.ok(
      ratio(CATEGORY_INK[key], '#FFFFFF') >= 4.5,
      `${key} ink fails AA on white at ${ratio(CATEGORY_INK[key], '#FFFFFF').toFixed(2)}`,
    );
    // The fill is a background, so it has to stay light enough to put ink on.
    assert.ok(
      ratio(CATEGORY_FILL[key], '#FFFFFF') < 1.2,
      `${key} fill is too dark to be a fill`,
    );
  }
});

check('the three renamed categories land on their new names', () => {
  // Names are stored, so the seed constant alone leaves every existing install
  // on the old words. Colors are matched separately and must not move here.
  for (const [key, name] of [
    ['ritual', 'Routine'],
    ['go', 'Activity'],
    // Wellness since v10, Care since v16. The end state is what matters.
    ['care', 'Care'],
  ] as const) {
    const row = db.prepare('SELECT name, color FROM categories WHERE id = ?').get(`c_${key}`) as
      { name: string; color: string };
    assert.equal(row.name, name, `${key} kept its old name`);
    assert.equal(row.color, CATEGORY_COLORS[key], `${key} lost its color to the rename`);
  }
});

check('the untouched three keep their names', () => {
  for (const key of ['home', 'daily', 'admin'] as const) {
    const row = db.prepare('SELECT name FROM categories WHERE id = ?').get(`c_${key}`) as
      { name: string };
    assert.equal(row.name, key);
  }
});

check('a category someone renamed themselves is left alone', () => {
  db.exec(
    `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
       VALUES ('c_mine_named','My own thing',NULL,'#123456','dot',1,7);`,
  );
  migrate(db);
  const row = db.prepare('SELECT name FROM categories WHERE id = ?').get('c_mine_named') as
    { name: string };
  assert.equal(row.name, 'My own thing');
});

check('drafts arrive defaulted off, so nothing existing becomes one', () => {
  const rows = db.prepare('PRAGMA table_info(knowts)').all() as
    { name: string; dflt_value: string | null; notnull: number }[];
  const col = rows.find((r) => r.name === 'is_draft');
  assert.ok(col, 'is_draft was not added');
  assert.equal(col.notnull, 1);
  assert.equal(col.dflt_value, '0');
});

check('an existing knowt is not turned into a draft by the upgrade', () => {
  db.exec(
    `INSERT INTO knowts (id, mode, name, icon, created_at)
       VALUES ('kOld','open','Existing','dot',1);`,
  );
  const row = db.prepare('SELECT is_draft FROM knowts WHERE id = ?').get('kOld') as
    { is_draft: number };
  assert.equal(row.is_draft, 0);
});

check('pinning arrives as a flag, defaulted off', () => {
  const cols = db.prepare('PRAGMA table_info(knowts)').all() as
    { name: string; dflt_value: string | null; notnull: number }[];
  const pinned = cols.find((c) => c.name === 'is_pinned');
  assert.ok(pinned, 'is_pinned was not added');
  assert.equal(pinned.notnull, 1);
  assert.equal(pinned.dflt_value, '0', 'nothing existing becomes pinned');
});

check('pinned sorts first, and does not otherwise reorder', () => {
  db.exec(
    `INSERT INTO knowts (id, mode, name, icon, created_at, is_pinned)
       VALUES ('kB','open','Banana','dot',1,0),
              ('kA','open','Apple','dot',2,0),
              ('kZ','open','Zucchini','dot',3,1);`,
  );
  const rows = db
    .prepare(
      `SELECT name FROM knowts
        WHERE archived = 0 AND is_draft = 0 AND deleted_at IS NULL
        ORDER BY is_pinned DESC, name`,
    )
    .all() as { name: string }[];
  const names = rows.map((r) => r.name).filter((n) =>
    ['Apple', 'Banana', 'Zucchini'].includes(n),
  );
  assert.deepEqual(names, ['Zucchini', 'Apple', 'Banana']);
});

check('running it twice changes nothing further', () => {
  migrate(db);
  assert.equal(colorOf('c_home'), CATEGORY_COLORS.home);
  assert.equal(colorOf('c_mine'), MINE);
});

console.log(`\n${passed} checks passed against an older database.`);
