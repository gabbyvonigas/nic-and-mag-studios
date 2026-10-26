/**
 * Completing one occurrence from an Upcoming row.
 *
 * Upcoming lists tomorrow onward, so the occurrence being skipped is days out.
 * Two things have to be true of it and neither was before:
 *
 *   - The completion has to cover that day. Which day a completion covers is
 *     read from `fired_at ?? completed_at`, so a skip recorded at this
 *     afternoon's clock would cover this afternoon and leave the skipped
 *     firing armed. It is stamped at the occurrence's own moment instead.
 *   - The recurrence has to be handed a week with that day left out.
 *     `skipsToday` only ever asked about today, which was right while the only
 *     way to mark something done early was today's card. A week with Friday
 *     still in it rings on Friday.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs skipoccurrence.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const home = read('src/screens/HomeScreen.tsx');
const dashboard = read('src/db/dashboard.ts');
const scan = read('src/knowts/scanKnowt.ts');

const { completedOccurrences } = await import(`${ROOT}/src/knowts/completions.ts`);
const { desiredFor, signatureOf } = await import(`${ROOT}/src/alarms/scheduleSync.ts`);
const { nextOccurrence, weekdayOf } = await import(`${ROOT}/src/db/scheduling.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Thursday, October 15 2026, three in the afternoon. */
const NOW = new Date(2026, 9, 15, 15, 0);
/** Tomorrow's firing, which is the one an Upcoming row offers to skip. */
const FRIDAY = new Date(2026, 9, 16, 21, 0);
/** Where Upcoming starts looking: midnight tomorrow. */
const TOMORROW = new Date(2026, 9, 16);

type Row = Record<string, unknown>;

const schedule = (over: Row = {}): never =>
  ({
    id: 's1', knowt_id: 'k1', label: null, time: '21:00',
    repeat_type: 'daily', days_of_week: null, interval_days: null,
    interval_months: null, supply_days: null, lead_days: null,
    start_date: null, enabled: 1, alarmkit_id: 'a1', ...over,
  }) as never;

/** The row `logCompletion` writes for a skip of the occurrence at `at`. */
const skip = (at: Date, scheduleId: string | null = 's1'): never =>
  ({
    id: `e-${at.getTime()}`, knowt_id: 'k1', schedule_id: scheduleId,
    fired_at: null, completed_at: at.getTime(), method: 'tap',
    note: null, snooze_count: 0,
  }) as never;

const dayOfWeek = (at: Date) => weekdayOf(at);

// --- The three failures the fix is for. -----------------------------------

check('a skipped future occurrence is not armed after sync', () => {
  // Daily at nine. Tomorrow's is skipped from Upcoming this afternoon.
  const daily = schedule();
  const done = completedOccurrences([skip(FRIDAY)]);
  const desired = desiredFor(daily, NOW, done) as Row | null;
  assert.ok(desired, 'the alarm was dropped entirely');
  assert.equal(desired.mode, 'weekly');
  const weekdays = desired.weekdays as number[];
  assert.ok(
    !weekdays.includes(dayOfWeek(FRIDAY)),
    `Friday is still armed: ${weekdays.join(',')}`,
  );

  // And a one-off has nothing left to arm at all.
  const once = schedule({ repeat_type: 'once', start_date: '2026-10-16' });
  const onceDone = completedOccurrences([skip(FRIDAY)]);
  assert.equal(desiredFor(once, NOW, onceDone), null);
});

check('the recurring schedule keeps its other days', () => {
  const daily = schedule();
  const done = completedOccurrences([skip(FRIDAY)]);
  const weekdays = (desiredFor(daily, NOW, done) as Row).weekdays as number[];
  assert.equal(weekdays.length, 6, `armed ${weekdays.join(',')}`);
  for (let day = 1; day <= 7; day += 1) {
    if (day === dayOfWeek(FRIDAY)) continue;
    assert.ok(weekdays.includes(day), `lost weekday ${day}`);
  }
  // Tonight is one of them. Skipping tomorrow must not touch today.
  assert.ok(weekdays.includes(dayOfWeek(NOW)));
  const nextAt = (desiredFor(daily, NOW, done) as Row).nextAt as Date;
  assert.equal(nextAt.getDate(), 15, 'tonight was skipped too');
});

