/**
 * The raw palette.
 *
 * Deliberately free of imports, like `categoryColors.ts`, so the values can be
 * asserted off device. `index.ts` imports React Native for `Platform`, which
 * means anything living there cannot be loaded by the node test runner, and a
 * palette nobody can test is a palette that drifts from design-notes.md.
 *
 * Raw values. Every one of these is documented in `design-notes.md`, which is
 * the source of truth; if the two disagree, the file is right and this is a bug.
 */
export const palette = {
  /**
   * The page. Light cool gray, never white, so cards read as cards. It was a
   * warm gray, which made every white card on it look faintly yellow.
   */
  page: '#F4F5F6',
  card: '#FFFFFF',

  /** Near black. Primary buttons, icons, headings, body. */
  ink: '#111111',
  /** Secondary text, where ink would be too heavy. */
  charcoal: '#3A3A3A',
  /** Dividers, borders, disabled. Distinct from the page. Never text. */
  lightGray: '#DCDFE3',
  /** Between charcoal and lightGray, for text that has to recede. */
  gray: '#6E7479',

  /**
   * Neon yellow green. Highlights, active states, key numbers, nothing else.
   * 1.19 against white, so it never carries text and never draws a thin line.
   */
  neon: '#D9FA3C',

  green50: '#E6F7EE',
  green200: '#A6E5C3',
  green700: '#1B6F42',

  amber50: '#FEF4E5',
  amber200: '#F7D79A',
  amber700: '#8E6014',

  red50: '#FFECEC',
  red200: '#FFB8B8',
  red700: '#B3261E',
} as const;

