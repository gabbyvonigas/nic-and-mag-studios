/**
 * Daily is the day's timetable, against a real database.
 *
 * Three things must not reach it: a Scan Knowt, a Knowt with no schedule, and
 * a one-off whose day has gone. The count and the week dots have to agree with
 * the cards, which is the part that was reported as "4 of 9".
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs scanonlyboard.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { getDatabase } = await import(`${ROOT}/src/db/database.ts`);
const { TABLES_SQL, INDEXES_SQL, SCHEMA_VERSION } = await import(
  `${ROOT}/src/db/schema.ts`
);
const {
  addSchedule,
  completedTodayIds,
  createKnowt,
  logCompletion,
  listKnowts,
  setPinned,
  setScanOnly,
} = await import(`${ROOT}/src/db/knowts.ts`);
const { listDashboard, listWeekMarks } = await import(
  `${ROOT}/src/db/dashboard.ts`
);
const { isScanOnly } = await import(`${ROOT}/src/knowts/scanOnly.ts`);
const { stopChoiceOf } = await import(`${ROOT}/src/knowts/modes.ts`);

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// Thursday, October 8 2026.
const TODAY = new Date(2026, 9, 8, 18, 0);

const db = await getDatabase();
await db.execAsync(TABLES_SQL);
await db.execAsync(INDEXES_SQL);
await db.runAsync('PRAGMA user_version = 0');

// The real migration, so the column arrives the way it will on a device.
const { migrate } = await import(`${ROOT}/src/db/migrate.ts`).catch(() => ({
  migrate: null,
}));
if (migrate) await migrate();
else {
  // No separate migrate module: apply the added columns the same way.
  const { ADDED_COLUMNS } = await import(`${ROOT}/src/db/schema.ts`);
  for (const column of ADDED_COLUMNS) {
    const info = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${column.table})`,
    );
    if (!info.some((row) => row.name === column.column)) {
      await db.execAsync(
        `ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.type}`,
      );
    }
  }
  await db.runAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

const timedId = await createKnowt({
  name: 'Vitamins',
  mode: 'open',
  schedule: { time: '09:00', repeatType: 'daily', startDate: '2026-10-01' },
});

const standingId = await createKnowt({
  name: 'Water filter',
  mode: 'open',
  scanOnly: true,
});

/** No schedule and no choice. What a preset leaves behind. */
const presetId = await createKnowt({
  name: 'Afternoon supplements',
  mode: 'open',
});

/** A one-off that fired yesterday. The "5:08 pm, Once" case. */
const firedId = await createKnowt({
  name: 'Supplements Tag Test',
  mode: 'open',
  schedule: { time: '17:08', repeatType: 'once', startDate: '2026-10-07' },
});

await check('the column arrived and defaults to not a Scan Knowt', async () => {
  const info = await db.getAllAsync<{ name: string; dflt_value: string }>(
    'PRAGMA table_info(knowts)',
  );
  const column = info.find((row) => row.name === 'scan_only');
  assert.ok(column, 'scan_only is missing');
  assert.equal(Number(column.dflt_value), 0, 'the default is not 0');
  assert.equal(SCHEMA_VERSION, 18);
});

await check('only the one that asked for it is a Scan Knowt', async () => {
  const knowts = await listKnowts();
  const byId = new Map(knowts.map((k) => [k.id, k]));
  assert.equal(isScanOnly(byId.get(standingId)!), true);
  assert.equal(isScanOnly(byId.get(presetId)!), false, 'the preset one was caught');
  assert.equal(isScanOnly(byId.get(timedId)!), false);
  assert.equal(isScanOnly(byId.get(firedId)!), false, 'a fired one-off was caught');
});

await check('a preset Knowt with no schedule reads as Alarm Only', async () => {
  // Not Scan Knowt. It is an ordinary Knowt waiting for a time.
  const knowts = await listKnowts();
  const preset = knowts.find((k) => k.id === presetId)!;
  assert.equal(preset.schedules.length, 0);
  assert.equal(stopChoiceOf(preset), 'alarm');
});

await check('Daily shows only what is due today', async () => {
  const board = await listDashboard(TODAY);
  assert.deepEqual(
    board.today.map((card) => card.knowt.id),
    [timedId],
    'something unscheduled reached the board',
  );
});