check('Undo re-arms the occurrence while its time is still ahead', () => {
  const daily = schedule();
  const skipped = desiredFor(daily, NOW, completedOccurrences([skip(FRIDAY)])) as Row;
  // Nothing is stored to say a day was skipped, so deleting the row is the
  // whole of the undo and the same question gets the other answer.
  const restored = desiredFor(daily, NOW, completedOccurrences([])) as Row;
  assert.equal((restored.weekdays as number[]).length, 7, 'Friday did not come back');
  assert.ok((restored.weekdays as number[]).includes(dayOfWeek(FRIDAY)));

  // The signature has to differ, or sync leaves the six day alarm standing and
  // the restored day never reaches AlarmKit.
  const knowt = { id: 'k1', name: 'Vitamins', mode: 'open', tag_uid: null, snooze_minutes: 9 };
  assert.notEqual(
    signatureOf(knowt as never, daily, skipped as never),
    signatureOf(knowt as never, daily, restored as never),
  );
});

// --- What Upcoming shows afterward. ---------------------------------------

check('the row moves on to the following firing', () => {
  // This is the call `listUpcoming` makes. Without the predicate the row went
  // on offering the occurrence that had just been skipped.
  const daily = schedule();
  const done = completedOccurrences([skip(FRIDAY)]);
  const next = nextOccurrence(daily, TOMORROW, (day: Date) =>
    done.has(`s1@${day.getFullYear()}-10-${String(day.getDate()).padStart(2, '0')}`),
  ) as Date;
  assert.equal(next.getDate(), 17, 'Upcoming still offers the skipped day');
  assert.equal(next.getHours(), 21);
});

