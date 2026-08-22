import { Platform } from 'react-native';

/**
 * Single source of truth for branding. Colors and fonts are still being
 * finalized, so nothing outside this file should hardcode a hex value or a
 * font family — screens consume semantic tokens only.
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
    background: palette.white,
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
    /** `undefined` resolves to the platform system face. */
    body: Platform.select({ ios: undefined, default: undefined }),
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
  },

  /**
   * Category swatches. These are persisted into `categories.color`, so they are
   * data rather than styling — but they still live here so that rebranding
   * remains a single-file change.
   */
  categoryPalette: {
    home: '#2563eb',
    daily: '#0891b2',
    care: '#7c3aed',
    ritual: '#db2777',
    go: '#ea580c',
    admin: '#4b5563',
  },
} as const;

export type Theme = typeof theme;
