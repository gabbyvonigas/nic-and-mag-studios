/**
 * The drawn glyphs: that the heart is symmetric and the clock is centered.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs glyph.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { clockParts, heartParts } = await import(
  `${ROOT}/src/components/glyphGeometry.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const DIAGONAL = Math.SQRT2 / 2;
/** The sizes CategoryIcon actually asks for: badge 22, 26, 28 and 30 at 0.62. */
const REAL_SIZES = [22, 24, 26, 28, 30, 34].map((b) => b * 0.62);

// The heart.

check('the heart is exactly symmetric, not nearly', () => {
  // This is the whole bug. The proportions were already symmetric; rounding
  // each of them on its own is what made the shape lean.
  for (const size of REAL_SIZES) {
    const h = heartParts(size);
    const leftEdge = h.lobe.leftX;
    const rightEdge = h.box.width - (h.lobe.rightX + h.lobe.size);
    assert.equal(leftEdge, rightEdge, `lobes uneven at ${size}`);

    const wedgeLeft = h.wedge.x;
    const wedgeRight = h.box.width - (h.wedge.x + h.wedge.size);
    assert.equal(wedgeLeft, wedgeRight, `wedge off center at ${size}`);
  }
});

check('the wedge center sits on the box center line', () => {
  for (const size of REAL_SIZES) {
    const h = heartParts(size);
    assert.equal(
      h.wedge.x + h.wedge.size / 2,
      h.box.width / 2,
      `at ${size}`,
    );
  }
});

check('every measurement is a whole point', () => {
  // Half a point on a shape ten points across is a visible lean.
  for (const size of REAL_SIZES) {
    const h = heartParts(size);
    for (const value of [
      h.box.width,
      h.box.height,
      h.lobe.size,
      h.lobe.leftX,
      h.lobe.rightX,
      h.wedge.size,
      h.wedge.x,
      h.wedge.y,
    ]) {
      assert.ok(Number.isInteger(value), `${value} at ${size} is not whole`);
    }
  }
});

check('the lobes overlap rather than sitting apart', () => {
  // Two circles that do not meet are two circles, not a heart.
  for (const size of REAL_SIZES) {
    const h = heartParts(size);
    const gap = h.lobe.rightX - h.lobe.leftX;
    assert.ok(gap < h.lobe.size, `lobes do not touch at ${size}`);
    assert.ok(gap > 0, `lobes are on top of each other at ${size}`);
  }
});

check('the point reaches the bottom of the box and does not spill out', () => {
  for (const size of REAL_SIZES) {
    const h = heartParts(size);
    const tip = h.wedge.y + h.wedge.size / 2 + h.wedge.size * DIAGONAL;
    // Rounded to a whole point, so within half of one either way.
    assert.ok(
      Math.abs(tip - h.box.height) <= 0.5,
      `point at ${tip} against a box of ${h.box.height} at ${size}`,
    );
  }
});

check('the wedge apex meets the notch between the lobes', () => {
  // If the apex sits above where the circles cross, the heart grows a spike
  // out of the dip. If it sits below, the dip has a notch cut through it.
  for (const size of REAL_SIZES) {
    const h = heartParts(size);
    const apex = h.wedge.y + h.wedge.size / 2 - h.wedge.size * DIAGONAL;

    // Where the two circles cross, on the box center line.
    const r = h.lobe.radius;
    const dx = h.box.width / 2 - (h.lobe.leftX + r);
    const notch = r - Math.sqrt(Math.max(0, r * r - dx * dx));

    assert.ok(
      Math.abs(apex - notch) <= 1,
      `apex ${apex.toFixed(2)} against notch ${notch.toFixed(2)} at ${size}`,
    );
  }
});

check('a heart is wider than it is tall', () => {
  for (const size of REAL_SIZES) {
    const h = heartParts(size);
    assert.ok(h.box.width > h.box.height, `at ${size}`);
  }
});

check('a very small heart still has parts rather than collapsing', () => {
  for (const size of [4, 6, 8]) {
    const h = heartParts(size);
    assert.ok(h.lobe.size >= 2, `lobe vanished at ${size}`);
    assert.ok(h.box.width > 0 && h.box.height > 0);
  }
});

// The clock.

check('the hands meet at the center of the box, not the ring', () => {
  // They used to be positioned inside the ring, whose border had already
  // inset the content box, so both sat low and left of the middle.
  for (const size of REAL_SIZES) {
    const stroke = Math.max(1.5, size * 0.14);
    const c = clockParts(size, stroke);
    const center = c.box / 2;

    // The minute hand runs up from the center.
    assert.ok(
      Math.abs(c.hand.minute.x + c.hand.minute.width / 2 - center) <= 0.5,
      `minute hand off the center line at ${size}`,
    );
    assert.ok(
      Math.abs(c.hand.minute.y + c.hand.minute.height - center) <= 0.5,
      `minute hand does not reach the center at ${size}`,
    );

    // The hour hand runs out to the right from it.
    assert.ok(
      Math.abs(c.hand.hour.x - center) <= 0.5,
      `hour hand does not start at the center at ${size}`,
    );
    assert.ok(
      Math.abs(c.hand.hour.y + c.hand.hour.height / 2 - center) <= 0.5,
      `hour hand off the center line at ${size}`,
    );
  }
});

check('the ring is centered in the box', () => {
  for (const size of REAL_SIZES) {
    const c = clockParts(size, 2);
    const right = c.box - (c.ring.offset + c.ring.size);
    assert.ok(
      Math.abs(c.ring.offset - right) <= 1,
      `ring off center at ${size}`,
    );
  }
});

check('both hands stay inside the face', () => {
  // A hand that runs past the ring is not a clock, it is a compass.
  for (const size of REAL_SIZES) {
    const stroke = Math.max(1.5, size * 0.14);
    const c = clockParts(size, stroke);
    const radius = c.ring.size / 2;
    assert.ok(c.hand.minute.height < radius, `minute hand too long at ${size}`);
    assert.ok(c.hand.hour.width < radius, `hour hand too long at ${size}`);
  }
});

check('the hands are different lengths, so the face reads as a time', () => {
  for (const size of REAL_SIZES) {
    const c = clockParts(size, 2);
    assert.notEqual(
      c.hand.minute.height,
      c.hand.hour.width,
      `two equal hands at ${size}`,
    );
    assert.ok(c.hand.minute.height > c.hand.hour.width, 'minute hand is longer');
  }
});

check('it is a ring rather than a filled disc', () => {
  for (const size of REAL_SIZES) {
    const c = clockParts(size, Math.max(1.5, size * 0.14));
    assert.ok(c.ring.border >= 1);
    assert.ok(
      c.ring.border < c.ring.size / 2,
      `the border closed the face at ${size}`,
    );
  }
});

check('a tiny clock still draws something', () => {
  for (const size of [4, 6, 8]) {
    const c = clockParts(size, 1);
    assert.ok(c.ring.size >= 4);
    assert.ok(c.hand.minute.height >= 2);
    assert.ok(c.hand.hour.width >= 2);
  }
});

console.log(`\n${passed} checks passed`);