await check('the count is only what is on the board', async () => {
  // Reported as "4 of 9". The total has to be the cards, nothing else.
  const board = await listDashboard(TODAY);
  assert.equal(board.total, 1);
  assert.equal(board.done, 0);
  assert.equal(board.today.length, board.total);
});

await check('the week dots agree with the board, every day', async () => {
  const marks = await listWeekMarks(TODAY);
  assert.equal(marks.length, 7);
  for (const mark of marks) {
    // The daily Knowt on every day, and on October 7 the one-off as well.
    const expected = mark.iso === '2026-10-07' ? 2 : 1;
    assert.equal(mark.count, expected, `${mark.iso} counted ${mark.count}`);
  }
});

await check('the fired one-off is on the day it fired, not today', async () => {
  // Why it read "5:08 pm, Once" on Daily and "No schedule" on Knowts: Daily
  // asks whether a schedule is due on the day being looked at, the Knowts tab
  // asks when it next fires, and a one-off that has been has no next. Both
  // answers were right; only the Knowts wording was wrong.
  const yesterday = await listDashboard(new Date(2026, 9, 7, 18, 0));
  assert.ok(
    yesterday.today.some((card) => card.knowt.id === firedId),
    'it was not on its own day',
  );
  const today = await listDashboard(TODAY);
  assert.ok(!today.today.some((card) => card.knowt.id === firedId));
});

await check('nothing was ever armed for the Scan Knowt', async () => {
  const rows = await db.getAllAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM pending_alarms WHERE knowt_id = ?',
    standingId,
  );
  assert.equal(rows[0]?.n, 0);
});

// Scanning it, and the daily reset.

await check('a scan marks it done today and does not touch Daily', async () => {
  // `completedAt` is passed, not left to the clock: the fixture's "today" is
  // October 8 2026 and a real wall clock would land the row on whatever day
  // the suite is run, which is how a daily-reset test quietly stops testing
  // the reset.
  await logCompletion({
    knowtId: standingId,
    method: 'scan',
    completedAt: new Date(2026, 9, 8, 14, 30).getTime(),
  });

  const done = await completedTodayIds(TODAY);
  assert.ok(done.has(standingId), 'the scan did not register for today');

  const board = await listDashboard(TODAY);
  assert.equal(board.total, 1, 'the scan put something on Daily');
  assert.equal(board.done, 0);
});

await check('it carries no schedule and no fired_at', async () => {
  const rows = await db.getAllAsync<{
    schedule_id: string | null;
    fired_at: number | null;
    method: string;
  }>('SELECT schedule_id, fired_at, method FROM events WHERE knowt_id = ?', standingId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.schedule_id, null);
  // Nothing rang, so nothing claims it did. This is what keeps it out of Avg
  // complete time and out of the resume gate.
  assert.equal(rows[0]?.fired_at, null);
  assert.equal(rows[0]?.method, 'scan');
});

await check('tomorrow it is not done, which is the whole reset', async () => {
  // Nothing runs at midnight and nothing is stored to clear: done is read from
  // the day's own window.
  const tomorrow = await completedTodayIds(new Date(2026, 9, 9, 9, 0));
  assert.equal(tomorrow.has(standingId), false);
});

await check('turning the flag off makes it an ordinary Knowt again', async () => {
  await setScanOnly(standingId, false);
  let knowts = await listKnowts();
  assert.equal(isScanOnly(knowts.find((k) => k.id === standingId)!), false);

  await addSchedule(standingId, {
    time: '07:30',
    repeatType: 'daily',
    startDate: '2026-10-08',
  });
  const board = await listDashboard(TODAY);
  assert.ok(board.today.some((card) => card.knowt.id === standingId));
  // And 7:30 leads the day, because it is before 9:00.
  assert.equal(board.today[0]?.knowt.id, standingId);

  // Put it back for anything after this.
  await setScanOnly(standingId, true);
  knowts = await listKnowts();
  assert.equal(isScanOnly(knowts.find((k) => k.id === standingId)!), true);
});

await check('pinning is a flag that already existed', async () => {
  // Schema 13. No column and no migration were needed for the Pinned section.
  await setPinned(presetId, true);
  const knowts = await listKnowts();
  const pinned = knowts.filter((k) => k.is_pinned === 1);
  assert.deepEqual(pinned.map((k) => k.id), [presetId]);

  await setPinned(presetId, false);
  const after = await listKnowts();
  assert.equal(after.filter((k) => k.is_pinned === 1).length, 0);
});

console.log(`\n${passed} checks passed`);
