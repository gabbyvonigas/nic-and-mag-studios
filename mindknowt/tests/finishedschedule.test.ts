/**
 * A finished schedule, and the two ways back from it.
 *
 * Reported as: a Knowt completed so its row read "Once, finished" could not be
 * revised. Two separate things made that true.
 *
 * The row was tappable and the editor did open and save, so nothing was
 * disabled or blocked. What it went to was the Knowt's Edit screen, which is
 * one more tap from the schedule than it looks. And when the time was changed,
 * the alarm stayed down: a completion keyed on its calendar day, so the day was
 * already done and a new time later the same evening armed nothing. The row
 * went on reading "finished", which is what "cannot be edited" looked like.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs finishedschedule.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const prompt = read('src/knowts/finishedSchedule.ts');
const detail = read('src/screens/KnowtDetailScreen.tsx');
const edit = read('src/screens/EditKnowtScreen.tsx');


const { completedOccurrences, finishedBy, isOccurrenceDone, occurrenceKey } =
  await import(
  `${ROOT}/src/knowts/completions.ts`
);
const { desiredFor } = await import(`${ROOT}/src/alarms/scheduleSync.ts`);
const { scheduleLine } = await import(`${ROOT}/src/knowts/scheduleLine.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Tuesday, October 20 2026, half past eight in the evening. */
const NOW = new Date(2026, 9, 20, 20, 30);
const AT_817 = new Date(2026, 9, 20, 20, 17);
const AT_2200 = new Date(2026, 9, 20, 22, 0);

type Row = Record<string, unknown>;

const schedule = (over: Row = {}): never =>
  ({
    id: 's1', knowt_id: 'k1', label: null, time: '20:17',
    repeat_type: 'once', days_of_week: null, interval_days: null,
    interval_months: null, supply_days: null, lead_days: null,
    start_date: '2026-10-20', enabled: 1, alarmkit_id: 'a1', ...over,
  }) as never;

/** What `logCompletion` writes once it is told which firing it answered. */
const answered = (firing: Date, id = 'e1'): never =>
  ({
    id, knowt_id: 'k1', schedule_id: 's1', fired_at: null,
    completed_at: firing.getTime(), method: 'tap', note: null,
    snooze_count: 0, occurrence_at: firing.getTime(),
  }) as never;

/** A row from before schema 18, which cannot say which firing it answered. */
const legacy = (completedAt: Date): never =>
  ({
    id: 'old', knowt_id: 'k1', schedule_id: 's1', fired_at: null,
    completed_at: completedAt.getTime(), method: 'tap', note: null,
    snooze_count: 0, occurrence_at: null,
  }) as never;

// --- The reconciler's grain. ---------------------------------------------

check('a completion covers one firing, not the rest of its day', () => {
  assert.notEqual(occurrenceKey('s1', AT_817), occurrenceKey('s1', AT_2200));
  const done = completedOccurrences([answered(AT_817)]);
  assert.ok(isOccurrenceDone(done, 's1', AT_817));
  assert.ok(!isOccurrenceDone(done, 's1', AT_2200), 'later that day is done too');
});

check('rescheduling the same day after completing arms the new time', () => {
  // The whole report: finish the 8:17 pm one, move the schedule to 10:00 pm
  // that evening, and the alarm has to be armed for 10:00 pm.
  const done = completedOccurrences([answered(AT_817)]);
  const moved = schedule({ time: '22:00' });
  const desired = desiredFor(moved, NOW, done) as Row | null;
  assert.ok(desired, 'nothing was armed for the new time');
  assert.equal((desired.nextAt as Date).getHours(), 22);
  assert.equal((desired.nextAt as Date).getDate(), 20);
  // And the row says so rather than still reading finished.
  assert.equal(scheduleLine(moved, NOW, done), 'Once, Today');
});

