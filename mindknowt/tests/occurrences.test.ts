/**
 * The calendar in "When it happens": which days light up, and what the
 * summary line says.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs occurrences.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const {
  clockLabel,
  dayLabel,
  draftRow,
  monthGrid,
  nextOccurrences,
  occursOn,
} = await import(`${ROOT}/src/knowts/occurrences.ts`);
const { REPEAT_PRESETS } = await import(`${ROOT}/src/knowts/repeats.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Monday, October 12 2026.
const START = new Date(2026, 9, 12);
const draft = (over: Record<string, unknown> = {}) =>
  ({ preset: 'daily', days: [], count: 3, startDate: START, ...over }) as never;

const occurrencesIn = (d: never, month: Date) => {
  const row = draftRow(d);
  return monthGrid(month)
    .filter((day: Date) => day.getMonth() === month.getMonth())
    .filter((day: Date) => occursOn(row, day, (d as { startDate: Date }).startDate))
    .map(iso);
};

// The grid.

check('the grid is six whole weeks, starting on a Sunday', () => {
  for (const month of [new Date(2026, 9, 1), new Date(2026, 1, 1), new Date(2028, 1, 1)]) {
    const grid = monthGrid(month);
    assert.equal(grid.length, 42, `${iso(month)} grid length`);
    assert.equal(grid[0]!.getDay(), 0, 'starts on a Sunday');
    assert.equal(grid[41]!.getDay(), 6, 'ends on a Saturday');
  }
});

check('the grid holds every day of its own month exactly once', () => {
  const grid = monthGrid(new Date(2026, 9, 1)).filter((d: Date) => d.getMonth() === 9);
  assert.equal(grid.length, 31, 'October has 31 days');
  assert.equal(new Set(grid.map(iso)).size, 31, 'a day repeats');
});

check('the grid is a fixed height, so paging does not move the page', () => {
  // February 2026 needs five weeks and August 2026 needs six. Both are 42.
  for (const month of [new Date(2026, 1, 1), new Date(2026, 7, 1)]) {
    assert.equal(monthGrid(month).length, 42);
  }
});

// What lights up.

check('daily lights every day from the start, and none before it', () => {
  const days = occurrencesIn(draft(), new Date(2026, 9, 1));
  assert.equal(days.length, 20, 'the 12th to the 31st');
  assert.equal(days[0], '2026-10-12');
  assert.ok(!days.includes('2026-10-11'), 'nothing before the start date');
});

check('weekly lights the same weekday every week', () => {
  // The start is a Monday, so weekly means Mondays.
  const days = occurrencesIn(draft({ preset: 'weekly', days: [2] }), new Date(2026, 9, 1));
  assert.deepEqual(days, ['2026-10-12', '2026-10-19', '2026-10-26']);
  for (const d of days) assert.equal(new Date(`${d}T12:00`).getDay(), 1, 'a Monday');
});

check('a weekly schedule does not light the weeks before it starts', () => {
  // This is the case isDueOn alone gets wrong: it answers the weekday question
  // and knows nothing about a start date, so the 5th would light up too.
  const days = occurrencesIn(draft({ preset: 'weekly', days: [2] }), new Date(2026, 9, 1));
  assert.ok(!days.includes('2026-10-05'), 'the Monday before the start');
});

check('weekdays and weekends split the week between them', () => {
  const week = occurrencesIn(draft({ preset: 'weekdays' }), new Date(2026, 9, 1));
  const ends = occurrencesIn(draft({ preset: 'weekends' }), new Date(2026, 9, 1));
  for (const d of week) {
    const wd = new Date(`${d}T12:00`).getDay();
    assert.ok(wd >= 1 && wd <= 5, `${d} is not a weekday`);
  }
  for (const d of ends) {
    const wd = new Date(`${d}T12:00`).getDay();
    assert.ok(wd === 0 || wd === 6, `${d} is not a weekend`);
  }
  assert.equal(new Set([...week, ...ends]).size, week.length + ends.length, 'they overlap');
});

check('certain days lights exactly the days picked', () => {
  // Tuesday and Friday, in the spec's Sunday = 1 encoding.
  const days = occurrencesIn(draft({ preset: 'certain_days', days: [3, 6] }), new Date(2026, 9, 1));
  for (const d of days) {
    const wd = new Date(`${d}T12:00`).getDay();
    assert.ok(wd === 2 || wd === 5, `${d} is neither Tuesday nor Friday`);
  }
  assert.ok(days.length >= 5);
});

check('every few days counts from the start date', () => {
  const days = occurrencesIn(draft({ preset: 'every_n_days', count: 5 }), new Date(2026, 9, 1));
  assert.deepEqual(days, ['2026-10-12', '2026-10-17', '2026-10-22', '2026-10-27']);
});

check('monthly lights one day a month, which it did not before', () => {
  // The bug this covers: createKnowt had no intervalMonths, so monthly saved
  // both interval columns null and isDueOn answered false for every date. The
  // schedule existed and could never ring.
  const d = draft({ preset: 'monthly' });
  const row = draftRow(d);
  assert.equal(row.interval_months, 1, 'the draft carries months');
  assert.equal(row.interval_days, null);

  assert.deepEqual(occurrencesIn(d, new Date(2026, 9, 1)), ['2026-10-12']);
  assert.deepEqual(occurrencesIn(d, new Date(2026, 10, 1)), ['2026-11-12']);
  assert.deepEqual(occurrencesIn(d, new Date(2026, 11, 1)), ['2026-12-12']);
});

check('every 6 months and annually carry their own month counts', () => {
  assert.equal(draftRow(draft({ preset: 'six_months' })).interval_months, 6);
  assert.equal(draftRow(draft({ preset: 'annually' })).interval_months, 12);
  // Annually skips the months in between rather than lighting all of them.
  const yearly = draft({ preset: 'annually' });
  assert.deepEqual(occurrencesIn(yearly, new Date(2026, 9, 1)), ['2026-10-12']);
  assert.deepEqual(occurrencesIn(yearly, new Date(2026, 10, 1)), []);
  assert.deepEqual(occurrencesIn(yearly, new Date(2027, 9, 1)), ['2027-10-12']);
});

check('just once lights exactly one day, ever', () => {
  const d = draft({ preset: 'once' });
  assert.deepEqual(occurrencesIn(d, new Date(2026, 9, 1)), ['2026-10-12']);
  assert.deepEqual(occurrencesIn(d, new Date(2026, 10, 1)), []);
  assert.equal(nextOccurrences(d, 6).length, 1, 'there is no second one');
});

check('moving the start date moves the whole rhythm', () => {
  const monday = occurrencesIn(draft({ preset: 'weekly', days: [2] }), new Date(2026, 9, 1));
  // Start a week later: the first occurrence moves, the weekday does not.
  const later = occurrencesIn(
    draft({ preset: 'weekly', days: [2], startDate: new Date(2026, 9, 19) }),
    new Date(2026, 9, 1),
  );
  assert.equal(monday[0], '2026-10-12');
  assert.equal(later[0], '2026-10-19');
  assert.ok(later.length < monday.length, 'a later start has fewer this month');
});

check('every preset the picker offers produces something to highlight', () => {
  // A preset that lights nothing anywhere is a schedule that never rings, and
  // it should not be possible to pick one.
  // Read from the picker itself rather than listed here, so a preset added
  // later is covered without anyone remembering to add it.
  const presets = REPEAT_PRESETS.map((p: { id: string }) => p.id);
  assert.ok(presets.length >= 12, `only ${presets.length} presets`);
  for (const preset of presets) {
    const d = draft({ preset, days: [2], count: 3 });
    const hits = nextOccurrences(d, 2, 800);
    assert.ok(hits.length >= 1, `${preset} never rings`);
    // On or after the start, not on it. A weekends schedule begun on a Monday
    // correctly waits for Saturday, and weekdays begun on a Saturday waits
    // for Monday.
    assert.ok(iso(hits[0]!) >= '2026-10-12', `${preset} rings before it starts`);
    assert.ok(iso(hits[0]!) <= '2026-10-19', `${preset} takes over a week to start`);
  }
});

// The summary line.

check('the summary names the day plainly when it is close', () => {
  const today = new Date(2026, 9, 12);
  assert.equal(dayLabel(new Date(2026, 9, 12), today), 'today');
  assert.equal(dayLabel(new Date(2026, 9, 13), today), 'tomorrow');
  assert.equal(dayLabel(new Date(2026, 9, 19), today), 'Mon, Oct 19');
  assert.equal(dayLabel(new Date(2027, 0, 2), today), 'Sat, Jan 2');
});

check('the clock reads the way a person says it', () => {
  assert.equal(clockLabel('06:00'), '6:00 am');
  assert.equal(clockLabel('00:00'), '12:00 am');
  assert.equal(clockLabel('12:00'), '12:00 pm');
  assert.equal(clockLabel('13:05'), '1:05 pm');
  assert.equal(clockLabel('23:59'), '11:59 pm');
});

console.log(`\n${passed} checks passed`);
