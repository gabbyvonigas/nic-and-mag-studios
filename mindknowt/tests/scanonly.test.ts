/**
 * Scan Knowt as a stored choice, and the Log statistics that leave it out.
 *
 * The bug this covers: Scan Knowt was worked out from having no schedule, so
 * four Knowts applied from presets, which have no schedule until someone gives
 * them a time, were being treated as standing scan items. Having no schedule
 * and having chosen to have no alarm are different facts.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs scanonly.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { isScanOnly, SCAN_ONLY_META, SCANNED_TODAY, timedCompletions } =
  await import(`${ROOT}/src/knowts/scanOnly.ts`);
const { summarizePeriod, rangeFor } = await import(`${ROOT}/src/history/period.ts`);
const { summarizeRange } = await import(`${ROOT}/src/history/range.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// Thursday, October 8 2026.
const TODAY = new Date(2026, 9, 8, 18, 0);
const at = (day: number, h: number, m = 0) =>
  new Date(2026, 9, day, h, m).getTime();

const CARE = {
  id: 'c-care', key: 'care', name: 'Care', color: '#24C2B5',
  icon: 'heart', is_custom: 0, sort: 1,
} as never;

const schedule = {
  id: 's1', knowt_id: 'timed', label: null, time: '09:00',
  repeat_type: 'daily', days_of_week: null, interval_days: null,
  interval_months: null, supply_days: null, lead_days: null,
  start_date: '2026-10-01', enabled: 1,
} as never;

/** A Knowt that rings. */
const timedKnowt = {
  id: 'timed', name: 'Vitamins', mode: 'strict', snooze_minutes: 5,
  tag_uid: 'aa01', category: CARE, schedules: [schedule], scan_only: 0,
} as never;

/** A Scan Knowt. The flag is the whole difference. */
const standing = {
  id: 'fridge', name: 'Water filter', mode: 'strict', snooze_minutes: 5,
  tag_uid: 'bb02', category: CARE, schedules: [], scan_only: 1,
} as never;

/** From a preset. No schedule yet, and never chosen to have no alarm. */
const fromPreset = {
  id: 'preset', name: 'Afternoon supplements', mode: 'open', snooze_minutes: 5,
  tag_uid: null, category: CARE, schedules: [], scan_only: 0,
} as never;

// What counts.

check('the flag decides, not the absence of a schedule', () => {
  assert.equal(isScanOnly(standing), true);
  assert.equal(isScanOnly(timedKnowt), false);
});

check('a Knowt from a preset is not a Scan Knowt', () => {
  // The reported bug, in one assertion. Afternoon supplements, Garbage
  // disposal cleaner, Pantry expiry sweep and Stretch or mobility all have no
  // schedule and none of them asked to be a standing scan item.
  assert.equal(fromPreset.schedules.length, 0, 'the fixture has a schedule');
  assert.equal(isScanOnly(fromPreset), false);
});

check('a missing flag counts as not a Scan Knowt', () => {
  // Unknown leans the harmless way. A wrong yes drops real completions out of
  // Peak time and moves a Knowt somewhere the person did not put it; a wrong
  // no leaves everything as it already was.
  assert.equal(isScanOnly({} as never), false);
  assert.equal(isScanOnly({ scan_only: undefined } as never), false);
  assert.equal(isScanOnly({ scan_only: 0 } as never), false);
});

check('the copy says what it is, with no exclamation mark', () => {
  assert.equal(SCAN_ONLY_META, 'Scan only');
  assert.equal(SCANNED_TODAY, 'Done today');
  for (const text of [SCAN_ONLY_META, SCANNED_TODAY]) {
    assert.ok(!text.includes('!'));
    assert.ok(!text.includes('—'));
  }
});

// The Log counts its scans like anything else.

const COMPLETED_TODAY = {
  id: 'e1', knowt_id: 'fridge', schedule_id: null,
  fired_at: null, completed_at: at(8, 14, 30), method: 'scan', note: null,
  snooze_count: 0,
} as never;

