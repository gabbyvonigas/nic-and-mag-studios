/**
 * Filtering the Knowts list, including the two gap filters the Log cards
 * navigate into, and which bar the trend chart paints lime.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs knowtfilter.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { applyFilter, countWithoutSchedule, countWithoutTag, filterLabel } =
  await import(`${ROOT}/src/knowts/knowtFilter.ts`);
const { trendTone } = await import(`${ROOT}/src/history/trendTone.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

let seq = 0;
function schedule(over: Record<string, unknown> = {}) {
  seq += 1;
  return { id: `s${seq}`, knowt_id: 'k', time: '08:00', enabled: 1, ...over };
}

function knowt(
  name: string,
  over: Record<string, unknown> = {},
): never {
  seq += 1;
  return {
    id: `k${seq}`,
    name,
    tag_uid: null,
    category: null,
    schedules: [],
    ...over,
  } as never;
}

const CAT_HOME = { id: 'c_home', name: 'Home' };

const KNOWTS = [
  knowt('Vitamins', { tag_uid: 'aa', schedules: [schedule()], category: CAT_HOME }),
  knowt('Trash out', { tag_uid: null, schedules: [schedule()] }),
  knowt('Air filter', { tag_uid: 'bb', schedules: [], category: CAT_HOME }),
  knowt('Spice restock', { tag_uid: null, schedules: [] }),
] as never[];

const names = (list: { name: string }[]) => list.map((k) => k.name).sort();

check('all is everything, in the order it arrived', () => {
  const out = applyFilter(KNOWTS, { kind: 'all' } as never);
  assert.equal(out.length, 4);
  assert.deepEqual(
    out.map((k: { name: string }) => k.name),
    ['Vitamins', 'Trash out', 'Air filter', 'Spice restock'],
    'filtering must not reorder',
  );
});

check('a category filter keeps only that category', () => {
  const out = applyFilter(
    KNOWTS,
    { kind: 'category', categoryId: 'c_home' } as never,
  );
  assert.deepEqual(names(out), ['Air filter', 'Vitamins']);
});

check('a category that matches nothing is empty, not everything', () => {
  // The failure that matters: an unknown id falling through to "no filter"
  // and showing the whole list as if it were one category.
  const out = applyFilter(
    KNOWTS,
    { kind: 'category', categoryId: 'c_nope' } as never,
  );
  assert.deepEqual(out, []);
});

// The two gap filters.

check('no-schedule keeps exactly the knowts with none', () => {
  const out = applyFilter(KNOWTS, { kind: 'no-schedule' } as never);
  assert.deepEqual(names(out), ['Air filter', 'Spice restock']);
  assert.equal(countWithoutSchedule(KNOWTS), 2);
});

check('a schedule that is turned off is not a schedule', () => {
  // It exists as a row but it will never ring, which is the thing the card is
  // pointing at. Counting it would send someone to a knowt that looks set up.
  const off = [
    knowt('Bins', { schedules: [schedule({ enabled: 0 })] }),
    knowt('Pills', { schedules: [schedule({ enabled: 1 })] }),
  ] as never[];
  assert.deepEqual(names(applyFilter(off, { kind: 'no-schedule' } as never)), [
    'Bins',
  ]);
  assert.equal(countWithoutSchedule(off), 1);
});

check('one live schedule among dead ones still counts as scheduled', () => {
  const mixed = [
    knowt('Vitamins', {
      schedules: [schedule({ enabled: 0 }), schedule({ enabled: 1 })],
    }),
  ] as never[];
  assert.deepEqual(applyFilter(mixed, { kind: 'no-schedule' } as never), []);
  assert.equal(countWithoutSchedule(mixed), 0);
});

check('no-tag keeps exactly the knowts with no tag attached', () => {
  const out = applyFilter(KNOWTS, { kind: 'no-tag' } as never);
  assert.deepEqual(names(out), ['Spice restock', 'Trash out']);
  assert.equal(countWithoutTag(KNOWTS), 2);
});

check('an empty tag string is not a tag', () => {
  // A blank uid is what a cleared tag leaves behind, and it is not a tag.
  const blank = [
    knowt('Bins', { tag_uid: '' }),
    knowt('Pills', { tag_uid: 'cc' }),
  ] as never[];
  assert.deepEqual(names(applyFilter(blank, { kind: 'no-tag' } as never)), [
    'Bins',
  ]);
  assert.equal(countWithoutTag(blank), 1);
});

check('the two gap counts are independent of each other', () => {
  // Air filter has a tag and no schedule; Trash out has a schedule and no tag.
  // A card that counted "incomplete" as one thing would report both as three.
  assert.equal(countWithoutSchedule(KNOWTS), 2);
  assert.equal(countWithoutTag(KNOWTS), 2);
  const both = applyFilter(KNOWTS, { kind: 'no-schedule' } as never).filter(
    (k: { tag_uid: string | null }) => !k.tag_uid,
  );
  assert.deepEqual(names(both), ['Spice restock']);
});

check('an empty list gives empty counts rather than throwing', () => {
  assert.equal(countWithoutSchedule([] as never[]), 0);
  assert.equal(countWithoutTag([] as never[]), 0);
  assert.deepEqual(applyFilter([] as never[], { kind: 'no-schedule' } as never), []);
});

check('each filter names itself for the chip and the empty state', () => {
  const cats = [CAT_HOME] as never[];
  assert.equal(filterLabel({ kind: 'all' } as never, cats), 'All');
  assert.equal(
    filterLabel({ kind: 'category', categoryId: 'c_home' } as never, cats),
    'Home',
  );
  assert.equal(
    filterLabel({ kind: 'no-schedule' } as never, cats),
    'No schedule',
  );
  assert.equal(filterLabel({ kind: 'no-tag' } as never, cats), 'No tag');
  // A category that has since been deleted still needs a name to render.
  assert.equal(
    filterLabel({ kind: 'category', categoryId: 'gone' } as never, cats),
    'All',
  );
});

// Which bar the trend chart paints.

check('today is the only bar that is lime', () => {
  // Color marks which day is today. It says nothing about how much got done,
  // so the tallest bar is not the colored one unless it happens to be today.
  const bars = [
    { label: 'Mon', completions: 9, current: false },
    { label: 'Tue', completions: 0, current: false },
    { label: 'Wed', completions: 2, current: true },
  ] as never[];
  assert.deepEqual(
    bars.map((b: never) => trendTone(b)),
    ['other', 'other', 'today'],
  );
});

check('a busy day that is not today is still gray', () => {
  assert.equal(
    trendTone({ label: 'Mon', completions: 40, current: false } as never),
    'other',
  );
});

check('an empty today is still lime', () => {
  // Today is today whether or not anything has happened yet, and a day with
  // nothing done is not a day to gray out.
  assert.equal(
    trendTone({ label: 'Wed', completions: 0, current: true } as never),
    'today',
  );
});

check('a period with no today has no lime bar at all', () => {
  const bars = [
    { label: 'Mon', completions: 3, current: false },
    { label: 'Tue', completions: 5, current: false },
  ] as never[];
  assert.equal(bars.filter((b: never) => trendTone(b) === 'today').length, 0);
});

console.log(`\n${passed} checks passed`);
