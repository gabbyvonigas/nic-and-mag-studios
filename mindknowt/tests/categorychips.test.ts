/**
 * The category chip, and the fill it no longer has.
 *
 * The chip used to draw its category's swatch as an outline and as its own
 * text, which fails: five of the seven shipped swatches are under 4.5 to 1 on
 * the page and Daily is the brand lime, which measures 1.09, not low contrast
 * but none. Filling the chip with the swatch fixed that and cost something
 * else, which is that one chip in a row of three was a block of paint while
 * the Mode and tag chips beside it were outlines.
 *
 * So the color goes where it only has to be seen: a dot, the same way the
 * category filter pills on Knowts carry theirs. The label is one text color on
 * white, and this file measures it rather than quoting it, so a palette change
 * fails here and not on a screen.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs categorychips.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const ui = read('src/components/ui.tsx');
const detail = read('src/screens/KnowtDetailScreen.tsx');
const card = read('src/components/KnowtCard.tsx');
const shared = read('src/components/categoryPill.tsx');
const themeFile = read('src/theme/index.ts');
const colors = read('src/theme/categoryColors.ts');

const { CATEGORY_COLORS, CATEGORY_INK } = await import(
  `${ROOT}/src/theme/categoryColors.ts`
);
const { palette } = await import(`${ROOT}/src/theme/palette.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** `theme.color.surface` and `theme.color.textSecondary`, which the chip uses. */
const WHITE = palette.card;
const LABEL = palette.charcoal;
const PAGE = palette.page;

// Why the color is not the label.

check('a swatch as text fails for five of the seven, which is unchanged', () => {
  const failing = Object.entries(CATEGORY_COLORS).filter(
    ([, hex]) => contrast(hex as string, PAGE) < 4.5,
  );
  assert.equal(failing.length, 5, failing.map(([k]) => k).join(', '));
  const daily = contrast(CATEGORY_COLORS.daily, PAGE);
  assert.ok(daily < 1.2, `daily measured ${daily.toFixed(2)}`);
});

// What the label is instead.

check('the label is one text color on white, and it clears 4.5', () => {
  const ratio = contrast(WHITE, LABEL);
  assert.ok(ratio >= 4.5, `measured ${ratio.toFixed(2)}`);
  // Not derived from the category, so no swatch can make it fail.
  assert.match(ui, /color: CATEGORY_PILL\.labelColor,/);
  assert.match(shared, /labelColor: theme\.color\.textSecondary,/);
  assert.doesNotMatch(ui, /onCategoryFill/);
  assert.doesNotMatch(ui, /\{ color: tint \}/);
});

check('and it is the same color whether the chip has a category or not', () => {
  // The Mode and tag chips are the other two in that row. One label color for
  // all three is the whole point of moving the swatch to a dot.
  const pillText = ui.slice(ui.indexOf('  pillText: {'), ui.indexOf('  pillText: {') + 220);
  assert.match(pillText, /color: CATEGORY_PILL\.labelColor/);
  // One style, no per-category override beside it.
  assert.match(ui, /<Text style=\{styles\.pillText\}>\{label\}<\/Text>/);
});

// The chip itself.