check('and the firing that was answered is still stood down', () => {
  // The earlier fix, which this must not break: completing an occurrence
  // cancels its own alarm.
  const done = completedOccurrences([answered(AT_817)]);
  assert.equal(desiredFor(schedule(), NOW, done), null);
  assert.equal(scheduleLine(schedule(), NOW, done), 'Once, finished');
});

check('a repeating schedule whose time moves arms the next real occurrence', () => {
  const daily = schedule({ repeat_type: 'daily', time: '20:17', start_date: null });
  const done = completedOccurrences([answered(AT_817)]);
  // Today is answered, so tomorrow is next and the weekday comes back.
  const before = desiredFor(daily, NOW, done) as Row;
  assert.equal((before.nextAt as Date).getDate(), 21);

  // Move it to ten tonight: today is live again at the new time.
  const moved = schedule({ repeat_type: 'daily', time: '22:00', start_date: null });
  const after = desiredFor(moved, NOW, done) as Row;
  assert.equal((after.nextAt as Date).getDate(), 20);
  assert.equal((after.weekdays as number[]).length, 7, 'a day is still being skipped');
});

check('changing the days of a finished repeat arms the next one of them', () => {
  const fridays = schedule({
    repeat_type: 'days_of_week', days_of_week: JSON.stringify([6]),
    time: '20:17', start_date: null,
  });
  const done = completedOccurrences([answered(AT_817)]);
  const desired = desiredFor(fridays, NOW, done) as Row;
  // Friday the 23rd, which nobody has answered.
  assert.equal((desired.nextAt as Date).getDate(), 23);
});

check('a row from before schema 18 still covers its whole day', () => {
  // No back-fill, so old history keeps exactly the meaning it had. Guessing a
  // moment for it would silence a real alarm or raise one already done.
  const done = completedOccurrences([legacy(AT_817)]);
  assert.ok(isOccurrenceDone(done, 's1', AT_817));
  assert.ok(isOccurrenceDone(done, 's1', AT_2200));
  assert.equal(desiredFor(schedule({ time: '22:00' }), NOW, done), null);
});

// --- Which completion an undo takes back. --------------------------------

check('the undo takes back the latest completion naming that schedule', () => {
  const older = answered(new Date(2026, 9, 19, 20, 17), 'e-old');
  const newer = answered(AT_817, 'e-new');
  assert.equal((finishedBy(schedule(), [older, newer]) as Row).id, 'e-new');
  assert.equal((finishedBy(schedule(), [newer, older]) as Row).id, 'e-new');
  // Nothing of its own, nothing to take back.
  assert.equal(finishedBy(schedule(), []), null);
  const other = { ...(answered(AT_817) as Row), schedule_id: 's2' } as never;
  assert.equal(finishedBy(schedule(), [other]), null);
  // A ringing session that was never completed is not a completion.
  const opened = { ...(answered(AT_817) as Row), completed_at: null } as never;
  assert.equal(finishedBy(schedule(), [opened]), null);
});

check('removing it puts the occurrence back in play', () => {
  const done = completedOccurrences([answered(AT_817)]);
  assert.equal(desiredFor(schedule(), NOW, done), null);
  // `undoCompletion` deletes the row, and nothing else is stored.
  const undone = completedOccurrences([]);
  // Its time has gone by half past, so a Once schedule has nothing ahead and
  // the screen carries on into the editor. That is the point of the handoff.
  assert.equal(desiredFor(schedule(), NOW, undone), null);
  // One whose time is still ahead is simply live again.
  const later = schedule({ time: '22:00' });
  assert.ok(desiredFor(later, NOW, completedOccurrences([])));
});

// --- The sheet. ----------------------------------------------------------

