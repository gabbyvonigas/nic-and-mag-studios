/**
 * The progress ring's geometry, which rendered as a solid square.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs ring.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { halfRadii, ringAngles, rotationShift } = await import(
  `${ROOT}/src/components/ringGeometry.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('each half is a semicircle, which is what the square bug was', () => {
  // A rotated rectangle in a half width clip is a square. Only the outer edge
  // is rounded, so the flat side can sit on the ring's center line.
  const right = halfRadii('right', 64);
  assert.equal(right.borderTopRightRadius, 32);
  assert.equal(right.borderBottomRightRadius, 32);
  assert.equal(right.borderTopLeftRadius, 0);
  assert.equal(right.borderBottomLeftRadius, 0);

  const left = halfRadii('left', 64);
  assert.equal(left.borderTopLeftRadius, 32);
  assert.equal(left.borderBottomLeftRadius, 32);
  assert.equal(left.borderTopRightRadius, 0);
  assert.equal(left.borderBottomRightRadius, 0);
});

check('the rounded edge is always half the ring, whatever the size', () => {
  for (const size of [24, 48, 62, 100]) {
    assert.equal(halfRadii('right', size).borderTopRightRadius, size / 2);
  }
});

check('empty hides both halves outside their clips', () => {
  const { right, left } = ringAngles(0);
  assert.equal(right, -180);
  assert.equal(left, -180);
});

check('half full shows the right side and no more', () => {
  const { right, left } = ringAngles(0.5);
  assert.equal(right, 0, 'the right half has swept fully into view');
  assert.equal(left, -180, 'the left half has not started');
});

check('full shows both', () => {
  const { right, left } = ringAngles(1);
  assert.equal(right, 0);
  assert.equal(left, 0);
});

check('the first half fills clockwise from the top', () => {
  // A quarter should put the right half halfway through its sweep.
  assert.equal(ringAngles(0.25).right, -90);
  assert.equal(ringAngles(0.25).left, -180, 'and the left is still hidden');
  assert.equal(ringAngles(0.75).left, -90);
});

check('the sweep never runs backwards as progress rises', () => {
  let previousRight = -Infinity;
  let previousLeft = -Infinity;
  for (let step = 0; step <= 100; step += 1) {
    const { right, left } = ringAngles(step / 100);
    assert.ok(right >= previousRight, `right went back at ${step}%`);
    assert.ok(left >= previousLeft, `left went back at ${step}%`);
    previousRight = right;
    previousLeft = left;
  }
});

check('nonsense values are clamped rather than drawn', () => {
  assert.deepEqual(ringAngles(-5), ringAngles(0));
  assert.deepEqual(ringAngles(42), ringAngles(1));
  assert.deepEqual(ringAngles(Number.NaN).right, -180, 'NaN reads as empty');
});

check('each half turns about the ring center, not its own', () => {
  // The center sits on the clip's inner edge, a quarter of the width away.
  assert.equal(rotationShift('right', 64), -16);
  assert.equal(rotationShift('left', 64), 16);
});

console.log(`\n${passed} checks passed.`);
