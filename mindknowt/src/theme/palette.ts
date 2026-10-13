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
  /**
   * The neon at about forty percent over white. For a panel that should read
   * as lime without the full strength color fighting the text on it. Near
   * black reads at 16.85 on it and charcoal at 8.12; the muted gray does not,
   * at 4.22, so it is not used there.
   */
  neonTint: '#E9FB9C',
  /**
   * The palest step of the lime, straight from the branding. For the two
   * reading cards on Log, which want to read as lime without competing with
   * the figures on them. Near black is 17.79 on it and charcoal 10.72; the
   * muted gray is 4.46, which is under the floor, so nothing uses it there.
   */
  neonPale: '#F1FFBE',

  /**
   * Every bar, arc and fill in a chart. Deliberately not `ink`: a solid black
   * bar reads as a hole punched in the card, and a chart is drawn, not
   * written. Text keeps `ink`.
   */
  graph: '#2E3236',
  /** The bars a chart is not pointing at. */
  graphMuted: '#DFE3E7',

  /**
   * The three stat tiles on Log. Pale enough to carry ink text at full
   * contrast, and distinct enough from each other to tell the tiles apart at a
   * glance. They are backgrounds only: none of them is a status color, so a
   * number never lands on a tile that means something.
   */
  mint: '#C8EEDC',
  lavender: '#DCD4F5',
  /** Hot pink, not peach: the third tile needed energy, not warmth. */
  hotPink: '#FFD6E7',

  /**
   * The number on each tile, in the tile's own hue. Dark enough to carry text
   * at full contrast; the tint alone left the figures reading as gray.
   */
  mintInk: '#1B6A4B',
  lavenderInk: '#5B2ED6',
  hotPinkInk: '#B81253',

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

