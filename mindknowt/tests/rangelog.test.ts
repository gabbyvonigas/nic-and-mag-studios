/**
 * The Log's numbers, for Day, Week and Month, against one fixture.
 *
 * The bug this covers: the cards were computed by a month shaped function and
 * rendered only when the toggle said Month, so Day and Week were a different,
 * smaller screen. One function answers all three now, and these assertions
 * hold it to that.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs rangelog.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { summarizeRange } = await import(`${ROOT}/src/history/range.ts`);
const { rangeFor } = await import(`${ROOT}/src/history/period.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// Thursday, October 8 2026 is "today" throughout.
const TODAY = new Date(2026, 9, 8, 18, 0);
const at = (day: number, h: number, m = 0) =>
  new Date(2026, 9, day, h, m).getTime();

const HOME = { id: 'c-home', key: 'home', name: 'Home', color: '#FF4D3D', icon: 'house', is_custom: 0, sort: 0 } as never;
const CARE = { id: 'c-care', key: 'care', name: 'Wellness', color: '#24C2B5', icon: 'heart', is_custom: 0, sort: 1 } as never;
const CATEGORIES = [HOME, CARE];

const KNOWTS = [
  { id: 'k1', name: 'Vitamins', category_id: 'c-care' },
  { id: 'k2', name: 'Bins', category_id: 'c-home' },
  { id: 'k3', name: 'Walk', category_id: null },
] as never[];

let seq = 0;
const ev = (over: Record<string, unknown>) =>
  ({
    id: `e${(seq += 1)}`, knowt_id: 'k1', schedule_id: 's1',
    fired_at: null, completed_at: null, method: 'tap', note: null,
    snooze_count: 0, ...over,
  }) as never;

/**
 * Six completions and two misses, spread so each span sees a different slice:
 *   Oct 8 (today):   Vitamins scanned, Bins tapped, Walk overridden
 *   Oct 6 (Tuesday): Vitamins scanned
 *   Oct 2 (last wk): Bins tapped, Vitamins tapped
 * plus a miss on Oct 8 and a miss on Oct 2.
 */
const EVENTS = [
  ev({ knowt_id: 'k1', completed_at: at(8, 9), fired_at: at(8, 9) - 4 * 60_000, method: 'scan', snooze_count: 1 }),
  ev({ knowt_id: 'k2', completed_at: at(8, 12), method: 'tap' }),
  ev({ knowt_id: 'k3', completed_at: at(8, 17), fired_at: at(8, 17) - 20 * 60_000, method: 'override', snooze_count: 2 }),
  ev({ knowt_id: 'k1', completed_at: at(6, 9), method: 'scan' }),
  ev({ knowt_id: 'k2', completed_at: at(2, 19), method: 'tap' }),
  ev({ knowt_id: 'k1', completed_at: at(2, 9), method: 'tap' }),
  ev({ knowt_id: 'k2', fired_at: at(8, 19), method: 'missed' }),
  ev({ knowt_id: 'k1', fired_at: at(2, 8), method: 'missed' }),
];

const summarize = (kind: 'day' | 'week' | 'month') =>
  summarizeRange({
    range: rangeFor(kind, TODAY),
    knowts: KNOWTS,
    categories: CATEGORIES,
    events: EVENTS,
    today: TODAY,
  });

const DAY = summarize('day');
const WEEK = summarize('week');
const MONTH = summarize('month');

check('every view produces every card, with no field left undefined', () => {
  // The cards are driven by these fields. A view missing one is a view that
  // renders a smaller screen, which is exactly what was wrong.
  const fields = [
    'completions', 'missed', 'rate', 'byMethod', 'activeDays', 'daysElapsed',
    'daysInRange', 'snoozes', 'medianResponseMinutes', 'mostSnoozed', 'days',
    'completedItems',
  ];
  for (const [name, summary] of [['day', DAY], ['week', WEEK], ['month', MONTH]] as const) {
    for (const field of fields) {
      assert.ok(field in summary, `${name} has no ${field}`);
      assert.notEqual((summary as never)[field], undefined, `${name}.${field} is undefined`);
    }
  }
});

