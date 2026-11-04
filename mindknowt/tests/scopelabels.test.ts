/**
 * The Log's labels naming the span on the toggle.
 *
 * The first tile said "done this month" in every view, Day included.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs scopelabels.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { daysLabel, doneLabel, scopeNoun } = await import(
  `${ROOT}/src/history/periodLabels.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('the tile names the span on the toggle, not the month', () => {
  assert.equal(doneLabel('day', true), 'done today');
  assert.equal(doneLabel('week', true), 'done this week');
  assert.equal(doneLabel('month', true), 'done this month');
});

check('a span that is not the one happening says "that"', () => {
  assert.equal(doneLabel('day', false), 'done that day');
  assert.equal(doneLabel('week', false), 'done that week');
  assert.equal(doneLabel('month', false), 'done that month');
});

check('no label still says month when the view is not Month', () => {
  for (const current of [true, false]) {
    for (const kind of ['day', 'week'] as const) {
      assert.ok(
        !doneLabel(kind, current).includes('month'),
        `${kind} said month`,
      );
    }
  }
});

check('the day count reads as one day, not one days', () => {
  // The Day view counts exactly one, which is where the plural showed.
  assert.equal(daysLabel(1), 'of 1 day');
  assert.equal(daysLabel(0), 'of 0 days');
  assert.equal(daysLabel(7), 'of 7 days');
  assert.equal(daysLabel(31), 'of 31 days');
});

check('the empty state names the span too', () => {
  assert.equal(scopeNoun('day', true), 'today');
  assert.equal(scopeNoun('day', false), 'that day');
  assert.equal(scopeNoun('week', false), 'that week');
  assert.equal(scopeNoun('month', true), 'this month');
});

console.log(`\n${passed} checks passed`);
