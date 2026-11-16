/**
 * The Log tiles' change indicators, and the weekday trend chart.
 *
 * Both were producing wrong output on device: changes of 550% and 376% off a
 * previous period that barely existed, and an x axis reading "1 6 1. 1. 2".
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs logdelta.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const {
  MIN_PREVIOUS,
  deltaBetween,
  previousWindow,
  rangeFor,
  summarizePeriod,
  weekdayTotals,
} = await import(`${ROOT}/src/history/period.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// A Wednesday, mid afternoon, two thirds of the way through September.
const TODAY = new Date(2026, 8, 23, 15, 0, 0);

let seq = 0;
function event(when: Date, done = true, over: Record<string, unknown> = {}) {
  seq += 1;
  return {
    id: `e${seq}`,
    knowt_id: 'k1',
    schedule_id: null,
    fired_at: when.getTime(),
    completed_at: done ? when.getTime() : null,
    method: done ? 'scan' : null,
    note: null,
    snooze_count: 0,
    ...over,
  } as never;
}

const KNOWTS = [{ id: 'k1', name: 'Vitamins', category: { id: 'c1' } }] as never[];
const CATEGORIES = [{ id: 'c1', name: 'Home', color: '#FF4D3D' }] as never[];

function summarize(range: never, events: never[]) {
  return summarizePeriod({
    range,
    knowts: KNOWTS,
    categories: CATEGORIES,
    events,
    today: TODAY,
  } as never);
}

/** Completions spread over the first `count` days of a month. */
function daysIn(year: number, month: number, count: number, perDay = 1) {
  const out: never[] = [];
  for (let day = 1; day <= count; day += 1) {
    for (let n = 0; n < perDay; n += 1) {
      out.push(event(new Date(year, month, day, 9, 0)) as never);
    }
  }
  return out;
}

// The gate. This is the bug that produced 550%.

check('a previous period too thin to divide by reports no change', () => {
  // Two completions last month against thirteen this month is +550%, which is
  // arithmetically true and tells the person nothing except that they had just
  // installed the app.
  const range = rangeFor('month', TODAY);
  const now = summarize(range as never, daysIn(2026, 8, 13) as never[]);
  const before = summarize(
    previousWindow(range, TODAY) as never,
    daysIn(2026, 7, 2) as never[],
  );

  assert.equal(now.completions, 13);
  assert.equal(before.completions, 2);
  assert.ok(before.completions < MIN_PREVIOUS, 'the sample is below the gate');
  assert.equal(deltaBetween(now, before).completions, null);
});

check('a previous period with nothing at all reports no change', () => {
  const range = rangeFor('month', TODAY);
  const now = summarize(range as never, daysIn(2026, 8, 9) as never[]);
  const before = summarize(previousWindow(range, TODAY) as never, [] as never[]);
  const delta = deltaBetween(now, before);
  assert.equal(delta.completions, null);
  assert.equal(delta.rate, null);
  assert.equal(delta.overrides, null);
});

check('a real sample on both sides does report the change', () => {
  const range = rangeFor('month', TODAY);
  const now = summarize(range as never, daysIn(2026, 8, 12) as never[]);
  const before = summarize(
    previousWindow(range, TODAY) as never,
    daysIn(2026, 7, 10) as never[],
  );
  assert.equal(now.completions, 12);
  assert.equal(before.completions, 10);
  assert.equal(deltaBetween(now, before).completions, 0.2);
});

// Like for like. This is the other half of the bug.

check('a month in progress is compared against the same span, not a whole month', () => {
  // On the 23rd, the current month holds 23 days. Comparing it against all 31
  // days of August would report a collapse every single month, right up to the
  // last day of it.
  const range = rangeFor('month', TODAY);
  const window = previousWindow(range, TODAY);

  assert.equal(window.from.getMonth(), 7, 'August');
  assert.equal(window.from.getDate(), 1);
  assert.ok(
    window.to.getTime() - window.from.getTime() <=
      TODAY.getTime() - range.from.getTime() + 1000,
    'the window is no longer than what has elapsed this month',
  );

  // August ran the whole month. Only the part of it inside the elapsed span
  // counts, so the eight days after the 23rd are left out.
  const full = summarize(window as never, daysIn(2026, 7, 31) as never[]);
  assert.equal(full.completions, 23, 'August 1 to 23, not all 31');

  // And a month keeping the same pace as the one before reads as level,
  // rather than as a collapse that only corrects on the last day.
  const now = summarize(range as never, daysIn(2026, 8, 23) as never[]);
  assert.equal(now.completions, 23);
  assert.equal(deltaBetween(now, full).completions, 0);
});

check('a finished period is compared against a whole period', () => {
  // Reading back to August, both sides are complete, so nothing is truncated.
  const august = rangeFor('month', new Date(2026, 7, 15));
  const window = previousWindow(august, TODAY);
  assert.equal(window.from.getMonth(), 6, 'July');
  assert.equal(window.to.getMonth(), 7, 'and it runs to the end of July');
  assert.equal(window.to.getDate(), 1);
});

check('a week in progress truncates the week before it the same way', () => {
  const range = rangeFor('week', TODAY);
  const window = previousWindow(range, TODAY);
  const elapsed = TODAY.getTime() - range.from.getTime();
  assert.ok(Math.abs(window.to.getTime() - window.from.getTime() - elapsed) < 1000);
});

// What the rate tile says.

