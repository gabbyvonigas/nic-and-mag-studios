/**
 * Measurements for the drawn category glyphs.
 *
 * Split out from the component so the shapes can be asserted. The heart was
 * reported as skewed, and the cause is not the proportions: they are symmetric
 * in the abstract and stop being symmetric once they are rounded. At a badge
 * size of fourteen points a lobe is 6.16 points wide and sits at 2.38 from the
 * left, and half a point of independent rounding on a shape ten points across
 * is a visible lean.
 *
 * So everything here is computed in whole points, and the box is derived from
 * the parts rather than the parts being placed inside a box. Symmetry then
 * holds exactly rather than approximately, which is what the tests check.
 */

/** cos 45, for the half diagonal of a square turned on its point. */
const DIAGONAL = Math.SQRT2 / 2;

export type HeartParts = {
  box: { width: number; height: number };
  /** The two round lobes, both this size, both at y 0. */
  lobe: { size: number; radius: number; leftX: number; rightX: number };
  /** The square turned 45 degrees that makes the point at the bottom. */
  wedge: { size: number; x: number; y: number };
};

/**
 * A heart, as two circles and a square on its point.
 *
 * The lobe gap is forced even so the wedge can sit at exactly half of it and
 * land dead center. That one constraint is what keeps the shape from leaning:
 * with an odd gap the wedge is half a point off on every render.
 */
export function heartParts(size: number): HeartParts {
  // Distance between the lobe centers, and twice the wedge's inset.
  const gap = 2 * Math.max(1, Math.round(size * 0.17));
  const lobe = Math.max(2, Math.round(size * 0.44));
  const width = lobe + gap;

  // The wedge is the same square as a lobe, inset by half the gap on each
  // side, so its center sits on the box's center line by construction.
  const inset = gap / 2;
  const centerY = inset + lobe / 2;
  const height = Math.round(centerY + lobe * DIAGONAL);

  return {
    box: { width, height },
    lobe: { size: lobe, radius: lobe / 2, leftX: 0, rightX: gap },
    wedge: { size: lobe, x: inset, y: inset },
  };
}

export type ClockParts = {
  box: number;
  /** The face: a ring, not a filled disc. */
  ring: { size: number; offset: number; border: number };
  /** Both hands meet at the center of the box, and run out from it. */
  hand: {
    minute: { width: number; height: number; x: number; y: number };
    hour: { width: number; height: number; x: number; y: number };
  };
};

/**
 * A plain clock face: a circle with two hands, reading three o'clock.
 *
 * The hands are placed in the outer box rather than inside the ring. Inside
 * it they are positioned against the ring's content box, which the border has
 * already inset, so every coordinate was off by the border width and the hands
 * sat low and left of the middle.
 *
 * No bell, no feet, no second hand. It is a category mark at fourteen points,
 * and an alarm clock at that size is a circle with two bumps on it.
 */
export function clockParts(size: number, stroke: number): ClockParts {
  const border = Math.max(1, Math.round(stroke));
  const ring = Math.max(4, Math.round(size * 0.86));
  const offset = Math.round((size - ring) / 2);

  // The true center of the box, which both hands are anchored to.
  const center = size / 2;
  const minuteLength = Math.max(2, Math.round(ring * 0.3));
  const hourLength = Math.max(2, Math.round(ring * 0.22));

  return {
    box: size,
    ring: { size: ring, offset, border },
    hand: {
      // Straight up from the center.
      minute: {
        width: border,
        height: minuteLength,
        x: Math.round(center - border / 2),
        y: Math.round(center - minuteLength),
      },
      // Straight out to the right from the center.
      hour: {
        width: hourLength,
        height: border,
        x: Math.round(center),
        y: Math.round(center - border / 2),
      },
    },
  };
}
