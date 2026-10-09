/**
 * Where ink sits inside a glyph, so a brand mark and an Ionicon can be made
 * the same height and sat on the same line.
 *
 * Every number here was measured, not guessed, and the test file repeats the
 * measurement against the real font and the real asset. Without them the mark
 * and the alarm were nominally the same size and visibly were not: the mark
 * floated above the text it sat beside and read thinner than the glyph next
 * to it, because `size` means the em box and the two fill their boxes
 * differently.
 *
 * A `.ts` file with no JSX on purpose: the off-device runner cannot import a
 * `.tsx`, and these constants are the part worth asserting.
 */

/** Ionicons, measured off `Ionicons.ttf` at 512 units per em. */
export const IONICON = {
  /**
   * Outline stroke over the em box. `alarm-outline` and `time-outline` both
   * measure 32 units, which is the 6.25 percent the set is drawn to.
   */
  stroke: 32 / 512,
  /**
   * Ink height over the em box, from `alarm-outline`, which is the glyph the
   * mark is paired with. Glyphs vary a little: the clock is 416.
   */
  ink: 386 / 512,
  /**
   * Ink bottom against the baseline. `alarm-outline` ends exactly on it, so
   * an Ionicon in a `baseline` row needs no nudging to sit on the same line
   * as the text or as a mark beside it.
   */
  inkBottom: 0,
} as const;

/**
 * The tag mark's ink inside its square canvas, measured from the PNG.
 *
 * Both assets carry identical ink: the heavy one is the same artwork grown
 * and then scaled back into the same box, so one set of numbers places both.
 */
export const MARK = {
  canvas: 512,
  /** Ink height over the canvas. */
  ink: 463 / 512,
  /** Ink width over its height, for a box that hugs the drawing. */
  aspect: 393 / 463,
  /** Padding below and left of the ink, over the canvas. */
  padBottom: 25 / 512,
  padLeft: 59 / 512,
  /** Stroke over the canvas, before and after the heavier variant. */
  strokeLight: 22 / 512,
  strokeHeavy: 32 / 512,
} as const;

/**
 * Under this the heavier variant is used.
 *
 * The light mark is drawn at about two thirds of an Ionicon's stroke, which
 * is invisible as a hairline at 24 points and up and reads as a lighter,
 * thinner icon below that, next to glyphs that do not change.
 */
export const HEAVY_BELOW = 24;

/**
 * Bands over the font size, for sizing a glyph against the text beside it.
 *
 * SF Pro's cap height is about 0.70 em and the lowercase ascenders of b, l
 * and k reach about 0.73. Approximate on purpose: the family is reached
 * through a private name and cannot be measured here, and being a point out
 * at 16 point costs nothing, while being a third too tall is what the mark
 * looked like before.
 */
export const BAND = {
  /** Baseline to the top of b, l and k. For a glyph beside a name. */
  ascender: 0.73,
  /** Baseline to the top of A, B and K. */
  cap: 0.7,
  /** A chip's glyph: cap height and a little, never taller than its word. */
  chip: 0.78,
} as const;

/**
 * The line box iOS gives the rounded family, over the font size.
 *
 * Used to check that a chip's glyph cannot make the chip taller than its
 * text already makes it, which is the whole of why the Tagged chip stood
 * above the others.
 */
export const LINE_BOX = 1.2;

/** Rounded to a half point, which is a whole pixel at 2x and 3x. */
function half(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * The `size` an icon needs so its ink is `band` of `fontSize` tall.
 *
 * Works for an Ionicon and for a brand mark alike, because `Icon` draws both
 * to the same ink height for a given size.
 */
export function iconSizeForText(
  fontSize: number,
  band: number = BAND.ascender,
): number {
  return half((fontSize * band) / IONICON.ink);
}

/** How tall the ink is at a given size, which is what the eye compares. */
export function inkHeight(size: number): number {
  return size * IONICON.ink;
}

/** How thick an Ionicon's stroke is at a given size. */
export function ioniconStroke(size: number): number {
  return size * IONICON.stroke;
}

/**
 * How thick the mark's stroke is at a given size, drawn to the same ink
 * height as an Ionicon of that size.
 */
export function markStroke(size: number, heavy: boolean): number {
  const stroke = heavy ? MARK.strokeHeavy : MARK.strokeLight;
  return (inkHeight(size) / MARK.ink) * stroke;
}

/**
 * How the mark's image is placed to put its ink in the band.
 *
 * The box hugs the ink, so a row's gap is measured from the drawing rather
 * than from the canvas padding around it, and the box's bottom edge is the
 * ink's bottom edge, which is what makes `alignItems: 'baseline'` land it on
 * the text baseline with no nudging.
 */
export function markLayout(size: number): {
  width: number;
  height: number;
  image: number;
  left: number;
  bottom: number;
} {
  const height = inkHeight(size);
  const image = height / MARK.ink;
  return {
    width: height * MARK.aspect,
    height,
    image,
    left: -MARK.padLeft * image,
    bottom: -MARK.padBottom * image,
  };
}