check('the sheet has the title and all three choices', () => {
  assert.match(prompt, /'This one is finished',/);
  assert.match(prompt, /\{ text: 'Reschedule', onPress: \(\) => resolve\('reschedule'\) \},/);
  assert.match(prompt, /\{ text: 'Mark not done', onPress: \(\) => resolve\('undo'\) \},/);
  assert.match(prompt, /\{ text: 'Cancel', style: 'cancel', onPress: \(\) => resolve\('cancel'\) \},/);
  // Backing out of it changes nothing either.
  assert.match(prompt, /onDismiss: \(\) => resolve\('cancel'\)/);
});

check('Reschedule opens the editor and touches no history', () => {
  for (const [where, src] of [['detail', detail], ['Edit', edit]] as const) {
    const at = src.indexOf('const handleFinished');
    const body = src.slice(at, at + 1100);
    assert.match(body, /if \(choice === 'cancel'\) return;/, where);
    const resched = body.indexOf("if (choice === 'reschedule')");
    const undo = body.indexOf('undoCompletion');
    assert.ok(resched > 0 && undo > resched, `${where}: the undo runs first`);
    // The reschedule branch returns before anything is deleted.
    const branch = body.slice(resched, undo);
    assert.match(branch, /openSchedule\(schedule\.id\);\n\s+return;/, where);
    assert.ok(!branch.includes('undoCompletion'), where);
  }
  assert.match(detail, /navigation\.navigate\('EditSchedule', \{ knowtId: knowt\.id, scheduleId \}\)/);
  assert.match(edit, /navigation\.navigate\('EditSchedule', \{ knowtId: params\.knowtId, scheduleId \}\)/);
});

check('Mark not done removes the completion and resyncs', () => {
  for (const [where, src] of [['detail', detail], ['Edit', edit]] as const) {
    const at = src.indexOf('const handleFinished');
    const body = src.slice(at, at + 1400);
    assert.match(body, /const completion = finishedBy\(schedule, events \?\? \[\]\);/, where);
    assert.match(body, /if \(completion\) await undoCompletion\(completion\.id\);/, where);
    assert.match(body, /await resyncAlarmsQuietly\(\);/, where);
    // And into the editor when there is nothing left ahead to put back.
    assert.match(
      body,
      /if \(!nextOccurrence\(schedule, new Date\(\)\)\) openSchedule\(schedule\.id\);/,
      where,
    );
  }
});

check('a finished row is tappable on both screens', () => {
  for (const [where, src] of [['detail', detail], ['Edit', edit]] as const) {
    assert.match(src, /\? openEditor\n\s+: \(\) => void handleFinished\(schedule\)|\? \(\) => openSchedule\(schedule\.id\)\n\s+: \(\) => void handleFinished\(schedule\)/, where);
    // The gate is the same question the row's own line asks, so a row that
    // reads finished is the row that opens the sheet.
    assert.match(src, /nextOccurrence\(schedule, nowForRows, \(at\) =>\n\s+isOccurrenceDone\(doneOccurrences, schedule\.id, at\),\n\s+\)/, where);
    // Nothing is disabled, which is what was suspected and was never true.
    assert.ok(!/scheduleRow[\s\S]{0,400}disabled/.test(src), `${where}: the row is disabled`);
  }
});

check('neither choice completes anything, so no Mode is involved', () => {
  for (const src of [detail, edit]) {
    const at = src.indexOf('const handleFinished');
    const body = src.slice(at, at + 1400);
    assert.ok(!body.includes('completeOccurrence'), 'it records a completion');
    assert.ok(!body.includes('scanKnowtTag'), 'it opens the reader');
    assert.ok(!body.includes('needsScan'), 'it asks about the Mode');
  }
});

check('the copy is calm, with no exclamation mark and no em dash', () => {
  for (const text of [
    'This one is finished',
    'Change when it rings next, or put the completion back if it was not done.',
    'Reschedule',
    'Mark not done',
    'Cancel',
  ]) {
    assert.ok(prompt.includes(text), `missing: ${text}`);
    assert.ok(!text.includes('!'), text);
    assert.ok(!text.includes('—'), text);
  }
});

console.log(`\n${passed} checks passed`);
