/**
 * Adding presets: the run through the schedule screen, and the resume gate.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs presetflow.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { startQueue, advanceQueue, showStepCounter, stepLabel } = await import(
  `${ROOT}/src/knowts/scheduleQueue.ts`
);
const { pickUnansweredFiring, RESUME_WINDOW_MINUTES } = await import(
  `${ROOT}/src/ringing/resumeGate.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// Adding one.

check('adding one preset goes straight to its time', () => {
  const start = startQueue(['k1']);
  assert.equal(start?.knowtId, 'k1');
  assert.deepEqual(start?.queue, []);
  assert.deepEqual(start?.step, { index: 1, total: 1 });
  // A run of one shows no counter: "1 of 1" is noise.
  assert.equal(showStepCounter(start?.step), false);
});

check('saving the only one ends the run', () => {
  const start = startQueue(['k1']);
  assert.equal(advanceQueue(start as never), null);
});

check('adding nothing starts no run at all', () => {
  assert.equal(startQueue([]), null);
});

// Adding several.

check('three presets are taken one at a time, counted', () => {
  const first = startQueue(['a', 'b', 'c']);
  assert.equal(first?.knowtId, 'a');
  assert.equal(stepLabel(first!.step), '1 of 3');
  assert.ok(showStepCounter(first?.step));

  const second = advanceQueue(first as never);
  assert.equal(second?.knowtId, 'b');
  assert.equal(stepLabel(second!.step), '2 of 3');

  const third = advanceQueue(second as never);
  assert.equal(third?.knowtId, 'c');
  assert.equal(stepLabel(third!.step), '3 of 3');

  assert.equal(advanceQueue(third as never), null, 'the run should be over');
});

check('skipping moves on exactly like saving does', () => {
  // Skip and save both call the same advance. The Knowt is already created, so
  // skipping leaves it with no schedule rather than losing it.
  const first = startQueue(['a', 'b']);
  const afterSkip = advanceQueue(first as never);
  const afterSave = advanceQueue(first as never);
  assert.deepEqual(afterSkip, afterSave);
  assert.equal(afterSkip?.knowtId, 'b');
});

check('the total does not drift as the run goes on', () => {
  let step = startQueue(['a', 'b', 'c', 'd']);
  const totals: number[] = [];
  while (step) {
    totals.push(step.step.total);
    step = advanceQueue(step);
  }
  assert.deepEqual(totals, [4, 4, 4, 4]);
});

check('a run with no step still advances, for a queue passed by hand', () => {
  const next = advanceQueue({ queue: ['x', 'y'] });
  assert.equal(next?.knowtId, 'x');
  // One current plus the two queued, so three in all.
  assert.deepEqual(next?.step, { index: 2, total: 3 });
});

// Opening the app during a ring.

const schedule = (over: Record<string, unknown> = {}) =>
  ({
    id: 's1', knowt_id: 'k1', label: null, time: '09:00', repeat_type: 'daily',
    days_of_week: null, interval_days: null, interval_months: null,
    supply_days: null, lead_days: null, start_date: '2026-10-01',
    enabled: 1, alarmkit_id: null, ...over,
  }) as never;

const KNOWTS = [{ id: 'k1', schedules: [schedule()] }] as never[];
const at = (h: number, m = 0) => new Date(2026, 9, 8, h, m);

const pick = (over: Record<string, unknown> = {}) =>
  pickUnansweredFiring({
    knowts: KNOWTS, events: [], pending: [], now: at(9, 5), ...over,
  } as never);

check('an alarm that just rang and was ignored is opened', () => {
  const target = pick();
  assert.equal(target?.knowtId, 'k1');
  assert.equal(target?.scheduleId, 's1');
});

check('the window closes after fifteen minutes', () => {
  assert.equal(RESUME_WINDOW_MINUTES, 15);
  assert.ok(pick({ now: at(9, 14) }), 'inside the window');
  assert.ok(pick({ now: at(9, 15) }), 'exactly on the edge still counts');
  assert.equal(pick({ now: at(9, 16) }), null, 'past it');
  assert.equal(pick({ now: at(11, 0) }), null, 'this morning is not now');
});

check('an alarm that has not rung yet is never opened', () => {
  assert.equal(pick({ now: at(8, 59) }), null);
});

check('a completed occurrence is not opened', () => {
  const events = [
    { id: 'e1', knowt_id: 'k1', schedule_id: 's1', fired_at: null,
      completed_at: at(9, 2).getTime(), method: 'tap', note: null, snooze_count: 0 },
  ];
  assert.equal(pick({ events }), null);
});

check('an alarm already dealt with is not opened again', () => {
  // Pressing Stop opens a ringing session, which leaves an event with a
  // fired_at. Coming back later must not drag you into it a second time.
  const events = [
    { id: 'e1', knowt_id: 'k1', schedule_id: 's1', fired_at: at(9, 0).getTime(),
      completed_at: null, method: null, note: null, snooze_count: 0 },
  ];
  assert.equal(pick({ events }), null);
});

check('a snoozed Knowt is not opened, because a snooze is an answer', () => {
  const pending = [
    { id: 'p1', knowt_id: 'k1', schedule_id: null, alarmkit_id: 'a1',
      fires_at: at(9, 30).getTime(), kind: 'snooze', signature: null, created_at: 0 },
  ];
  assert.equal(pick({ pending }), null);
});

check('a snooze that has already run out does not block it', () => {
  const pending = [
    { id: 'p1', knowt_id: 'k1', schedule_id: null, alarmkit_id: 'a1',
      fires_at: at(9, 1).getTime(), kind: 'snooze', signature: null, created_at: 0 },
  ];
  assert.ok(pick({ pending, now: at(9, 5) }));
});

check('it offers each occurrence once and then leaves you alone', () => {
  const first = pick();
  assert.ok(first);
  assert.equal(pick({ offered: new Set([first!.key]) }), null);
});

check('a disabled schedule is never opened', () => {
  assert.equal(
    pick({ knowts: [{ id: 'k1', schedules: [schedule({ enabled: 0 })] }] }),
    null,
  );
});

check('the latest firing wins when two are inside the window', () => {
  const two = [
    { id: 'k1', schedules: [schedule(), schedule({ id: 's2', time: '09:03' })] },
  ];
  const target = pick({ knowts: two, now: at(9, 5) });
  assert.equal(target?.scheduleId, 's2');
});

console.log(`\n${passed} checks passed`);