check('listUpcoming reads completions and passes the predicate', () => {
  assert.match(dashboard, /const done = completedOccurrences\(/);
  assert.match(dashboard, /await listCompletionsSince\(completionWindowStart\(now\)\),/);
  assert.match(
    dashboard,
    /const at = nextOccurrence\(schedule, tomorrow, \(day\) =>\n\s+isOccurrenceDone\(done, schedule\.id, day\),\n\s+\);/,
  );
});

// --- A skip that cannot name its day is not a skip. -----------------------

check('an unnamed completion skips nothing, whatever day it is stamped for', () => {
  const done = completedOccurrences([skip(FRIDAY, null)]);
  assert.equal(done.size, 0);
  const weekdays = (desiredFor(schedule(), NOW, done) as Row).weekdays as number[];
  assert.equal(weekdays.length, 7);
});

check('a completion stamped now covers today, not the day that was skipped', () => {
  // The whole reason `completedAt` is passed. This is what the control would
  // do without it.
  const done = completedOccurrences([skip(NOW)]);
  const weekdays = (desiredFor(schedule(), NOW, done) as Row).weekdays as number[];
  assert.ok(weekdays.includes(dayOfWeek(FRIDAY)), 'Friday was skipped by accident');
  assert.ok(!weekdays.includes(dayOfWeek(NOW)), 'today was not skipped');
});

check('a weekday whose firing has already passed is left in', () => {
  // Once a firing's time is behind us the next one on that weekday is a week
  // out, and nobody has answered that. Taking the day out would cost it.
  const morning = schedule({ time: '09:00' });
  const done = completedOccurrences([skip(new Date(2026, 9, 15, 9, 0))]);
  const weekdays = (desiredFor(morning, NOW, done) as Row).weekdays as number[];
  assert.equal(weekdays.length, 7);
});

check('a schedule that rings on one weekday falls back rather than going silent', () => {
  // Nothing left to recur on once the day comes out, so it arms the single
  // next occurrence instead, which the predicate has already moved past.
  const fridays = schedule({
    repeat_type: 'days_of_week',
    days_of_week: JSON.stringify([dayOfWeek(FRIDAY)]),
  });
  const done = completedOccurrences([skip(FRIDAY)]);
  const desired = desiredFor(fridays, NOW, done) as Row | null;
  assert.ok(desired, 'the Knowt went silent for good');
  assert.equal(desired.mode, 'once');
  assert.equal((desired.nextAt as Date).getDate(), 23, 'it armed the day it was told to skip');
});

// --- The control. ---------------------------------------------------------

check('the row carries the open circle and still opens the Knowt', () => {
  // The same control a Today card has: an open ring at 26 in the border gray,
  // with the same 10 point hit slop. The pill that stood here briefly is gone.
  assert.match(home, /<Icon name="circle" size=\{26\} color=\{theme\.color\.border\} \/>/);
  assert.match(home, /hitSlop=\{10\}/);
  assert.match(home, /onPress=\{\(\) => onComplete\(entry\)\}/);
  assert.match(home, /upcomingCheck: \{ alignItems: 'center', justifyContent: 'center' \},/);
  assert.ok(!home.includes('Skip this one'), 'the Skip pill is still rendered');
  assert.ok(!home.includes('upcomingSkip'), 'the Skip pill styles are still there');
  // The row's own press is untouched, and the inner Pressable wins the touch.
  assert.match(home, /onPress=\{\(\) => onOpen\(entry\.knowt\.id\)\}/);
  // And the two line layout stays.
  assert.match(home, /<View style=\{styles\.upcomingText\}>/);
  assert.match(home, /\{whenLabel\(entry\.at, now\)\}/);
});

check('the same control is on both halves of the row, by Mode', () => {
  // One circle, two behaviors, and the label says which before anyone finds
  // out by pressing it.
  assert.match(home, /needsScan\(entry\.knowt\)\n\s+\? `Scan the tag to mark \$\{entry\.knowt\.name\} done/);
  assert.match(home, /: `Mark \$\{entry\.knowt\.name\} done for/);
});

check('an Alarm Only Knowt completes through completeOccurrence', () => {
  const at = home.indexOf('const completeTarget');
  const after = home.slice(at, at + 1400);
  assert.match(after, /if \(!needsScan\(target\.knowt\)\) \{\n\s+await skipOccurrence\(target, 'tap'\);/);
  // Through the shared primitive, which is the one that names the occurrence.
  const prim = home.indexOf('const skipOccurrence');
  const body = home.slice(prim, prim + 900);
  assert.match(body, /completeOccurrence\(\{/);
  assert.match(body, /scheduleId: target\.scheduleId,/);
  assert.match(body, /completedAt: target\.completedAt,/);
  assert.ok(!body.includes('logCompletion'), 'it bypasses the completion path');
  // And the Upcoming row's target is the one that stamps the occurrence.
  assert.match(home, /completedAt: entry\.at\.getTime\(\),/);
});

check('a scan Mode cannot be completed from Daily without a scan', () => {
  const at = home.indexOf('const completeTarget');
  const after = home.slice(at, at + 1400);
  // The direct path is gated on the negation and nothing else, so there is no
  // value of the Mode that takes a scan Knowt down it.
  assert.match(after, /if \(!needsScan\(target\.knowt\)\) \{/);
  // The only thing a scan Mode's tap does is open the reader, and the
  // completion is written by the scan module after a successful read.
  assert.match(after, /const outcome = await scanKnowtTag\(\n\s+target\.knowt,/);
  assert.match(after, /\? \{\n\s+scheduleId: target\.scheduleId,\n\s+completedAt: target\.completedAt,\n\s+occurrenceAt: target\.occurrenceAt,/);
  // A cancel writes nothing and says nothing; a failure says what happened.
  assert.match(after, /if \(outcome\.kind === 'canceled'\) return;/);
  assert.match(after, /if \(outcome\.kind === 'failed'\) \{/);
  assert.match(after, /setNotice\(\{ where: target\.where, tone: 'danger', text: outcome\.message \}\);/);
  // And there is no branch that completes a scan Mode any other way: the only
  // `skipOccurrence` call in this function is behind `!needsScan`.
  assert.equal(after.match(/skipOccurrence\(/g)?.length, 1);
  assert.equal(after.match(/'tap'/g)?.length, 1);
  // Both rings on this screen go through it, which is the whole fix: the
  // Today card used to call a completion of its own with no Mode check.
  assert.match(home, /\? \(\) => void completeTarget\(cardTarget\(card\)\)/);
  assert.match(home, /onComplete=\{\(entry\) => void completeTarget\(upcomingTarget\(entry\)\)\}/);
  assert.equal(home.match(/completeOccurrence\(\{/g)?.length, 1, 'a second completion is written here');
  // Nowhere on this screen offers a mark done without scanning.
  assert.ok(!home.includes("method: 'override'"), 'Daily records overrides');
});

check('a wrong tag is refused by the reader, not by the screen', () => {
  // The expected UID goes down into the platform's own sheet, so a wrong tag
  // is rejected while the phone is still against it and nothing is written.
  assert.match(scan, /expectRawUid: knowt\.tag_uid,/);
  assert.match(scan, /if \(!knowt\.tag_uid\) \{/);
  // The copy for every reason that is a failure lives in one place.
  assert.match(scan, /const failure = nfcFailureMessage\(err\);/);
});

check('the skip primitive is still here, for the override flow to reuse', () => {
  // `skipOccurrence` is what records one occurrence and stands its alarm down.
  // The pill that called it is gone and the circle calls it instead; the
  // function itself is deliberately untouched, because the override on the
  // ringing alarm will want exactly this.
  assert.match(home, /const skipOccurrence = async \(\n\s+target: Target,\n\s+method: Extract<EventMethod, 'tap' \| 'scan'>,\n\s+\) => \{/);
  assert.match(home, /const undoSkip = async \(taken: CompletionNotice\) => \{/);
});

check('the confirmation and the Undo are there, and the Undo resyncs', () => {
  assert.match(home, /\$\{method === 'scan' \? 'Scanned' : 'Marked'\} \$\{target\.knowt\.name\}/);
  assert.match(home, /text: `Scanned \$\{target\.knowt\.name\} for \$\{target\.when\}\. Its other days are unchanged\.`,/);
  // One banner, rendered beside whichever set of rings raised it.
  assert.match(home, /notice\?\.where === 'board' \? \(/);
  assert.match(home, /notice=\{notice\?\.where === 'upcoming' \? notice : null\}/);
  // A scan's Undo deletes the row the scan module wrote, by its id.
  assert.match(scan, /return \{ kind: 'done', eventId: written\.value \};/);
  assert.match(home, /\{notice\.tone === 'done' \? 'Undo' : 'Dismiss'\}/);
  const at = home.indexOf('const undoSkip');
  const after = home.slice(at, at + 900);
  assert.match(after, /settled\(undoCompletion\(taken\.eventId\)\)/);
  assert.match(after, /await resyncAlarmsQuietly\(\);/);
});

check('the copy is calm, capitalized and has no exclamation marks', () => {
  for (const text of [
    'The Knowt keeps its other days',
    'Its other days are unchanged.',
    'Scan the tag to mark ',
  ]) {
    assert.ok(home.includes(text), `missing: ${text}`);
    assert.ok(!text.includes('!'), text);
    assert.ok(!text.includes('—'), text);
  }
  assert.ok(!home.includes('keeps its other days!'));
  assert.ok(!home.includes('The knowt keeps'), 'Knowt is lowercase in copy');
});

console.log(`\n${passed} checks passed`);
