/**
 * The date on a schedule row.
 *
 * The rows on the Knowt detail screen and on Edit showed the time and the word
 * "Once", which answers how often and leaves out the one thing a person
 * reading a list of schedules wants to know: which day. Opening the editor to
 * find out is three taps for a date the row had room for.
 *
 * A one-off names its day outright, because for it "how often" and "when" are
 * the same fact. Anything that repeats names the next firing, which is not
 * always the next day the pattern allows: a day already completed or skipped
 * is passed over here exactly as the reconciler passes over it, so the row
 * cannot name a firing that will not happen.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs scheduleline.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const detail = read('src/screens/KnowtDetailScreen.tsx');
const edit = read('src/screens/EditKnowtScreen.tsx');

const { scheduleLine } = await import(`${ROOT}/src/knowts/scheduleLine.ts`);
const { completedOccurrences } = await import(`${ROOT}/src/knowts/completions.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Tuesday, October 20 2026, six in the evening. */
const NOW = new Date(2026, 9, 20, 18, 0);

type Row = Record<string, unknown>;

const schedule = (over: Row = {}): never =>
  ({
    id: 's1', knowt_id: 'k1', label: null, time: '19:21',
    repeat_type: 'once', days_of_week: null, interval_days: null,
    interval_months: null, supply_days: null, lead_days: null,
    start_date: '2026-10-20', enabled: 1, alarmkit_id: null, ...over,
  }) as never;

/** The event row a completion of the occurrence at `at` writes. */
const doneAt = (at: Date, scheduleId = 's1'): never =>
  ({
    id: `e-${at.getTime()}`, knowt_id: 'k1', schedule_id: scheduleId,
    fired_at: null, completed_at: at.getTime(), method: 'tap',
    note: null, snooze_count: 0,
  }) as never;

// --- A one-off names its day. --------------------------------------------

check('Once, Today for a one-off later the same day', () => {
  // The Knowt in the report: 7:21 pm, Once, read at six.
  assert.equal(scheduleLine(schedule(), NOW), 'Once, Today');
});

check('Once, Tomorrow and Once, Tue, Oct 27 further out', () => {
  assert.equal(
    scheduleLine(schedule({ start_date: '2026-10-21' }), NOW),
    'Once, Tomorrow',
  );
  assert.equal(
    scheduleLine(schedule({ start_date: '2026-10-27' }), NOW),
    'Once, Tue, Oct 27',
  );
});

check('a one-off whose time has passed says so rather than naming a date', () => {
  // The existing wording on the Knowts tab for a schedule with nothing ahead.
  assert.equal(scheduleLine(schedule({ time: '09:00' }), NOW), 'Once, finished');
  assert.equal(
    scheduleLine(schedule({ start_date: '2026-10-19' }), NOW),
    'Once, finished',
  );
});

check('and a one-off already done is finished, not due again', () => {
  const done = completedOccurrences([doneAt(new Date(2026, 9, 20, 19, 21))]);
  assert.equal(scheduleLine(schedule(), NOW, done), 'Once, finished');
});

// --- A repeat names the next firing. -------------------------------------

check('a repeat says next, with the repeat it already showed', () => {
  const daily = schedule({ repeat_type: 'daily', time: '07:00', start_date: null });
  // Seven in the morning is behind us at six in the evening, so the next one
  // is tomorrow. The repeat word is `describeRepeat`'s, unchanged.
  assert.equal(scheduleLine(daily, NOW), 'Every day, next Tomorrow');

  const evening = schedule({ repeat_type: 'daily', time: '19:21', start_date: null });
  assert.equal(scheduleLine(evening, NOW), 'Every day, next Today');
});

check('a completed or skipped day is passed over', () => {
  const daily = schedule({ repeat_type: 'daily', time: '19:21', start_date: null });
  const done = completedOccurrences([doneAt(new Date(2026, 9, 20, 19, 21))]);
  assert.equal(scheduleLine(daily, NOW, done), 'Every day, next Tomorrow');

  // Two in a row, so the row keeps moving rather than stopping at the first.
  const both = completedOccurrences([
    doneAt(new Date(2026, 9, 20, 19, 21)),
    doneAt(new Date(2026, 9, 21, 19, 21)),
  ]);
  assert.equal(scheduleLine(daily, NOW, both), 'Every day, next Thu, Oct 22');
});

check('a weekday repeat names the weekday it actually falls on', () => {
  const weekdays = schedule({
    repeat_type: 'weekdays', time: '07:00', start_date: null,
  });
  assert.equal(scheduleLine(weekdays, NOW), 'Weekdays, next Tomorrow');

  // Read on a Saturday, the next weekday is the Monday.
  const saturday = new Date(2026, 9, 24, 18, 0);
  assert.equal(scheduleLine(weekdays, saturday), 'Weekdays, next Mon, Oct 26');
});

check('a paused schedule names no date, because it has none to name', () => {
  const paused = schedule({ repeat_type: 'daily', enabled: 0, start_date: null });
  assert.equal(scheduleLine(paused, NOW), 'Every day, paused');
});

// --- Both rows use it, and neither grew. ---------------------------------

check('the detail screen and Edit both render it', () => {
  assert.match(detail, /\{scheduleLine\(schedule, nowForRows, doneOccurrences\)\}/);
  assert.match(edit, /\{scheduleLine\(schedule, nowForRows, doneOccurrences\)\}/);
  // Fed the same two things on both screens, so they cannot differ.
  for (const src of [detail, edit]) {
    assert.match(src, /const nowForRows = new Date\(\);/);
    assert.match(src, /const doneOccurrences = completedOccurrences\(events \?\? \[\]\);/);
  }
  // Edit had to start reading events to know what had been done.
  assert.match(edit, /\(\) => listEvents\(params\.knowtId\),/);
});

check('it is the second line, and the time is still the first', () => {
  // Row height and tap target are unchanged: both rows already had two lines
  // and this only changes what the second one says.
  assert.match(detail, /<Text style=\{styles\.cardTitle\}>\n\s+\{formatTime\(schedule\.time\)\}/);
  assert.match(edit, /<Text style=\{styles\.scheduleTime\}>\n\s+\{formatTime\(schedule\.time\)\}/);
  // And the old line is gone from both, so a repeat cannot be printed twice.
  for (const src of [detail, edit]) {
    assert.ok(!src.includes('describeRepeat'), 'the old line is still rendered');
  }
});

check('the wording is the Upcoming rows own, through the shared helper', () => {
  const helper = read('src/knowts/scheduleLine.ts');
  assert.match(helper, /import \{ dayLabel \} from '\.\/occurrences';/);
  assert.match(helper, /nextOccurrence\(schedule, now, \(day\) =>/);
  assert.match(helper, /isOccurrenceDone\(done, schedule\.id, day\),/);
  // No exclamation marks and no em dash in anything it can produce.
  for (const text of ['paused', 'finished', 'next ']) {
    assert.ok(!text.includes('!'));
    assert.ok(!text.includes('—'));
  }
});

console.log(`\n${passed} checks passed`);
