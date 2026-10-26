/**
 * The queries the completion fix reads alarms and history through, against a
 * real database built from the shipped schema.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs alarmrecords.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { getDatabase } = await import(`${ROOT}/src/db/database.ts`);
const {
  listOneShotsForKnowt,
  listPendingForKnowt,
  prunePastAlarms,
  recordPendingAlarm,
  touchPendingAlarm,
} = await import(`${ROOT}/src/db/pendingAlarms.ts`);
const { completionWindowStart, listCompletionsSince } = await import(
  `${ROOT}/src/db/events.ts`
);
const { completedOccurrences, isOccurrenceDone } = await import(
  `${ROOT}/src/knowts/completions.ts`
);

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const db = await getDatabase();
const NOW = Date.now();
const MIN = 60_000;

await db.runAsync(
  `INSERT INTO knowts (id, mode, name, created_at)
   VALUES ('k1', 'strict', 'Pills', ?)`,
  Date.now(),
);
for (const id of ['s1', 's2']) {
  await db.runAsync(
    `INSERT INTO schedules (id, knowt_id, time, repeat_type, enabled)
     VALUES (?, 'k1', '09:00', 'daily', 1)`,
    id,
  );
}

await check('a one-shot that fired moments ago is still on record', async () => {
  // Housekeeping used to delete it the instant its time passed, which threw
  // away the only evidence of why the app was being opened.
  const justNow = await recordPendingAlarm({
    knowtId: 'k1',
    alarmkitId: 'a-now',
    firesAt: NOW - MIN,
    kind: 'test',
  });
  const longAgo = await recordPendingAlarm({
    knowtId: 'k1',
    alarmkitId: 'a-old',
    firesAt: NOW - 30 * MIN,
    kind: 'refire',
  });

  const dropped = await prunePastAlarms(NOW);
  assert.equal(dropped, 1, 'only the stale one goes');

  const left = await listOneShotsForKnowt('k1');
  assert.deepEqual(
    left.map((r: { id: string }) => r.id),
    [justNow],
  );
  assert.ok(longAgo);
});

await check('one-shots are listed whether or not their time has passed', async () => {
  // `listPendingForKnowt` answers what is still ahead, which cannot say what
  // just fired. That difference is the whole reason the second query exists.
  await recordPendingAlarm({
    knowtId: 'k1',
    alarmkitId: 'a-soon',
    firesAt: NOW + 10 * MIN,
    kind: 'snooze',
  });

  const ahead = await listPendingForKnowt('k1', NOW);
  const all = await listOneShotsForKnowt('k1');
  assert.deepEqual(
    ahead.map((r: { alarmkit_id: string }) => r.alarmkit_id),
    ['a-soon'],
  );
  assert.deepEqual(
    all.map((r: { alarmkit_id: string }) => r.alarmkit_id),
    ['a-now', 'a-soon'],
  );
});

await check('a recurring alarm is never pruned, and never listed as a one-shot', async () => {
  const scheduled = await recordPendingAlarm({
    knowtId: 'k1',
    scheduleId: 's1',
    alarmkitId: 'a-weekly',
    firesAt: NOW - 5 * 24 * 60 * MIN,
    kind: 'scheduled',
    signature: 'sig',
  });

  await prunePastAlarms(NOW);
  const row = await db.getFirstAsync(
    'SELECT * FROM pending_alarms WHERE id = ?',
    scheduled,
  );
  assert.ok(row, 'a live recurring alarm kept its only record');

  const oneShots = await listOneShotsForKnowt('k1');
  assert.ok(
    !oneShots.some((r: { kind: string }) => r.kind === 'scheduled'),
    'a recurring alarm is not a one-shot',
  );
});

await check('a stale recurring record can be moved forward in place', async () => {
  const before = await db.getFirstAsync<{ id: string; alarmkit_id: string }>(
    "SELECT * FROM pending_alarms WHERE kind = 'scheduled'",
  );
  assert.ok(before);

  await touchPendingAlarm(before.id, NOW + 60 * MIN);

  const after = await db.getFirstAsync<{
    fires_at: number;
    alarmkit_id: string;
  }>('SELECT * FROM pending_alarms WHERE id = ?', before.id);
  assert.equal(after?.fires_at, NOW + 60 * MIN);
  // The alarm itself is untouched. Only the app's note about it changed.
  assert.equal(after?.alarmkit_id, before.alarmkit_id);

  const ahead = await listPendingForKnowt('k1', NOW);
  assert.ok(
    ahead.some((r: { alarmkit_id: string }) => r.alarmkit_id === 'a-weekly'),
    'it is visible again to the queries that ask what is coming',
  );
});

await check('the completion window reaches back past midnight', async () => {
  const start = completionWindowStart(new Date(2026, 9, 12, 0, 30));
  assert.equal(new Date(start).getDate(), 11);
  assert.equal(new Date(start).getHours(), 0);
});

await check('completions are read back as the occurrences they cover', async () => {
  const day = new Date(2026, 9, 12, 9, 0);
  await db.runAsync(
    `INSERT INTO events
       (id, knowt_id, schedule_id, fired_at, completed_at, method, note, snooze_count)
     VALUES ('ev-done', 'k1', 's1', NULL, ?, 'tap', NULL, 0)`,
    new Date(2026, 9, 12, 7, 0).getTime(),
  );
  // An alarm that rang and was walked away from completes nothing.
  await db.runAsync(
    `INSERT INTO events
       (id, knowt_id, schedule_id, fired_at, completed_at, method, note, snooze_count)
     VALUES ('ev-open', 'k1', 's2', ?, NULL, NULL, NULL, 0)`,
    day.getTime(),
  );

  const rows = await listCompletionsSince(completionWindowStart(day));
  assert.deepEqual(
    rows.map((r: { id: string }) => r.id),
    ['ev-done'],
  );

  const done = completedOccurrences(rows);
  assert.ok(isOccurrenceDone(done, 's1', day));
  assert.ok(!isOccurrenceDone(done, 's2', day));
});

console.log(`\n${passed} checks passed`);