const TIMED_TODAY = {
  id: 'e2', knowt_id: 'timed', schedule_id: 's1',
  fired_at: at(8, 9), completed_at: at(8, 9, 12), method: 'scan', note: null,
  snooze_count: 0,
} as never;

const summary = (events: unknown[], knowts = [timedKnowt, standing]) =>
  summarizePeriod({
    range: rangeFor('day', TODAY),
    knowts: knowts as never[],
    categories: [CARE],
    events: events as never[],
    today: TODAY,
  });

check('a scan of a Scan Knowt counts as a completion', () => {
  const result = summary([COMPLETED_TODAY]);
  assert.equal(result.completions, 1);
  assert.equal(result.rate, 1);
});

check('it lands in its category tally', () => {
  const care = summary([COMPLETED_TODAY]).byCategory.find(
    (row) => row.categoryId === 'c-care',
  );
  assert.ok(care, 'no Care row');
  assert.equal(care.completions, 1);
});

check('it lands in the completed list and the trend', () => {
  const result = summarizeRange({
    range: rangeFor('day', TODAY),
    knowts: [timedKnowt, standing] as never[],
    categories: [CARE],
    events: [COMPLETED_TODAY] as never[],
    today: TODAY,
  });
  assert.equal(result.completedItems.length, 1);
  assert.equal(result.completedItems[0]!.knowtName, 'Water filter');
  assert.equal(result.completedItems[0]!.method, 'scan');
  assert.equal(result.days.length, 1);

  const trend = summary([COMPLETED_TODAY]).trend.reduce(
    (sum, bucket) => sum + bucket.completions,
    0,
  );
  assert.equal(trend, 1);
});

// The two clock statistics leave it out.

check('Peak time ignores Scan Knowts', () => {
  // Three evening scans of the fridge tag and one timed completion at nine.
  // The window has to land on the nine: when someone walks past the fridge is
  // not evidence about when they answer reminders. The value is the start of a
  // two hour window, so a single 9:00 completion reports 8.
  const events = [
    TIMED_TODAY,
    { ...(COMPLETED_TODAY as never as object), id: 'e3', completed_at: at(8, 20) },
    { ...(COMPLETED_TODAY as never as object), id: 'e4', completed_at: at(8, 20, 20) },
    { ...(COMPLETED_TODAY as never as object), id: 'e5', completed_at: at(8, 21) },
  ];
  assert.equal(summary(events).peakHour, 8);
  // Without the filter the evening would win it outright, which is what proves
  // the filter is the thing making the difference.
  assert.equal(summary(events, [timedKnowt]).peakHour, 20);
});

check('Peak time is null when only Scan Knowts were done', () => {
  const result = summary([COMPLETED_TODAY]);
  assert.equal(result.peakHour, null);
  assert.equal(result.completions, 1);
});

check('Avg complete time never counts one', () => {
  // Twice over: no fired_at, because nothing rang, and filtered out before the
  // average is taken.
  assert.equal(summary([TIMED_TODAY, COMPLETED_TODAY]).averageMinutes, 12);
  assert.equal(summary([COMPLETED_TODAY]).averageMinutes, null);
});

check('the filter is keyed on the flag, not on the missing schedule', () => {
  // A preset Knowt's completion must stay in the statistics: it has no
  // schedule, but it is an ordinary Knowt whose time is yet to be set.
  const presetDone = {
    ...(COMPLETED_TODAY as never as object),
    id: 'e9', knowt_id: 'preset', fired_at: at(8, 13), completed_at: at(8, 13, 5),
  } as never;
  const kept = timedCompletions([presetDone, COMPLETED_TODAY], [
    fromPreset,
    standing,
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]!.knowt_id, 'preset');
});

check('a Knowt the filter has never heard of is kept', () => {
  // Events outlive deletes, and a deleted timed Knowt still rang at a real
  // time. Dropping its events would rewrite Peak time for every past month.
  assert.equal(timedCompletions([TIMED_TODAY], []).length, 1);
});

console.log(`\n${passed} checks passed`);