check('the day counts only that day', () => {
  assert.equal(DAY.completions, 3);
  assert.equal(DAY.missed, 1);
  assert.deepEqual(DAY.byMethod, { scan: 1, tap: 1, override: 1 });
  assert.equal(DAY.rate, 3 / 4);
  assert.equal(DAY.activeDays, 1);
  assert.equal(DAY.daysInRange, 1);
  assert.equal(DAY.snoozes, 3);
});

check('the week counts Sunday to Saturday around that day', () => {
  // October 8 2026 is a Thursday, so the week is the 4th to the 10th: the
  // three on the 8th plus the one on the 6th. The 2nd is the week before.
  assert.equal(WEEK.completions, 4);
  assert.equal(WEEK.missed, 1);
  assert.deepEqual(WEEK.byMethod, { scan: 2, tap: 1, override: 1 });
  assert.equal(WEEK.activeDays, 2);
  assert.equal(WEEK.daysInRange, 7);
});

check('the month counts all of it', () => {
  assert.equal(MONTH.completions, 6);
  assert.equal(MONTH.missed, 2);
  assert.deepEqual(MONTH.byMethod, { scan: 2, tap: 3, override: 1 });
  assert.equal(MONTH.activeDays, 3);
  assert.equal(MONTH.daysInRange, 31);
  assert.equal(MONTH.rate, 6 / 8);
});

check('the spans nest, so a wider one never counts less', () => {
  assert.ok(DAY.completions <= WEEK.completions);
  assert.ok(WEEK.completions <= MONTH.completions);
  assert.ok(DAY.activeDays <= WEEK.activeDays);
  assert.ok(WEEK.activeDays <= MONTH.activeDays);
});

check('the completed list is grouped by day, newest first', () => {
  assert.deepEqual(MONTH.days.map((d: { iso: string }) => d.iso), [
    '2026-10-08', '2026-10-06', '2026-10-02',
  ]);
  assert.deepEqual(
    MONTH.days[0].items.map((i: { knowtName: string }) => i.knowtName),
    ['Walk', 'Bins', 'Vitamins'],
  );
  // One day on Day, and the heading is the thing the toggle already says.
  assert.equal(DAY.days.length, 1);
});

check('a completion carries its name, time, method and category color', () => {
  const vitamins = DAY.days[0].items.find(
    (i: { knowtName: string }) => i.knowtName === 'Vitamins',
  );
  assert.equal(vitamins.method, 'scan');
  assert.equal(vitamins.completedAt, at(8, 9));
  assert.equal(vitamins.category.color, '#24C2B5');

  // A Knowt with no category still renders; the row falls back to a neutral.
  const walk = DAY.days[0].items.find(
    (i: { knowtName: string }) => i.knowtName === 'Walk',
  );
  assert.equal(walk.category, null);
});

check('a deleted Knowt keeps its completion under a plain name', () => {
  const orphan = summarizeRange({
    range: rangeFor('day', TODAY),
    knowts: [],
    categories: CATEGORIES,
    events: [ev({ knowt_id: 'gone', completed_at: at(8, 10), method: 'tap' })],
    today: TODAY,
  });
  assert.equal(orphan.completions, 1);
  assert.equal(orphan.days[0].items[0].knowtName, 'Deleted Knowt');
});

check('misses are counted but never listed as completions', () => {
  assert.equal(MONTH.completedItems.length, MONTH.completions);
  assert.ok(
    MONTH.completedItems.every((i: { method: string }) => i.method !== 'missed'),
  );
});

check('a span with nothing in it reports zero rather than throwing', () => {
  const empty = summarizeRange({
    range: rangeFor('day', new Date(2026, 0, 1)),
    knowts: KNOWTS, categories: CATEGORIES, events: EVENTS,
    today: TODAY,
  });
  assert.equal(empty.completions, 0);
  assert.equal(empty.missed, 0);
  assert.equal(empty.rate, null);
  assert.equal(empty.medianResponseMinutes, null);
  assert.deepEqual(empty.days, []);
});

check('the response time is the median of what actually rang', () => {
  // Two rang today: 4 minutes and 20 minutes. Nothing else has a fired_at.
  assert.equal(DAY.medianResponseMinutes, 12);
});

check('what gets put off most is ranked, busiest first', () => {
  assert.equal(DAY.mostSnoozed[0].name, 'Walk');
  assert.equal(DAY.mostSnoozed[0].snoozes, 2);
  assert.equal(DAY.mostSnoozed[1].name, 'Vitamins');
});

console.log(`\n${passed} checks passed`);