check('a rate change is stated in points, not as a change of a change', () => {
  // 40% to 80% is not "+100%". A rate is already a percentage, and compounding
  // one percentage against another is how a tile ends up saying 376%.
  const range = rangeFor('month', TODAY);
  const now = summarize(range as never, [
    ...daysIn(2026, 8, 8),
    ...[1, 2].map((d) => event(new Date(2026, 8, d, 12, 0), false)),
  ] as never[]);
  const before = summarize(previousWindow(range, TODAY) as never, [
    ...daysIn(2026, 7, 5),
    ...[1, 2, 3, 4, 5].map((d) => event(new Date(2026, 7, d, 12, 0), false)),
  ] as never[]);

  assert.equal(now.rate, 0.8);
  assert.equal(before.rate, 0.5);
  const points = deltaBetween(now, before).rate as number;
  assert.ok(Math.abs(points - 0.3) < 1e-9, `30 points, not 60 percent: ${points}`);
});

check('no change is zero, and it is a number rather than nothing', () => {
  const range = rangeFor('month', TODAY);
  const now = summarize(range as never, daysIn(2026, 8, 10) as never[]);
  const before = summarize(
    previousWindow(range, TODAY) as never,
    daysIn(2026, 7, 10) as never[],
  );
  const delta = deltaBetween(now, before);
  assert.equal(delta.completions, 0);
  assert.notEqual(delta.completions, null, 'level is not the same as unknown');
});

check('a change is never infinite and never not a number', () => {
  const range = rangeFor('month', TODAY);
  for (const [a, b] of [
    [0, 0],
    [20, 0],
    [0, 20],
    [1, 40],
  ]) {
    const now = summarize(range as never, daysIn(2026, 8, a as number) as never[]);
    const before = summarize(
      previousWindow(range, TODAY) as never,
      daysIn(2026, 7, b as number) as never[],
    );
    for (const value of Object.values(deltaBetween(now, before))) {
      assert.ok(
        value === null || Number.isFinite(value),
        `${a} against ${b} gave ${value}`,
      );
    }
  }
});

// The weekday chart.

check('the chart is seven weekday bars, Monday first', () => {
  const range = rangeFor('month', TODAY);
  const bars = weekdayTotals(range, daysIn(2026, 8, 30) as never[], TODAY);
  assert.equal(bars.length, 7);
  assert.deepEqual(
    bars.map((b: { label: string }) => b.label),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  );
  // Never the day-of-month numbers that rendered as "1 6 1. 1. 2".
  for (const bar of bars) assert.ok(Number.isNaN(Number(bar.label)), bar.label);
});

check('every weekday of a month lands in its own bar', () => {
  // September 2026 starts on a Tuesday and has 30 days, so it holds five
  // Tuesdays and Wednesdays and four of everything else.
  const range = rangeFor('month', TODAY);
  const bars = weekdayTotals(range, daysIn(2026, 8, 30) as never[], TODAY);
  const by = Object.fromEntries(
    bars.map((b: { label: string; completions: number }) => [
      b.label,
      b.completions,
    ]),
  );
  assert.equal(by.Tue, 5);
  assert.equal(by.Wed, 5);
  assert.equal(by.Mon, 4);
  assert.equal(by.Sun, 4);
  assert.equal(
    bars.reduce((sum: number, b: { completions: number }) => sum + b.completions, 0),
    30,
    'every completion is counted exactly once',
  );
});

check('the totals are real counts, not the day of the month', () => {
  const range = rangeFor('month', TODAY);
  // Three completions, all on Mondays: the 7th, 14th and 21st.
  const bars = weekdayTotals(
    range,
    [
      event(new Date(2026, 8, 7, 9, 0)),
      event(new Date(2026, 8, 14, 9, 0)),
      event(new Date(2026, 8, 21, 9, 0)),
    ] as never[],
    TODAY,
  );
  const by = Object.fromEntries(
    bars.map((b: { label: string; completions: number }) => [
      b.label,
      b.completions,
    ]),
  );
  assert.equal(by.Mon, 3);
  assert.equal(by.Tue, 0);
  assert.equal(by.Sun, 0);
});

check('a missed alarm is in the total but not in the completed count', () => {
  const range = rangeFor('month', TODAY);
  const bars = weekdayTotals(
    range,
    [
      event(new Date(2026, 8, 7, 9, 0)),
      event(new Date(2026, 8, 7, 10, 0), false),
    ] as never[],
    TODAY,
  );
  const monday = bars.find((b: { label: string }) => b.label === 'Mon');
  assert.equal(monday.completions, 1);
  assert.equal(monday.total, 2);
});

check('today is marked so the chart can pick it out', () => {
  const range = rangeFor('month', TODAY);
  const bars = weekdayTotals(range, [] as never[], TODAY);
  const marked = bars.filter((b: { current: boolean }) => b.current);
  assert.equal(marked.length, 1, 'exactly one weekday is today');
  assert.equal(marked[0]!.label, 'Wed', 'September 23 2026 is a Wednesday');
});

check('a period that is not the current one marks no bar as today', () => {
  // Reading back to a finished month, no bar should claim to be today.
  const august = rangeFor('month', new Date(2026, 7, 15));
  const bars = weekdayTotals(august, [] as never[], TODAY);
  assert.equal(bars.filter((b: { current: boolean }) => b.current).length, 0);
});

check('events outside the period are not counted', () => {
  const range = rangeFor('month', TODAY);
  const bars = weekdayTotals(
    range,
    [
      event(new Date(2026, 7, 31, 9, 0)),
      event(new Date(2026, 9, 1, 9, 0)),
      event(new Date(2026, 8, 7, 9, 0)),
    ] as never[],
    TODAY,
  );
  assert.equal(
    bars.reduce((sum: number, b: { completions: number }) => sum + b.completions, 0),
    1,
  );
});

check('a week period also reads Monday first', () => {
  const range = rangeFor('week', TODAY);
  const bars = weekdayTotals(range, [] as never[], TODAY);
  assert.deepEqual(
    bars.map((b: { label: string }) => b.label),
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  );
});

console.log(`\n${passed} checks passed`);
