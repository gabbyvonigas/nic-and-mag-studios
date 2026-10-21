/**
 * The Daily progress copy, which is a tone rule as much as a string.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs dayprogress.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const {
  progressCount,
  progressLine,
  stanceFor,
} = await import(
  `${ROOT}/src/knowts/dayProgress.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Words that either scold, or imply a chain that can break. */
const FORBIDDEN = [
  'streak',
  'missed',
  'behind',
  'failed',
  'fail',
  'broke',
  'broken',
  'should',
  'only',
  'just',
  'still',
  'again',
  'keep up',
  'don\'t',
  'lost',
];

function everyLine(): string[] {
  const out: string[] = [];
  for (const stance of ['past', 'today', 'future'] as const) {
    for (let total = 0; total <= 6; total += 1) {
      for (let done = 0; done <= total; done += 1) {
        out.push(progressLine(done, total, stance));
        out.push(progressCount(done, total));
      }
    }
  }
  return out;
}

check('stance is read from the offset, not from a clock', () => {
  assert.equal(stanceFor(-1), 'past');
  assert.equal(stanceFor(0), 'today');
  assert.equal(stanceFor(1), 'future');
  assert.equal(stanceFor(-30), 'past');
});

check('nothing anywhere scolds, or mentions a streak', () => {
  for (const line of everyLine()) {
    const lower = line.toLowerCase();
    for (const word of FORBIDDEN) {
      assert.ok(
        !lower.includes(word),
        `"${line}" contains "${word}"`,
      );
    }
  }
});

check('no line shouts', () => {
  for (const line of everyLine()) {
    assert.ok(!line.includes('!'), `"${line}" has an exclamation mark`);
  }
});

check('the copy changes with the state of the day', () => {
  // The point of the rule: not the same line whether it went well or not.
  const distinct = new Set([
    progressLine(0, 5, 'today'),
    progressLine(1, 5, 'today'),
    progressLine(3, 5, 'today'),
    progressLine(5, 5, 'today'),
  ]);
  assert.equal(distinct.size, 4, 'today should read differently as it fills');
});

check('a past day is reported, not graded', () => {
  assert.equal(progressLine(0, 4, 'past'), 'None of these got picked up.');
  assert.equal(progressLine(4, 4, 'past'), 'All of it got done.');
  // And it never suggests doing something about a day that is over.
  for (let done = 0; done <= 4; done += 1) {
    assert.ok(!progressLine(done, 4, 'past').toLowerCase().includes('ready'));
  }
});

check('an empty day is not a failed one', () => {
  for (const stance of ['past', 'today', 'future'] as const) {
    const line = progressLine(0, 0, stance);
    assert.ok(line.length > 0);
    assert.ok(!line.toLowerCase().includes('nothing done'));
  }
  assert.equal(progressCount(0, 0), 'Nothing scheduled');
});

check('the count agrees with itself, singular and plural', () => {
  assert.equal(progressCount(0, 1), '0 of 1 Knowt complete');
  assert.equal(progressCount(1, 1), '1 of 1 Knowt complete');
  assert.equal(progressCount(3, 5), '3 of 5 Knowts complete');
});

console.log(`\n${passed} checks passed.`);
