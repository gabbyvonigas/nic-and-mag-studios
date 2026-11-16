/**
 * Marking a Knowt done has to stand its alarm down.
 *
 * Reported as: mark a Knowt done in the app and its alarm rings anyway. The
 * reconciler already read completion state and the completion path already
 * resynced, so neither of the obvious explanations was it. What was missing is
 * that a completion made *before* the occurrence's time could not name the
 * occurrence: `openOccurrence` only answers for a schedule that has come due,
 * so Detail's "Mark done" recorded `schedule_id: null`, and a completion that
 * names no occurrence is deliberately not allowed to cancel an alarm.
 *
 * This runs the real decision path end to end: pick the occurrence a check-in
 * covers, build the event row that would be written for it, read the done set
 * back out, and ask the reconciler what it would arm. It fails on the old code.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs donealarm.test.ts
 */
import assert from 'node:assert/strict';

const SRC = new URL('../src/', import.meta.url).pathname;
const { checkInOccurrence, completedOccurrences, openOccurrence } = await import(
  `${SRC}knowts/completions.ts`
);
const { desiredFor, signatureOf } = await import(`${SRC}alarms/scheduleSync.ts`);
const { ONE_SHOT_KINDS } = await import(`${SRC}alarms/knowtAlarms.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Thursday, October 15 2026, three in the afternoon. */
const NOW = new Date(2026, 9, 15, 15, 0);
const THURSDAY = 5; // Sunday = 1.

type Row = Record<string, unknown>;

const schedule = (over: Row = {}): never =>
  ({
    id: 's1', knowt_id: 'k1', label: null, time: '21:00',
    repeat_type: 'daily', days_of_week: null, interval_days: null,
    interval_months: null, supply_days: null, lead_days: null,
    start_date: null, enabled: 1, alarmkit_id: 'a1', ...over,
  }) as never;

/** The event row `logCompletion` writes for a check-in at `at`. */
const completion = (scheduleId: string | null, at: Date = NOW): never =>
  ({
    id: `e-${scheduleId ?? 'none'}-${at.getTime()}`, knowt_id: 'k1',
    schedule_id: scheduleId, fired_at: null, completed_at: at.getTime(),
    method: 'tap', note: null, snooze_count: 0,
  }) as never;

/**
 * What the app would do on "Mark done": name an occurrence, write the row, then
 * ask the reconciler what it arms for each schedule.
 */
function markDone(
  schedules: readonly never[],
  events: readonly never[] = [],
  now: Date = NOW,
) {
  const covers = checkInOccurrence({ schedules, events, now });
  const after = [...events, completion(covers ? (covers as Row).id as string : null, now)];
  const done = completedOccurrences(after);
  return {
    named: covers ? ((covers as Row).id as string) : null,
    events: after,
    armed: new Map(
      schedules.map((s) => [(s as Row).id as string, desiredFor(s, now, done)]),
    ),
  };
}

// --- The three failures the fix is for. -----------------------------------

check('a done occurrence is not armed after sync', () => {
  // A one-off at nine tonight, marked done at three. This is the whole report.
  const once = schedule({ repeat_type: 'once', start_date: '2026-10-15' });
  const result = markDone([once]);
  assert.equal(result.named, 's1', 'the completion did not name the occurrence');
  assert.equal(
    result.armed.get('s1'),
    null,
    'the reconciler would still arm tonight’s alarm for a Knowt marked done',
  );
});

check('a recurring schedule keeps its future occurrences', () => {
  // Daily at nine, today marked done at three. Tomorrow must still ring.
  const result = markDone([schedule()]);
  const desired = result.armed.get('s1') as Row | null;
  assert.ok(desired, 'the daily alarm was dropped entirely');
  assert.equal(desired.mode, 'weekly');
  const weekdays = desired.weekdays as number[];
  assert.equal(weekdays.length, 6, `armed ${weekdays.join(',')}`);
  assert.ok(!weekdays.includes(THURSDAY), 'today was not skipped');
  // Every other day of the week survives, which is the half that regressing
  // would break silently: the alarm stops instead of skipping once.
  for (const day of [1, 2, 3, 4, 6, 7]) {
    assert.ok(weekdays.includes(day), `lost weekday ${day}`);
  }
  // And the next firing it records is tomorrow, not tonight.
  const nextAt = desired.nextAt as Date;
  assert.equal(nextAt.getDate(), 16);
  assert.equal(nextAt.getHours(), 21);
});

check('undo re-arms an occurrence whose time is still ahead', () => {
  const daily = schedule();
  const done = markDone([daily]);
  assert.equal((done.armed.get('s1') as Row).weekdays.length, 6);

  // `undoCompletion` deletes the row, so the done set is read from what is
  // left. Nothing else is stored, which is why this works at all.
  const undone = completedOccurrences([]);
  const desired = desiredFor(daily, NOW, undone) as Row;
  assert.equal((desired.weekdays as number[]).length, 7, 'the day did not come back');
  assert.ok((desired.weekdays as number[]).includes(THURSDAY));
  const nextAt = desired.nextAt as Date;
  assert.equal(nextAt.getDate(), 15, 'undo left tonight unarmed');

  // The signature has to differ, or sync leaves the reduced alarm standing and
  // the restored day never reaches AlarmKit.
  const knowt = { id: 'k1', name: 'Vitamins', mode: 'open', tag_uid: null, snooze_minutes: 9 };
  const skipped = signatureOf(knowt as never, daily, done.armed.get('s1') as never);
  const restored = signatureOf(knowt as never, daily, desired as never);
  assert.notEqual(skipped, restored, 'a skipped day is invisible to the signature');
});

// --- The rest of the rule. ------------------------------------------------

check('only the chosen occurrence is skipped, not the rest of today', () => {
  // Nine in the morning and nine at night. At three the morning one has passed
  // and nothing has been recorded, so that is what a check-in covers.
  const morning = schedule({ id: 's-am', time: '09:00' });
  const evening = schedule({ id: 's-pm', time: '21:00' });
  const first = markDone([morning, evening]);
  assert.equal(first.named, 's-am', 'an overdue occurrence lost to one ahead');
  assert.ok(first.armed.get('s-pm'), 'tonight was canceled by doing this morning');

  // A second check-in then covers tonight, and only then is it stood down.
  const second = markDone([morning, evening], first.events);
  assert.equal(second.named, 's-pm');
  const pm = second.armed.get('s-pm') as Row;
  assert.ok(!(pm.weekdays as number[]).includes(THURSDAY), 'tonight is still armed');
});

check('marking done after it rang changes nothing and re-arms nothing', () => {
  // Rang at nine, dismissed, marked done at ten past. The recurrence keeps all
  // seven days, because its next firing is tomorrow either way, and tonight is
  // not put back.
  const rang = new Date(2026, 9, 15, 9, 10);
  const daily = schedule({ time: '09:00' });
  const fired = {
    ...(completion('s1', rang) as Row), fired_at: new Date(2026, 9, 15, 9, 0).getTime(),
  } as never;
  const done = completedOccurrences([fired]);
  const desired = desiredFor(daily, rang, done) as Row;
  assert.equal((desired.weekdays as number[]).length, 7);
  const nextAt = desired.nextAt as Date;
  assert.equal(nextAt.getDate(), 16, 'this morning was armed again');
});

check('done state is read from the events table, so a restart keeps it', () => {
  // Nothing is cached and nothing is flagged: the same rows give the same
  // answer, which is what makes a relaunch and a reconcile safe.
  const daily = schedule();
  const events = [completion('s1')];
  const first = desiredFor(daily, NOW, completedOccurrences(events)) as Row;
  const again = desiredFor(daily, NOW, completedOccurrences([...events])) as Row;
  assert.deepEqual(first.weekdays, again.weekdays);
  assert.equal((first.nextAt as Date).getTime(), (again.nextAt as Date).getTime());
});

check('a snooze is canceled by the completion, along with the other one-shots', () => {
  // `completeOccurrence` clears these kinds and nothing else, so a recurring
  // alarm survives doing today while a snooze pending for it does not.
  assert.deepEqual([...ONE_SHOT_KINDS].sort(), ['refire', 'snooze', 'test']);
  assert.ok(!ONE_SHOT_KINDS.includes('scheduled'));
});

check('a Scan Knowt has nothing to name and nothing to arm', () => {
  // No schedules, so there is no occurrence and the loop that arms never runs.
  assert.equal(checkInOccurrence({ schedules: [], events: [], now: NOW }), null);
});

check('a Scan + Alarm Knowt follows the same rule as any other', () => {
  // The mode decides what stops the alarm, not whether a completion stands it
  // down. `desiredFor` never reads the mode.
  const strict = schedule();
  const result = markDone([strict]);
  assert.equal(result.named, 's1');
  assert.ok(!((result.armed.get('s1') as Row).weekdays as number[]).includes(THURSDAY));
});

// --- Why the old code failed, kept as the regression it is. ---------------

check('openOccurrence still answers only for an occurrence that has come due', () => {
  // Unchanged on purpose: it is the right question for whether the day is
  // behind, and the wrong one for standing an alarm down. The bug was asking
  // it in the second place.
  const evening = schedule({ time: '21:00' });
  assert.equal(openOccurrence({ schedules: [evening], events: [], now: NOW }), null);
  assert.ok(checkInOccurrence({ schedules: [evening], events: [], now: NOW }));
});

check('a completion naming nothing still cancels nothing', () => {
  // The rule that made the bug possible is correct and stays: "I did the thing"
  // with no occurrence attached is worth recording and must not silence a
  // specific alarm.
  const done = completedOccurrences([completion(null)]);
  assert.equal(done.size, 0);
  assert.ok(desiredFor(schedule(), NOW, done));
});

console.log(`\n${passed} checks passed`);
