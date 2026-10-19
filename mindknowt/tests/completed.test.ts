/**
 * The reported bug: a knowt checked off in the morning whose 9:00 am alarm
 * rang anyway. Covers both halves of the fix, plus the re-arm that would have
 * reintroduced it immediately.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs completed.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const {
  completedOccurrences,
  isOccurrenceDone,
  occurrenceKey,
  firingOccurrence,
  openOccurrence,
  shouldPresentRinging,
} = await import(`${ROOT}/src/knowts/completions.ts`);
const { nextOccurrence } = await import(`${ROOT}/src/db/scheduling.ts`);
const { desiredFor, signatureOf } = await import(`${ROOT}/src/alarms/scheduleSync.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// Monday, October 12 2026.
const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m);

const schedule = (over: Record<string, unknown> = {}) =>
  ({
    id: 'sched-9am',
    knowt_id: 'k1',
    label: null,
    time: '09:00',
    repeat_type: 'daily',
    days_of_week: null,
    interval_days: null,
    interval_months: null,
    supply_days: null,
    lead_days: null,
    start_date: '2026-10-01',
    enabled: 1,
    alarmkit_id: null,
    ...over,
  }) as never;

const event = (over: Record<string, unknown> = {}) =>
  ({
    id: 'e1',
    knowt_id: 'k1',
    schedule_id: 'sched-9am',
    fired_at: null,
    completed_at: at(7).getTime(),
    method: 'tap',
    note: null,
    snooze_count: 0,
    ...over,
  }) as never;

const oneShot = (over: Record<string, unknown> = {}) =>
  ({
    id: 'p1',
    knowt_id: 'k1',
    schedule_id: null,
    alarmkit_id: 'a1',
    fires_at: at(15).getTime(),
    kind: 'test',
    signature: null,
    created_at: 0,
    // This spread was missing, so every override was silently dropped and the
    // `kind` these cases name was never the kind under test.
    ...over,
  }) as never;

// Which occurrence a completion covers.

check('a completion naming a schedule marks that occurrence done', () => {
  const done = completedOccurrences([event()]);
  assert.ok(isOccurrenceDone(done, 'sched-9am', at(0)));
  assert.ok(!isOccurrenceDone(done, 'sched-9am', new Date(2026, 9, 13)));
  assert.ok(!isOccurrenceDone(done, 'other', at(0)));
});

check('a check-in naming no schedule marks no occurrence', () => {
  // It is a real completion and it is recorded, but it does not say which
  // firing it answers, so it must not be allowed to stand an alarm down.
  const done = completedOccurrences([event({ schedule_id: null })]);
  assert.equal(done.size, 0);
});

check('an alarm that rang and was abandoned marks nothing', () => {
  const done = completedOccurrences([
    event({ fired_at: at(9).getTime(), completed_at: null, method: null }),
  ]);
  assert.equal(done.size, 0);
});

check('the firing decides the day, not the moment the scan landed', () => {
  // Rang at 11:58 pm, scanned at 12:01 am. That belongs to the day it rang;
  // counting it as the next day would suppress the next day's real alarm.
  const done = completedOccurrences([
    event({
      fired_at: new Date(2026, 9, 12, 23, 58).getTime(),
      completed_at: new Date(2026, 9, 13, 0, 1).getTime(),
    }),
  ]);
  assert.ok(isOccurrenceDone(done, 'sched-9am', new Date(2026, 9, 12)));
  assert.ok(!isOccurrenceDone(done, 'sched-9am', new Date(2026, 9, 13)));
});

check('an occurrence key is a schedule and a calendar day', () => {
  assert.equal(occurrenceKey('s', new Date(2026, 9, 12, 23, 59)), 's@2026-10-12');
  assert.equal(occurrenceKey('s', new Date(2026, 9, 12, 0, 0)), 's@2026-10-12');
});

// Whether a firing still needs answering.

check('the reported bug: checked off at seven, the 9:00 am does not demand a scan', () => {
  const present = shouldPresentRinging({
    schedules: [schedule()],
    events: [event()],
    now: at(9),
  });
  assert.equal(present, false);
});

check('the same alarm with nothing checked off does ring', () => {
  assert.equal(
    shouldPresentRinging({ schedules: [schedule()], events: [], now: at(9) }),
    true,
  );
});

check('doing the morning one does not silence the evening one', () => {
  const nine = schedule();
  const five = schedule({ id: 'sched-5pm', time: '17:00' });
  assert.equal(
    shouldPresentRinging({
      schedules: [nine, five],
      events: [event()],
      now: at(17),
    }),
    true,
  );
  // And once both are done, neither does.
  assert.equal(
    shouldPresentRinging({
      schedules: [nine, five],
      events: [event(), event({ id: 'e2', schedule_id: 'sched-5pm' })],
      now: at(17),
    }),
    false,
  );
});

check('a check-in with no schedule covers one occurrence that has come due', () => {
  const nine = schedule();
  const five = schedule({ id: 'sched-5pm', time: '17:00' });
  const loose = event({ schedule_id: null, completed_at: at(12).getTime() });

  // At noon only the nine o'clock has come due, so that is the one it covers.
  assert.equal(
    shouldPresentRinging({ schedules: [nine, five], events: [loose], now: at(12) }),
    false,
  );
  // By five the evening one is due and nothing has covered it.
  assert.equal(
    shouldPresentRinging({ schedules: [nine, five], events: [loose], now: at(17) }),
    true,
  );
});

check('a test ring is answered by nobody, however much was checked off', () => {
  // Asked for by name, after the fact. This morning's completion is not a
  // reply to it, and suppressing it would make the test button do nothing.
  assert.equal(
    shouldPresentRinging({
      schedules: [schedule()],
      events: [event()],
      oneShots: [oneShot()],
      now: at(15),
    }),
    true,
  );
});

check('a one-shot still ahead of now is not a firing', () => {
  // A snooze set for 3 pm, asked about at 2 pm. Nothing fired yet, so it must
  // not force a ringing screen for a knowt already done.
  assert.equal(
    shouldPresentRinging({
      schedules: [schedule()],
      events: [event()],
      oneShots: [oneShot({ kind: 'snooze' })],
      now: at(14),
    }),
    false,
  );
});

check('a snooze still ahead of now is an answer, so nothing rings', () => {
  // The Lock Screen snooze. The module sets the same launch payload for Stop
  // and for Snooze and gives no way to tell them apart, so the pending snooze
  // is the only evidence the app has. Without this the app reopened a ringing
  // screen for something the person had just put off. No completion here: the
  // occurrence is still outstanding, and it still must not ring.
  assert.equal(
    shouldPresentRinging({
      schedules: [schedule()],
      events: [],
      oneShots: [oneShot({ kind: 'snooze', fires_at: at(15).getTime() })],
      now: at(14),
    }),
    false,
  );
});

check('a re-fire still ahead of now is not an answer', () => {
  // The app armed that one itself; nobody said later. Suppressing a ring the
  // person never asked it to suppress is the one thing it must not do.
  assert.equal(
    shouldPresentRinging({
      schedules: [schedule()],
      events: [],
      oneShots: [oneShot({ kind: 'refire', fires_at: at(15).getTime() })],
      now: at(14),
    }),
    true,
  );
});

check('a snooze that has come due rings, snooze or not', () => {
  assert.equal(
    shouldPresentRinging({
      schedules: [schedule()],
      events: [event()],
      oneShots: [oneShot({ kind: 'snooze', fires_at: at(14).getTime() })],
      now: at(14),
    }),
    true,
  );
});

check('a firing with nothing due rings, because the app cannot account for it', () => {
  // Fails open everywhere it is unsure. A missed alarm is the worst outcome.
  assert.equal(
    shouldPresentRinging({ schedules: [], events: [], now: at(9) }),
    true,
  );
  // 8:00 am on a 9:00 am knowt: nothing has come due, so nothing can be done.
  assert.equal(
    shouldPresentRinging({ schedules: [schedule()], events: [], now: at(8) }),
    true,
  );
});

check('yesterday being done does not silence today', () => {
  const yesterday = event({
    completed_at: new Date(2026, 9, 11, 7).getTime(),
  });
  assert.equal(
    shouldPresentRinging({
      schedules: [schedule()],
      events: [yesterday],
      now: at(9),
    }),
    true,
  );
});

// What a check-in should be recorded against.

check('a check-in names the occurrence it answers', () => {
  const open = openOccurrence({
    schedules: [schedule()],
    events: [],
    now: at(10),
  });
  assert.equal(open?.id, 'sched-9am');
});

check('a check-in names nothing before the time has come round', () => {
  // "I just did this" at seven on a nine o'clock knowt is not that occurrence.
  assert.equal(
    openOccurrence({ schedules: [schedule()], events: [], now: at(7) }),
    null,
  );
});

check('a check-in names the next one when the first is already done', () => {
  const nine = schedule();
  const five = schedule({ id: 'sched-5pm', time: '17:00' });
  const open = openOccurrence({
    schedules: [nine, five],
    events: [event()],
    now: at(17),
  });
  assert.equal(open?.id, 'sched-5pm');
});

check('a check-in names nothing once everything due is done', () => {
  assert.equal(
    openOccurrence({ schedules: [schedule()], events: [event()], now: at(10) }),
    null,
  );
});

// Which occurrence an alarm is ringing for.

check('an alarm is ringing for the latest occurrence to have come due', () => {
  // AlarmKit hands back the knowt id and nothing else. Recording the scan
  // against no schedule left Daily showing the knowt as not done after the tag
  // had been scanned.
  const nine = schedule();
  const five = schedule({ id: 'sched-5pm', time: '17:00' });

  // At nine, only the nine o'clock is ringing.
  assert.equal(
    firingOccurrence({ schedules: [nine, five], events: [], now: at(9) })?.id,
    'sched-9am',
  );
  // At five it is the five o'clock, even though the nine was never answered.
  // That is the opposite of what a check-in means, which is why the two
  // questions are asked separately.
  assert.equal(
    firingOccurrence({ schedules: [nine, five], events: [], now: at(17) })?.id,
    'sched-5pm',
  );
  assert.equal(
    openOccurrence({ schedules: [nine, five], events: [], now: at(17) })?.id,
    'sched-9am',
  );
});

check('a snooze is still ringing for the occurrence it was taken on', () => {
  // Nine o'clock snoozed to three. Three o'clock is not an occurrence.
  assert.equal(
    firingOccurrence({ schedules: [schedule()], events: [], now: at(15) })?.id,
    'sched-9am',
  );
});

check('a firing that answers nothing names no schedule', () => {
  // A test ring on a knowt with nothing outstanding. Null is the right answer,
  // not a guess: the completion is recorded as a check-in instead.
  assert.equal(
    firingOccurrence({ schedules: [], events: [], now: at(9) }),
    null,
  );
  assert.equal(
    firingOccurrence({ schedules: [schedule()], events: [event()], now: at(15) }),
    null,
  );
});

// Arming the next one, rather than the one just done.

check('a completed occurrence is not armed again', () => {
  // The half of the bug that would have survived canceling. Completing at
  // seven leaves today's 9:00 am still in the future, so the walk picked the
  // same occurrence straight back up.
  const row = schedule({ repeat_type: 'interval', interval_days: 1 });
  const done = completedOccurrences([event({ schedule_id: row.id })]);

  const naive = nextOccurrence(row, at(7));
  assert.equal(naive?.getDate(), 12, 'without the skip it re-arms today');

  const skipped = nextOccurrence(row, at(7), (day: Date) =>
    isOccurrenceDone(done, row.id, day),
  );
  assert.equal(skipped?.getDate(), 13, 'with it, tomorrow');
  assert.equal(skipped?.getHours(), 9);
});

check('a one-off that has been done arms nothing at all', () => {
  const row = schedule({ repeat_type: 'once', start_date: '2026-10-12' });
  const done = completedOccurrences([event({ schedule_id: row.id })]);
  assert.equal(
    nextOccurrence(row, at(7), (day: Date) => isOccurrenceDone(done, row.id, day)),
    null,
  );
});

check('an interval skips to its own next day, not simply tomorrow', () => {
  const row = schedule({
    repeat_type: 'interval',
    interval_days: 5,
    start_date: '2026-10-12',
  });
  const done = completedOccurrences([event({ schedule_id: row.id })]);
  const next = nextOccurrence(row, at(7), (day: Date) =>
    isOccurrenceDone(done, row.id, day),
  );
  assert.equal(next?.getDate(), 17);
});

// What sync does with that.

check('a one-at-a-time alarm is replaced once its occurrence is done', () => {
  // Anchored to the 12th so the 12th is actually on its rhythm: an interval
  // counts from its start date, not from today.
  const row = schedule({
    repeat_type: 'interval',
    interval_days: 3,
    start_date: '2026-10-12',
  });
  const knowt = { id: 'k1', name: 'Pills', mode: 'scan' } as never;

  const before = desiredFor(row, at(7), new Set());
  const after = desiredFor(
    row,
    at(7),
    completedOccurrences([event({ schedule_id: row.id })]),
  );

  assert.equal(before.mode, 'once');
  assert.equal(before.nextAt.getDate(), 12);
  assert.equal(after.nextAt.getDate(), 15);
  // A changed signature is what makes sync tear the old alarm down and arm
  // the next one, which is the whole mechanism.
  assert.notEqual(
    signatureOf(knowt, row, before),
    signatureOf(knowt, row, after),
  );
});

check('a daily knowt done at seven is not armed to ring at nine', () => {
  // Morning supplements, checked off before the alarm was due, ringing anyway.
  // AlarmKit computes a recurrence itself, so the only way to skip today is to
  // hand it a week with today left out. Monday, October 12, is weekday 2.
  const row = schedule();
  const knowt = { id: 'k1', name: 'Morning supplements', mode: 'scan' } as never;

  const before = desiredFor(row, at(7), new Set());
  const after = desiredFor(
    row,
    at(7),
    completedOccurrences([event({ schedule_id: row.id })]),
  );

  assert.deepEqual(before.weekdays, [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(after.weekdays, [1, 3, 4, 5, 6, 7], 'Monday is out');
  assert.equal(after.mode, 'weekly', 'it is still one recurring alarm');
  assert.equal(after.nextAt.getDate(), 13, 'and it next rings tomorrow');

  // The armed days have to reach the signature, or sync sees no change and
  // leaves the old alarm standing, still set to ring at nine.
  assert.notEqual(
    signatureOf(knowt, row, before),
    signatureOf(knowt, row, after),
  );
});

check('the day goes back in once its time has passed', () => {
  // Nothing is stored to undo the exclusion. Taking Monday out after nine
  // would buy nothing today and cost next Monday, so the same question asked
  // later simply gets a different answer.
  const row = schedule();
  const done = completedOccurrences([event({ schedule_id: row.id })]);

  const early = desiredFor(row, at(7), done);
  const late = desiredFor(row, at(10), done);

  assert.deepEqual(early.weekdays, [1, 3, 4, 5, 6, 7]);
  assert.deepEqual(late.weekdays, [1, 2, 3, 4, 5, 6, 7], 'Monday is back');
  assert.equal(late.nextAt.getDate(), 13);
});

check('an untouched recurring alarm is still never rebuilt', () => {
  // The signature gained a field, so this has to keep holding: a launch must
  // not churn every alarm on the phone. A cancel that succeeds and a schedule
  // that fails loses the alarm outright.
  const row = schedule();
  const knowt = { id: 'k1', name: 'Pills', mode: 'scan' } as never;
  assert.equal(
    signatureOf(knowt, row, desiredFor(row, at(7), new Set())),
    signatureOf(knowt, row, desiredFor(row, at(10), new Set())),
  );
});

check('weekdays and weekends lose only the day that was done', () => {
  const week = schedule({ repeat_type: 'weekdays' });
  const done = completedOccurrences([event({ schedule_id: week.id })]);
  assert.deepEqual(desiredFor(week, at(7), new Set()).weekdays, [2, 3, 4, 5, 6]);
  assert.deepEqual(desiredFor(week, at(7), done).weekdays, [3, 4, 5, 6]);

  // A weekend schedule is not due on a Monday at all, so nothing comes out.
  const ends = schedule({ repeat_type: 'weekends' });
  assert.deepEqual(desiredFor(ends, at(7), done).weekdays, [1, 7]);
});

check('a once-a-week knowt falls back to arming the next one on its own', () => {
  // Taking Monday out of a Mondays-only recurrence leaves nothing to recur on,
  // which is not an alarm. The recurrence comes back with the next sync.
  const row = schedule({ repeat_type: 'days_of_week', days_of_week: '[2]' });
  const done = completedOccurrences([event({ schedule_id: row.id })]);

  assert.equal(desiredFor(row, at(7), new Set()).mode, 'weekly');
  const after = desiredFor(row, at(7), done);
  assert.equal(after.mode, 'once');
  assert.equal(after.nextAt.getDate(), 19, 'next Monday');
});

check('a disabled schedule arms nothing, completed or not', () => {
  assert.equal(desiredFor(schedule({ enabled: 0 }), at(7), new Set()), null);
});

console.log(`\n${passed} checks passed`);
