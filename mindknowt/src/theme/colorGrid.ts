/**
 * The swatches offered when someone picks a category color.
 *
 * A real color picker means a gesture-driven hue wheel or a third party
 * dependency, and neither is in this project. A generated grid gets to the
 * same place for this purpose: enough of the spectrum that a category can be
 * made to look like whatever someone has in mind, without a control nobody can
 * hit accurately at phone size.
 *
 * Free of imports on purpose, like `categoryColors.ts`, so the grid can be
 * asserted off device. Every swatch has to survive `shadesFromHex`, which
 * darkens it by 42 percent for label text, and a swatch whose ink is
 * unreadable is a category whose name cannot be read.
 */

/** Evenly spaced around the wheel, starting at red. */
const HUES = [0, 20, 40, 60, 90, 140, 170, 195, 215, 250, 280, 320];

/**
 * Three rows: a deep one, the vivid middle the shipped categories live in, and
 * a soft one. Saturation stays high across all three, because the one thing
 * the palette is not allowed to offer is the muted set that was rejected on
 * device.
 */
const LEVELS = [
  { saturation: 0.72, lightness: 0.36 },
  { saturation: 0.82, lightness: 0.52 },
  { saturation: 0.7, lightness: 0.66 },
];

function toHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n * 255)))
    .toString(16)
    .padStart(2, '0');
}

/** Standard HSL to RGB. Hue in degrees, the rest 0 to 1. */
export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  const [r, g, b] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];

  const m = l - c / 2;
  return `#${toHex(r + m)}${toHex(g + m)}${toHex(b + m)}`.toUpperCase();
}

/**
 * The grid, as rows of swatches.
 *
 * Grays are the last row rather than a hue, because a category that is
 * deliberately quiet is a real choice and there is no hue that gives it.
 */
export function swatchGrid(): string[][] {
  const rows = LEVELS.map((level) =>
    HUES.map((hue) => hslToHex(hue, level.saturation, level.lightness)),
  );

  rows.push(
    [0.24, 0.36, 0.46, 0.56, 0.66].map((l) => hslToHex(215, 0.08, l)),
  );

  return rows;
}

/** Every swatch, flattened, for membership checks. */
export function allSwatches(): string[] {
  return swatchGrid().flat();
}
