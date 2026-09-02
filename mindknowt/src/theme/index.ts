import { Platform } from 'react-native';

import {
  CATEGORY_COLORS,
  CATEGORY_FALLBACK,
  CATEGORY_FILL,
  CATEGORY_INK,
} from './categoryColors';

/**
 * Single source of truth for branding. Colors and fonts are still being
 * finalized, so nothing outside this file should hardcode a hex value or a
 * font family; screens consume semantic tokens only.
 */

/** Raw values. Swap these when the brand palette lands. */
const palette = {
  ink900: '#111827',
  ink600: '#4b5563',
  ink500: '#6b7280',
  ink400: '#9ca3af',
  ink200: '#e5e7eb',
  ink100: '#f3f4f6',
  white: '#ffffff',
  /** Cool off-white. The page sits on this so white cards read as cards. */
  page: '#f6f7f9',

  green50: '#f0fdf4',
  green200: '#bbf7d0',
  green700: '#15803d',

  amber50: '#fffbeb',
  amber200: '#fde68a',
  amber700: '#b45309',

  red50: '#fef2f2',
  red200: '#fecaca',
  red700: '#b91c1c',
} as const;

export const theme = {
  color: {
    background: palette.page,
    surface: palette.white,
    surfaceMuted: palette.ink100,
    border: palette.ink200,

    textPrimary: palette.ink900,
    textSecondary: palette.ink500,
    textMuted: palette.ink400,
    textBody: palette.ink600,

    accent: palette.ink900,
    onAccent: palette.white,
    accentDisabled: palette.ink200,

    successSurface: palette.green50,
    successBorder: palette.green200,
    successText: palette.green700,

    warningSurface: palette.amber50,
    warningBorder: palette.amber200,
    warningText: palette.amber700,

    dangerSurface: palette.red50,
    dangerBorder: palette.red200,
    dangerText: palette.red700,
  },

  font: {
    /**
     * Helvetica Neue ships with iOS, so this needs no bundled asset and no
     * native build. React Native maps `fontWeight` onto a face within the
     * family, which is reliable for Regular, Medium and Bold but not for Light,
     * so `face` below names the PostScript faces directly for anywhere the
     * weight has to be exact.
     */
    body: Platform.select({ ios: 'Helvetica Neue', default: undefined }),
    face: {
      light: Platform.select({ ios: 'HelveticaNeue-Light', default: undefined }),
      regular: Platform.select({ ios: 'HelveticaNeue', default: undefined }),
      medium: Platform.select({ ios: 'HelveticaNeue-Medium', default: undefined }),
      bold: Platform.select({ ios: 'HelveticaNeue-Bold', default: undefined }),
    },
    mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    size: {
      xs: 12,
      sm: 13,
      md: 15,
      lg: 17,
      xl: 22,
      display: 32,
      uid: 30,
    },
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },

  /**
   * Category swatches. Persisted into `categories.color`, so they are data
   * rather than styling. Defined in `categoryColors.ts`, which has no imports,
   * so the migration that back-fills them stays testable off device.
   */
  categoryPalette: CATEGORY_COLORS,
} as const;

export type Theme = typeof theme;

export type CategoryShades = {
  /** The swatch itself, for accent bars and dots. */
  color: string;
  /** Darkened, for label text and icons on white. */
  ink: string;
  /** Barely-there fill, for chips and completed cards. */
  fill: string;
};

/**
 * Shades for one category. Takes the key rather than the stored color because
 * ink and fill are not derivable from a hex at render time without a color
 * library. A custom category has no key, so it gets the neutral fallback.
 */
export function categoryShades(key: string | null | undefined): CategoryShades {
  if (key && key in CATEGORY_COLORS) {
    const k = key as keyof typeof CATEGORY_COLORS;
    return { color: CATEGORY_COLORS[k], ink: CATEGORY_INK[k], fill: CATEGORY_FILL[k] };
  }
  return { ...CATEGORY_FALLBACK };
}
