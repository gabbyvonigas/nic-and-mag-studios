/**
 * Month, week and day ranges, and what lands in each bucket.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs period.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { rangeFor, shiftRange, summarizePeriod } = await import(
  `${ROOT}/src/history/period.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// A Wednesday.
const TODAY = new Date(2026, 5, 24, 12, 0, 0);

function event(when: Date, over: Record<string, unknown> = {}) {
  return {
    id: `e${when.getTime()}${Math.random()}`,
    knowt_id: 'k1',
    schedule_id: null,
    fired_at: when.getTime(),
    completed_at: when.getTime(),
    method: 'scan',
    note: null,
    snooze_count: 0,
    ...over,
  } as never;
}

const KNOWTS = [
  { id: 'k1', name: 'Vitamins', category: { id: 'c1' } },
  { id: 'k2', name: 'Bins', category: null },
] as never[];
const CATEGORIES = [{ id: 'c1', name: 'Home', color: '#FF4D3D' }] as never[];

function summarize(kind: 'month' | 'week' | 'day', events: never[]) {
  return summarizePeriod({
    range: rangeFor(kind, TODAY),
    knowts: KNOWTS,
    categories: CATEGORIES,
    events,
    today: TODAY,
  });
}

check('a day is one day, and a week starts on Sunday', () => {
  const day = rangeFor('day', TODAY);
  assert.equal(day.to.getTime() - day.from.getTime(), 86_400_000);

  const week = rangeFor('week', TODAY);
  assert.equal(week.from.getDay(), 0, 'weeks run Sunday to Saturday');
  assert.equal(week.to.getTime() - week.from.getTime(), 7 * 86_400_000);
  assert.ok(week.from <= TODAY && TODAY < week.to);

  const month = rangeFor('month', TODAY);
  assert.equal(month.from.getDate(), 1);
  assert.equal(month.from.getMonth(), 5);
  assert.equal(month.to.getMonth(), 6);
});

check('stepping moves by a whole period, not a day', () => {
  const week = rangeFor('week', TODAY);
  const back = rangeFor('week', shiftRange(week, -1));
  assert.equal(week.from.getTime() - back.from.getTime(), 7 * 86_400_000);

  const month = rangeFor('month', TODAY);
  const prev = rangeFor('month', shiftRange(month, -1));
  assert.equal(prev.from.getMonth(), 4);

  const day = rangeFor('day', TODAY);
  const yesterday = rangeFor('day', shiftRange(day, -1));
  assert.equal(day.from.getTime() - yesterday.from.getTime(), 86_400_000);
});

check('the bucket count matches the span', () => {
  assert.equal(summarize('day', []).trend.length, 6, 'four hour blocks');
  assert.equal(summarize('week', []).trend.length, 7);
  assert.equal(summarize('month', []).trend.length, 30, 'June has 30 days');
});

check('events outside the range do not count', () => {
  const lastMonth = new Date(2026, 4, 15, 9);
  const summary = summarize('month', [event(lastMonth)]);
  assert.equal(summary.completions, 0);
  assert.equal(summary.rate, null, 'nothing happened, so there is no rate');
});

check('a miss lowers the rate without being a completion', () => {
  const inRange = new Date(2026, 5, 10, 9);
  const summary = summarize('month', [
    event(inRange),
    event(inRange, { completed_at: null, method: null }),
  ]);
  assert.equal(summary.completions, 1);
  assert.equal(summary.missed, 1);
  assert.equal(summary.rate, 0.5);
});

check('overrides are counted separately, not excluded', () => {
  const at = new Date(2026, 5, 10, 9);
  const summary = summarize('month', [
    event(at, { method: 'override' }),
    event(at, { method: 'scan' }),
  ]);
  assert.equal(summary.completions, 2, 'an override still finished the thing');
  assert.equal(summary.overrides, 1);
});

check('completions land in the right bucket', () => {
  const morning = new Date(2026, 5, 24, 9);
  const evening = new Date(2026, 5, 24, 21);
  const day = summarize('day', [event(morning), event(evening), event(evening)]);

  const nine = day.trend.find((b) => b.label === '8a');
  const nightBucket = day.trend.find((b) => b.label === '8p');
  assert.equal(nine?.completions, 1);
  assert.equal(nightBucket?.completions, 2);
});

check('today is the marked bucket, and only today', () => {
  const week = summarize('week', []);
  const marked = week.trend.filter((b) => b.current);
  assert.equal(marked.length, 1);
  assert.equal(marked[0]?.label, 'Wed', 'the 24th is a Wednesday');
});

check('uncategorized completions are grouped, not dropped', () => {
  const at = new Date(2026, 5, 10, 9);
  const summary = summarize('month', [
    event(at, { knowt_id: 'k1' }),
    event(at, { knowt_id: 'k2' }),
    event(at, { knowt_id: 'k2' }),
  ]);
  const total = summary.byCategory.reduce((sum, t) => sum + t.completions, 0);
  assert.equal(total, 3, 'every completion is in a category block');
  assert.equal(summary.byCategory[0]?.name, 'Everything else', 'busiest first');
  assert.equal(summary.byCategory[0]?.completions, 2);
});

console.log(`\n${passed} checks passed.`);
