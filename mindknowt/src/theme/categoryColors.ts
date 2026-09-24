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

/**
 * The swatch. Vivid, and deliberately no longer muted.
 *
 * Brightening the muted originals was not enough: saturation was the problem,
 * not lightness. Care sat at 0.31 saturation and admin at 0.17, which is a
 * greyish colour with a hue attached, and next to neon and near-black they read
 * as dirt. These run 0.62 to 0.86.
 *
 * Two of the six changed identity rather than just intensity, because there is
 * no vivid version of them: mauve pink became a true pink, and warm taupe
 * became violet. Terracotta and gold stay warm, because six categories need a
 * spread of hue to stay apart and an all-cool set of six collapses into three.
 *
 * Between 1.9 and 3.9 against the page, which is why these are never text.
 * Bars, dots, fills and rules only. See design-notes.md.
 */
export const CATEGORY_COLORS = {
  home: '#FF5A3C',
  daily: '#F5A623',
  care: '#FF4D9D',
  ritual: '#2FBF71',
  go: '#2E8BFF',
  admin: '#7B61FF',
} as const;

/**
 * Darkened for label text and icons on white. The swatch mixed 42 percent
 * towards black, the same mix a custom category gets, so the shipped six and a
 * colour someone picked behave identically. Every value clears 5.6 against
 * white, so it is legible at body size.
 */
export const CATEGORY_INK = {
  home: '#943423',
  daily: '#8E6014',
  care: '#942D5B',
  ritual: '#1B6F42',
  go: '#1B5194',
  admin: '#473894',
} as const;

/** Barely-there fill for chips and completed cards: 88 percent towards white. */
export const CATEGORY_FILL = {
  home: '#FFEBE8',
  daily: '#FEF4E5',
  care: '#FFEAF3',
  ritual: '#E6F7EE',
  go: '#E6F1FF',
  admin: '#EFECFF',
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
  scan: '#2FBF71',
  tap: '#2E8BFF',
  override: '#F5A623',
} as const;

/** Used for custom categories, which have no key and so no shipped shades. */
export const CATEGORY_FALLBACK = {
  color: '#8A93A0',
  ink: '#4E555F',
  fill: '#F1F3F5',
} as const;

/**
 * Swatches offered when someone makes their own category. The same vivid
 * register as the shipped six, so a custom category sits beside them rather
 * than looking like a faded copy, in hues the shipped six do not use.
 */
export const CUSTOM_PALETTE = [
  '#FF3B5C',
  '#FF7A1A',
  '#FFD028',
  '#8BD934',
  '#12C7B4',
  '#22A7F0',
  '#5C6BFF',
  '#A855F7',
  '#EC4899',
  '#64748B',
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

