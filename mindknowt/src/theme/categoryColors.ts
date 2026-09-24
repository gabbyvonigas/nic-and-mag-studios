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
 * The swatch. One per category, and the value stored in `categories.color`.
 *
 * Three of these are pale by design (butter, lime, icy periwinkle), which is a
 * different thing from the muted set they replaced: a pastel is light but
 * clean, while muted meant gray with a hue attached. Measured as HSL
 * saturation the new set runs 0.63 to 1.00 and the old mauve and taupe sat at
 * 0.24 and 0.14. HSV saturation cannot tell those apart, which is why the
 * check uses HSL.
 */
export const CATEGORY_COLORS = {
  /** Butter yellow. */
  home: '#F5E07A',
  /** The brand lime, the same value as the accent. */
  daily: '#D9FA3C',
  /** Turquoise. */
  care: '#24C2B5',
  /** Icy periwinkle. */
  ritual: '#AFC0F0',
  /** Darker mustard, a deeper version of the gold Daily used to carry. */
  go: '#C9901E',
  /** Violet, unchanged. */
  admin: '#7B61FF',
  /** Burgundy. */
  seasonal: '#8A1F3D',
} as const;

/**
 * Darkened for label text and icons.
 *
 * No longer a single mix. The pale swatches need to go further to stay legible:
 * butter and lime are darkened 50 and 54 percent, the rest 42. Every value
 * clears 4.5 against both white and the page, so it is legible at body size on
 * either.
 */
export const CATEGORY_INK = {
  home: '#7A703D',
  daily: '#64731C',
  care: '#157169',
  ritual: '#666F8B',
  go: '#755411',
  admin: '#473894',
  seasonal: '#501223',
} as const;

/**
 * The swatch as a small mark: a dot, a thin rule, a priority bar.
 *
 * A butter yellow dot on the page is 1.22 against it and a lime one is 1.09,
 * which is invisible. This is the same color darkened only as far as it takes
 * a small mark to reach 2.0 against the page, which is nothing at all for four
 * of the seven. Large fills still use the swatch itself, where its lightness is
 * the point rather than a problem.
 */
export const CATEGORY_MARK = {
  home: '#BFAF5F',
  daily: '#A1B92C',
  care: '#24C2B5',
  ritual: '#9EADD8',
  go: '#C9901E',
  admin: '#7B61FF',
  seasonal: '#8A1F3D',
} as const;

/**
 * Barely-there fill for chips and finished cards.
 *
 * Mostly 88 percent towards white, but burgundy needs 90: it is dark enough
 * that the standard mix lands heavier than the rest and stops reading as a
 * tint. The mix is not a constant, for the same reason the ink mix is not.
 */
export const CATEGORY_FILL = {
  home: '#FEFBEF',
  daily: '#FAFEE8',
  care: '#E5F8F6',
  ritual: '#F5F7FD',
  go: '#F9F2E4',
  admin: '#EFECFF',
  seasonal: '#F3E9EC',
} as const;

/**
 * How a knowt was finished. Deliberately outside the category palette: these
 * are not categories, and borrowing a category color for them would make the
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
  mark: '#8A93A0',
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
  /** The swatch itself, for fills and anything large. */
  color: string;
  /** Darkened, for label text and icons. */
  ink: string;
  /** The swatch as a small mark: dots, thin rules, bars. */
  mark: string;
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
 * Derives the ink and fill for a color the app did not choose.
 *
 * The shipped six have hand-picked shades because they are the brand. A
 * category someone makes themselves cannot, so its shades are mixed towards
 * black and white. Close enough to stay legible, and it means a custom
 * category renders in its own color instead of falling back to gray.
 */
export function shadesFromHex(hex: string): CategoryShades {
  const rgb = parseHex(hex);
  if (!rgb) return { ...CATEGORY_FALLBACK };
  return {
    color: toHex(rgb),
    ink: mix(rgb, [0, 0, 0], 0.42),
    // A custom color gets a light touch of the same darkening a pale shipped
    // one needs, which is enough for a dot without changing what it looks like.
    mark: mix(rgb, [0, 0, 0], 0.12),
    fill: mix(rgb, [255, 255, 255], 0.88),
  };
}

/**
 * Shades for one category. A shipped category is matched by its stable key so
 * it always gets the curated triple, whatever is stored; anything else is
 * derived from its own color.
 */
export function categoryShades(
  category: { key?: string | null; color?: string | null } | null | undefined,
): CategoryShades {
  if (!category) return { ...CATEGORY_FALLBACK };

  const key = category.key;
  if (key && key in CATEGORY_COLORS) {
    const k = key as keyof typeof CATEGORY_COLORS;
    return {
      color: CATEGORY_COLORS[k],
      ink: CATEGORY_INK[k],
      mark: CATEGORY_MARK[k],
      fill: CATEGORY_FILL[k],
    };
  }

  return category.color ? shadesFromHex(category.color) : { ...CATEGORY_FALLBACK };
}

