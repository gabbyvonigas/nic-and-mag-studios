/**
 * The arithmetic behind the progress ring, kept apart from the drawing so it
 * can be asserted off device.
 *
 * The ring is two half discs, each in a clip that reveals only its own side.
 * Sweeping the right half from -180 to 0 fills the first half of the circle
 * clockwise from the top; the left half then does the same for the rest.
 *
 * The first version of this drew the halves as plain rectangles, which is why
 * it rendered as a solid square: a rotated rectangle in a half width clip is a
 * square, not an arc. The half has to be a D shape, flat edge on the ring's
 * center line and round edge outward, which is what `halfRadii` is for.
 */

export type RingAngles = { right: number; left: number };

export function ringAngles(value: number): RingAngles {
  // A clamp alone lets NaN through, and NaN reaches the style as the string
  // "NaNdeg", which is a rendering problem rather than a wrong number.
  const safe = Number.isFinite(value) ? value : 0;
  const progress = Math.max(0, Math.min(1, safe));
  return {
    right: -180 + Math.min(progress, 0.5) * 360,
    left: -180 + Math.max(0, progress - 0.5) * 360,
  };
}

/**
 * Rounding for one half, so it is a semicircle rather than a rectangle. Only
 * the outer edge is rounded; the flat side sits on the ring's center line.
 */
export function halfRadii(
  side: 'left' | 'right',
  size: number,
): {
  borderTopLeftRadius: number;
  borderBottomLeftRadius: number;
  borderTopRightRadius: number;
  borderBottomRightRadius: number;
} {
  const r = size / 2;
  return side === 'right'
    ? {
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderTopRightRadius: r,
        borderBottomRightRadius: r,
      }
    : {
        borderTopLeftRadius: r,
        borderBottomLeftRadius: r,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
      };
}

/**
 * How far to shift before rotating, so each half turns about the ring's center
 * rather than its own. The center lands on the clip's inner edge.
 */
export function rotationShift(side: 'left' | 'right', size: number): number {
  return side === 'right' ? -size / 4 : size / 4;
}
