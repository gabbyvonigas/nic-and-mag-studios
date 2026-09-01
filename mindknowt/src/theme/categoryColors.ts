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

/** Used for custom categories, which have no key and so no shipped shades. */
export const CATEGORY_FALLBACK = {
  color: '#8A8F98',
  ink: '#5A6069',
  fill: '#F1F2F4',
} as const;
