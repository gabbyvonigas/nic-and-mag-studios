import { Platform } from 'react-native';

import { CATEGORY_COLORS } from './categoryColors';
import { palette } from './palette';

/**
 * Single source of truth for branding. Colors and fonts are still being
 * finalized, so nothing outside this file should hardcode a hex value or a
 * font family; screens consume semantic tokens only.
 */

export const theme = {
  color: {
    background: palette.page,
    surface: palette.card,
    /** A panel inside a card, or an inactive segment. */
    surfaceMuted: palette.page,
    border: palette.lightGray,

    /** Near black. What was called accent, because it is the primary action. */
    primary: palette.ink,
    onPrimary: palette.card,
    primaryDisabled: palette.lightGray,

    /** The neon. Fill only, with `onHighlight` text over it. */
    highlight: palette.neon,
    onHighlight: palette.ink,

    textPrimary: palette.ink,
    textSecondary: palette.charcoal,
    textMuted: palette.gray,
    textBody: palette.charcoal,

    /**
     * Aliases kept so screens still compile while the direction is applied one
     * screen at a time. Both point at primary, which is where accent already
     * pointed. They go once stage three is finished.
     */
    accent: palette.ink,
    onAccent: palette.card,
    accentDisabled: palette.lightGray,

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
     * SF Pro Rounded. React Native does not expose it by family name and iOS
     * does not install it as an ordinary font, so it is reached through the
     * private family below. Undocumented, but it has worked on iOS for years,
     * and an unknown family falls back to San Francisco rather than breaking,
     * so being wrong here costs the rounding and nothing else.
     *
     * The guaranteed alternative is bundling the files through `expo-font`,
     * which is native and costs a rebuild. Not worth it until this is shown to
     * fail on a device.
     *
     * The private family carries no separate PostScript faces, so `face` maps
     * onto the one family and weight is applied through `weight` below. Rounded
     * holds weight well, so medium does most of the work bold used to.
     */
    body: Platform.select({ ios: '.AppleSystemUIFontRounded', default: undefined }),
    face: {
      light: Platform.select({ ios: '.AppleSystemUIFontRounded', default: undefined }),
      regular: Platform.select({ ios: '.AppleSystemUIFontRounded', default: undefined }),
      medium: Platform.select({ ios: '.AppleSystemUIFontRounded', default: undefined }),
      bold: Platform.select({ ios: '.AppleSystemUIFontRounded', default: undefined }),
    },
    mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    size: {
      // Everything below the header steps went up one notch: rounded runs
      // optically smaller than Helvetica at the same point size, so carrying
      // the old scale across made the whole app read as fine print.
      xs: 13,
      sm: 14,
      md: 16,
      lg: 18,
      /** Section headings. Unchanged. */
      xl: 22,
      /** Screen titles. Unchanged. */
      display: 32,
      uid: 30,
    },
    /**
     * Do not use these with the rounded family, and there is no other family.
     *
     * RCTFont.mm resolves a private family name through `fontWithName:`, which
     * only ever returns the regular face, then reassigns familyName to the
     * font's real family, which is the plain system one. Whatever weight was
     * asked for is matched against plain San Francisco faces from there. So
     * fontWeight on rounded text either does nothing or silently drops the
     * rounding, and which of the two depends on the iOS version.
     *
     * Weight comes back by bundling the real SF Pro Rounded faces through
     * expo-font, which is native and costs a rebuild. Until then hierarchy is
     * size and color. Kept here only so the scale is written down.
     */
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
    sm: 10,
    md: 14,
    lg: 18,
    /** Cards. This is the shape of the app. */
    xl: 22,
    pill: 999,
  },

  /**
   * One shadow, used wherever a card lifts off the page. Soft and low: the
   * white against the gray page does most of the work, and a card carries no
   * border on top of it, because a line drawn around a card reads as a line.
   */
  shadow: {
    card: {
      shadowColor: '#111111',
      shadowOpacity: 0.07,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
  },

  /**
   * Category swatches. Persisted into `categories.color`, so they are data
   * rather than styling. Defined in `categoryColors.ts`, which has no imports,
   * so the migration that back-fills them stays testable off device.
   */
  categoryPalette: CATEGORY_COLORS,
} as const;

export type Theme = typeof theme;

export { palette };

export {
  METHOD_COLORS,
  categoryShades,
  shadesFromHex,
  CUSTOM_PALETTE,
  type CategoryShades,
} from './categoryColors';
