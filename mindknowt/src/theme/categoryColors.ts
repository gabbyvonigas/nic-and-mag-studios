/**
 * Category swatches, spec section 4.1.
 *
 * `CATEGORY_COLORS` is persisted into `categories.color`, so it is data as much
 * as styling. `CATEGORY_INK` and `CATEGORY_FILL` are derived shades used for
 * text and chips on a white card, where the swatch alone either fails contrast
 * or shouts. They are not stored.
 *
 * Deliberately free of imports, like `categoryKeys.ts`, so the migration that
 * back-fills these can be tested without the React Native runtime.
 */

/** The swatch. Muted but distinct, chosen to sit on white. */
export const CATEGORY_COLORS = {
  home: '#C06A4C',
  daily: '#C4972C',
  care: '#AE7B92',
  ritual: '#7C8A4E',
  go: '#5F8FB4',
  admin: '#96897C',
} as const;

/** Darkened for label text and icons on white. */
export const CATEGORY_INK = {
  home: '#8E4830',
  daily: '#856312',
  care: '#7E5568',
  ritual: '#556036',
  go: '#3E6685',
  admin: '#6B6157',
} as const;

/** Barely-there fill for chips and completed cards. */
export const CATEGORY_FILL = {
  home: '#F9EDE8',
  daily: '#FBF3E1',
  care: '#F7EEF2',
  ritual: '#F1F3E9',
  go: '#EBF2F8',
  admin: '#F4F2EF',
} as const;

/**
 * How a knowt was finished. Deliberately outside the category palette: these
 * are not categories, and borrowing a category colour for them would make the
 * Summary look like it was reporting on Home or Care.
 *
 * Scan is the intended path, tap is fine but untagged, override is the one
 * worth noticing if it climbs.
 */
export const METHOD_COLORS = {
  scan: '#5E8F6E',
  tap: '#5F7FB4',
  override: '#C08A3E',
} as const;

/** Used for custom categories, which have no key and so no shipped shades. */
export const CATEGORY_FALLBACK = {
  color: '#8A8F98',
  ink: '#5A6069',
  fill: '#F1F2F4',
} as const;

/**
 * Swatches offered when someone makes their own category. Same muted register
 * as the shipped six so a custom category does not shout next to them, but
 * deliberately different hues so it stays distinguishable.
 */
export const CUSTOM_PALETTE = [
  '#C0674A',
  '#B5793A',
  '#8C8F3F',
  '#5E8F6E',
  '#4F8A93',
  '#5F7FB4',
  '#7A6FA8',
  '#A96A8C',
  '#8C7F72',
  '#6B7280',
] as const;

export type CategoryShades = {
  /** The swatch itself, for accent bars and dots. */
  color: string;
  /** Darkened, for label text and icons on white. */
  ink: string;
  /** Barely-there fill, for chips and completed cards. */
  fill: string;
};

/** Parses `#rrggbb`. Returns null for anything else rather than guessing. */
function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1] as string, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  const part = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function mix(
  rgb: [number, number, number],
  towards: [number, number, number],
  amount: number,
): string {
  return toHex([
    rgb[0] + (towards[0] - rgb[0]) * amount,
    rgb[1] + (towards[1] - rgb[1]) * amount,
    rgb[2] + (towards[2] - rgb[2]) * amount,
  ]);
}

/**
 * Derives the ink and fill for a colour the app did not choose.
 *
 * The shipped six have hand-picked shades because they are the brand. A
 * category someone makes themselves cannot, so its shades are mixed towards
 * black and white. Close enough to stay legible, and it means a custom
 * category renders in its own colour instead of falling back to grey.
 */
export function shadesFromHex(hex: string): CategoryShades {
  const rgb = parseHex(hex);
  if (!rgb) return { ...CATEGORY_FALLBACK };
  return {
    color: toHex(rgb),
    ink: mix(rgb, [0, 0, 0], 0.42),
    fill: mix(rgb, [255, 255, 255], 0.88),
  };
}

/**
 * Shades for one category. A shipped category is matched by its stable key so
 * it always gets the curated triple, whatever is stored; anything else is
 * derived from its own colour.
 */
export function categoryShades(
  category: { key?: string | null; color?: string | null } | null | undefined,
): CategoryShades {
  if (!category) return { ...CATEGORY_FALLBACK };

  const key = category.key;
  if (key && key in CATEGORY_COLORS) {
    const k = key as keyof typeof CATEGORY_COLORS;
    return { color: CATEGORY_COLORS[k], ink: CATEGORY_INK[k], fill: CATEGORY_FILL[k] };
  }

  return category.color ? shadesFromHex(category.color) : { ...CATEGORY_FALLBACK };
}

