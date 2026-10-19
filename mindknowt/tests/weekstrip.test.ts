/**
 * The Daily week strip, and when Upcoming is allowed to appear.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs weekstrip.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { midnight, offsetInDays, shiftWeeks, startOfWeek, weekOf } =
  await import(`${ROOT}/src/knowts/weekStrip.ts`);
const { showUpcoming } = await import(`${ROOT}/src/knowts/dayProgress.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

check('a week is seven days, Sunday first, containing the anchor', () => {
  // A Wednesday.
  const week = weekOf(new Date(2026, 5, 24, 15, 30));
  assert.equal(week.length, 7);
  assert.equal(week[0]!.getDay(), 0);
  assert.equal(week[6]!.getDay(), 6);
  assert.deepEqual(week.map(iso), [
    '2026-06-21',
    '2026-06-22',
    '2026-06-23',
    '2026-06-24',
    '2026-06-25',
    '2026-06-26',
    '2026-06-27',
  ]);
});

check('every day of a week produces that same week', () => {
  const expected = weekOf(new Date(2026, 5, 21)).map(iso);
  for (let day = 21; day <= 27; day += 1) {
    assert.deepEqual(
      weekOf(new Date(2026, 5, day)).map(iso),
      expected,
      `June ${day} should resolve to the same week`,
    );
  }
});

check('the strip is midnight, whatever time of day the anchor is', () => {
  for (const hour of [0, 9, 13, 23]) {
    for (const date of weekOf(new Date(2026, 5, 24, hour, 45, 30, 500))) {
      assert.equal(date.getHours(), 0);
      assert.equal(date.getMinutes(), 0);
      assert.equal(date.getSeconds(), 0);
      assert.equal(date.getMilliseconds(), 0);
    }
  }
});

check('a week that straddles a month end stays contiguous', () => {
  // The week containing June 30 2026 runs into July.
  const week = weekOf(new Date(2026, 5, 30));
  assert.deepEqual(week.map(iso), [
    '2026-06-28',
    '2026-06-29',
    '2026-06-30',
    '2026-07-01',
    '2026-07-02',
    '2026-07-03',
    '2026-07-04',
  ]);

  // And so does one that crosses a year end.
  assert.deepEqual(weekOf(new Date(2026, 11, 31)).map(iso), [
    '2026-12-27',
    '2026-12-28',
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
  ]);
});

check('February in a leap year has no gap', () => {
  const week = weekOf(new Date(2028, 1, 29));
  assert.deepEqual(week.map(iso), [
    '2028-02-27',
    '2028-02-28',
    '2028-02-29',
    '2028-03-01',
    '2028-03-02',
    '2028-03-03',
    '2028-03-04',
  ]);
});

check('stepping a week keeps the weekday column', () => {
  const wednesday = new Date(2026, 5, 24);

  const back = shiftWeeks(wednesday, -1);
  assert.equal(back.getDay(), wednesday.getDay(), 'still a Wednesday');
  assert.equal(iso(back), '2026-06-17');

  const forward = shiftWeeks(wednesday, 1);
  assert.equal(forward.getDay(), wednesday.getDay());
  assert.equal(iso(forward), '2026-07-01', 'and it crosses the month');

  // Stepping back then forward returns to where it started, which is the
  // property that makes the arrows safe to hold down.
  assert.equal(iso(shiftWeeks(shiftWeeks(wednesday, -1), 1)), iso(wednesday));
  assert.equal(iso(shiftWeeks(wednesday, 0)), iso(wednesday));
});

check('stepping lands in the adjacent week, never the same one', () => {
  const anchor = new Date(2026, 5, 24);
  const thisWeek = weekOf(anchor).map(iso);
  const prev = weekOf(shiftWeeks(anchor, -1)).map(iso);
  const next = weekOf(shiftWeeks(anchor, 1)).map(iso);

  for (const day of prev) assert.ok(!thisWeek.includes(day));
  for (const day of next) assert.ok(!thisWeek.includes(day));
  assert.equal(prev[6], '2026-06-20', 'the previous week ends the day before');
  assert.equal(next[0], '2026-06-28', 'the next one starts the day after');
});

check('stepping many weeks stays on the weekday', () => {
  let cursor = new Date(2026, 0, 7); // A Wednesday.
  for (let step = 0; step < 60; step += 1) {
    cursor = shiftWeeks(cursor, 1);
    assert.equal(cursor.getDay(), 3, `step ${step} left the column`);
    assert.equal(iso(startOfWeek(cursor)), iso(weekOf(cursor)[0]!));
  }
});

check('the offset from today reads as whole days', () => {
  const now = new Date(2026, 5, 24, 23, 55);
  assert.equal(offsetInDays(new Date(2026, 5, 24, 0, 5), now), 0);
  assert.equal(offsetInDays(new Date(2026, 5, 23, 23, 59), now), -1);
  assert.equal(offsetInDays(new Date(2026, 5, 25, 0, 1), now), 1);
  assert.equal(offsetInDays(shiftWeeks(now, -1), now), -7);
  assert.equal(offsetInDays(shiftWeeks(now, 1), now), 7);
  assert.equal(midnight(now).getHours(), 0);
});

// The Upcoming section.

const upcoming = (over: Record<string, unknown> = {}) =>
  showUpcoming({
    total: 3,
    stance: 'today',
    upcomingCount: 2,
    ...over,
  } as never);

check('Upcoming shows on today whether or not the day is clear', () => {
  // It used to require remaining === 0, which is what made the section look
  // deleted: on any day with something still to do it never rendered.
  assert.equal(upcoming(), true);
  assert.equal(upcoming({ upcomingCount: 1 }), true);
});

check('Upcoming is absent when there is nothing coming', () => {
  assert.equal(upcoming({ upcomingCount: 0 }), false);
});

check('Upcoming stays off on any day but today', () => {
  assert.equal(upcoming({ stance: 'past' }), false);
  assert.equal(upcoming({ stance: 'future' }), false);
});

check('an empty day gets the invitation, not a look ahead', () => {
  // Nothing scheduled is not the same state as everything done, and showing
  // tomorrow here would bury the "Add a knowt" action.
  assert.equal(upcoming({ total: 0 }), false);
  assert.equal(upcoming({ total: 0, upcomingCount: 5 }), false);
});

check('nothing ahead means no empty section', () => {
  assert.equal(upcoming({ upcomingCount: 0 }), false);
  assert.equal(upcoming({ upcomingCount: 1 }), true);
});

console.log(`\n${passed} checks passed`);
