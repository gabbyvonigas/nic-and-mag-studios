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
 * Vivid, and used literally everywhere: fills, bars and dots all draw this
 * exact value. An earlier version darkened pale swatches for small marks, and
 * on device that read as washed out, which is the opposite of the point.
 * Where a mark would otherwise be too faint to see, it gets a hairline ring
 * rather than a different color.
 *
 * HSL saturation runs 0.63 to 1.00.
 */
export const CATEGORY_COLORS = {
  /** Coral red. */
  home: '#FF4D3D',
  /** The brand lime, the exact value the buttons use. */
  daily: '#D9FA3C',
  /** Turquoise. */
  care: '#24C2B5',
  /** Bright purple. */
  ritual: '#A435F0',
  /** Hot pink. */
  go: '#FF2D8A',
  /** Cobalt blue. */
  admin: '#1F5FD8',
  /** Burgundy. */
  seasonal: '#8A1F3D',
} as const;

/**
 * Darkened only as far as text needs, and not at all where the swatch already
 * carries itself: cobalt and burgundy are their own ink. Every value clears
 * 4.5 against both white and the page.
 */
export const CATEGORY_INK = {
  home: '#C73C30',
  daily: '#64731C',
  care: '#177C74',
  ritual: '#A134EB',
  go: '#D12571',
  admin: '#1F5FD8',
  seasonal: '#8A1F3D',
} as const;

/** Barely-there fill for chips and finished cards, kept under 1.2 on white. */
export const CATEGORY_FILL = {
  home: '#FFE6E4',
  daily: '#FAFEE4',
  care: '#E0F6F5',
  ritual: '#F4E7FD',
  go: '#FFE4F0',
  admin: '#E4ECFA',
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
  /** The swatch itself. Everything that is not text draws this. */
  color: string;
  /** Darkened, for label text and icons. */
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
      fill: CATEGORY_FILL[k],
    };
  }

  return category.color ? shadesFromHex(category.color) : { ...CATEGORY_FALLBACK };
}