check('white fill, the border token and the pill radius', () => {
  // All four come from the shared shell now, which the filter pills and the
  // Apply set chips spread too. `categorypills.test.ts` is the guard that they
  // all still do; this is the guard that the shell still says these things.
  assert.match(ui, /pill: \{\n\s+\.\.\.categoryPillShell,/);
  assert.match(shared, /backgroundColor: theme\.color\.surface,/);
  assert.match(shared, /borderWidth: CATEGORY_PILL\.borderWidth,/);
  assert.match(shared, /borderColor: theme\.color\.border,/);
  assert.match(shared, /borderRadius: theme\.radius\.pill,/);
  // Nothing paints it with a category any more.
  assert.doesNotMatch(ui, /backgroundColor: color/);
});

check('the dot, the gap after it and the horizontal padding are the shared ones', () => {
  assert.match(shared, /dot: 7,/);
  assert.match(shared, /gap: theme\.spacing\.sm,/);
  assert.match(shared, /paddingHorizontal: theme\.spacing\.md,/);
  // This chip declares none of them, which is what makes them shared rather
  // than agreed.
  const pill = ui.slice(ui.indexOf('  pill: {'), ui.indexOf('  pillGlyph: {'));
  assert.doesNotMatch(pill, /paddingHorizontal/);
  assert.doesNotMatch(pill, /marginRight/);
  assert.doesNotMatch(pill, /\n\s+gap: /);
});

check('the chip is still 21.6 points tall, so the row of three still lines up', () => {
  // 13 point text in a 1.2 line box, 2 points of padding each side, 1 of
  // border each side. The filter pills are a tappable control at 34.8 and are
  // deliberately not matched on this one.
  const pill = ui.slice(ui.indexOf('  pill: {'), ui.indexOf('  pillGlyph: {'));
  assert.match(pill, /paddingVertical: 2,/);
  assert.match(ui, /fontSize: theme\.font\.size\.xs,/);
  assert.equal(13 * 1.2 + 2 * 2 + 2 * 1, 21.6);
  // The dot is shorter than the line box, so it cannot add to that.
  assert.ok(7 < 13 * 1.2);
});

// The dot.

check('the dot is the shared component, ring and all', () => {
  assert.match(
    ui,
    /import \{ CATEGORY_PILL, CategoryPillDot, categoryPillShell \} from '\.\/categoryPill';/,
  );
  assert.match(ui, /\{shades \? <CategoryPillDot shades=\{shades\} \/> : null\}/);
  // Not a rounded View of its own anywhere in this file.
  assert.doesNotMatch(ui, /borderRadius: \d/);
});

check('the ring is what keeps the Daily lime visible on white', () => {
  // A plain lime dot on a white card measures 1.19, so it is not there. The
  // hairline is drawn in the category's own ink, which clears 4.5 on white
  // for every shipped category.
  const lime = contrast(CATEGORY_COLORS.daily, WHITE);
  assert.ok(lime < 1.3, `lime on white measured ${lime.toFixed(2)}`);
  assert.match(card, /borderWidth: StyleSheet\.hairlineWidth,/);
  assert.match(card, /borderColor: ring \?\? shades\.ink,/);
  for (const [key, ink] of Object.entries(CATEGORY_INK)) {
    const ratio = contrast(ink as string, WHITE);
    assert.ok(ratio >= 4.5, `${key} ink ${ink} on white measured ${ratio.toFixed(2)}`);
  }
});

// What it is given.

check('the detail screen passes the category, not a hex value', () => {
  assert.match(
    detail,
    /<Pill\n\s+label=\{knowt\.category\.name\}\n\s+shades=\{categoryShades\(knowt\.category\)\}\n\s+\/>/,
  );
  // Through `categoryShades`, so a shipped category gets its hand-picked ink
  // rather than one derived from the swatch.
  assert.match(detail, /import \{ categoryShades, theme \} from '\.\.\/theme';/);
});

check('the Mode chip and the tag chip are untouched', () => {
  assert.match(detail, /<Pill label=\{stopLabelOf\(knowt\)\} \/>/);
  assert.match(detail, /<Pill label="Tagged" icon="knowtTag" \/>/);
  assert.match(detail, /<Pill label="No tag" \/>/);
  // The glyph keeps its own gap and its own alignment.
  assert.match(ui, /pillGlyph: \{ marginRight: theme\.spacing\.xs \},/);
  assert.match(ui, /alignItems: 'baseline',/);
});

// The helper the fill needed is gone.

check('textOn and onCategoryFill are removed, not left unused', () => {
  assert.doesNotMatch(colors, /export function textOn/);
  assert.doesNotMatch(themeFile, /export function onCategoryFill/);
  assert.doesNotMatch(themeFile, /textOn/);
  // And the file says where it went, so the next person does not add it back.
  assert.match(colors, /`textOn` lived here/);
});

check('the contrast machinery it shared is still in use', () => {
  // `shadesFromHex` steps a custom category's ink down until it clears 4.5.
  // Removing `textOn` must not have taken that with it.
  assert.match(colors, /function contrast\(/);
  assert.match(colors, /export function shadesFromHex/);
});

check('no screen hardcodes a color for a chip', () => {
  assert.doesNotMatch(ui, /#[0-9a-fA-F]{3,8}/, 'a hex literal is in ui.tsx');
});

console.log(`\n${passed} checks passed`);
