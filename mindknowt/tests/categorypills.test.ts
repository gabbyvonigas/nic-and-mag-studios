/**
 * Four pill-shaped category elements, one look.
 *
 * They had four. The detail screen's chip was white with a ringed dot, the
 * Knowts filter row was white with a ringless dot that left Daily invisible,
 * the Apply set chip was a pale tint of the category with no border, and each
 * had its own dot size, gap and padding. Nothing was wrong with any one of
 * them on its own screen, which is how four of them happened.
 *
 * This file is the thing that stops a fifth. The shared values live in
 * `categoryPill.tsx` and every pill spreads them, so each check here reads the
 * shared file and then each pill, rather than repeating a number that could
 * agree with nothing.
 *
 * What is deliberately not shared is height. A pill keeps the size its job
 * needs: the detail chip is 21.6 points because it lines up with the Mode and
 * tag chips, a filter pill is a control a thumb has to hit, and the Apply set
 * chip sits on a dense entry line.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs categorypills.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const shared = read('src/components/categoryPill.tsx');
const dot = read('src/components/KnowtCard.tsx');
const ui = read('src/components/ui.tsx');
const knowts = read('src/screens/AllKnowtsScreen.tsx');
const applySet = read('src/screens/ApplySetScreen.tsx');

const { palette } = await import(`${ROOT}/src/theme/palette.ts`);
const { CATEGORY_COLORS, CATEGORY_INK } = await import(
  `${ROOT}/src/theme/categoryColors.ts`
);

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

/** The three pills, by the style block each one declares. */
const PILLS = [
  { what: 'the Knowt detail chip', src: ui, style: '  pill: {', pad: 'paddingVertical: 2' },
  {
    what: 'the Knowts filter pill',
    src: knowts,
    style: '  chip: {',
    pad: 'paddingVertical: theme.spacing.sm',
  },
  {
    what: 'the Apply set chip',
    src: applySet,
    style: '  chip: {',
    pad: 'paddingVertical: 3',
  },
] as const;

/**
 * One object literal, from its opening line to its closing brace.
 *
 * Two shapes to close on: a member of a `StyleSheet.create` call, indented by
 * two, and a top level `const`, which closes at column zero.
 */
function block(src: string, head: string): string {
  const at = src.indexOf(head);
  assert.ok(at > 0, `no block ${head}`);
  const ends = ['\n  },', '\n} as const', '\n};']
    .map((close) => src.indexOf(close, at + head.length))
    .filter((end) => end > at);
  assert.ok(ends.length > 0, `unterminated ${head}`);
  return src.slice(at, Math.min(...ends));
}

// --- The shared values exist, in one place. -------------------------------

check('the shared file names every value the pills must agree on', () => {
  assert.match(shared, /export const CATEGORY_PILL = \{/);
  assert.match(shared, /\n {2}dot: 7,/);
  assert.match(shared, /\n {2}gap: theme\.spacing\.sm,/);
  assert.match(shared, /\n {2}paddingHorizontal: theme\.spacing\.md,/);
  assert.match(shared, /\n {2}borderWidth: 1,/);
  assert.match(shared, /\n {2}labelColor: theme\.color\.textSecondary,/);
  assert.match(shared, /\n {2}labelFont: theme\.font\.face\.medium,/);
});

check('the shell is built from them, not from numbers beside them', () => {
  const shell = block(shared, 'export const categoryPillShell = {');
  assert.match(shell, /backgroundColor: theme\.color\.surface,/);
  assert.match(shell, /borderWidth: CATEGORY_PILL\.borderWidth,/);
  assert.match(shell, /borderColor: theme\.color\.border,/);
  assert.match(shell, /borderRadius: theme\.radius\.pill,/);
  assert.match(shell, /paddingHorizontal: CATEGORY_PILL\.paddingHorizontal,/);
  // No height in the shell, because height is the one thing that differs.
  assert.doesNotMatch(shell, /paddingVertical/);
  assert.doesNotMatch(shell, /height/);
});

// --- Every pill takes them. ----------------------------------------------

check('all three spread the shell rather than restating it', () => {
  for (const pill of PILLS) {
    const style = block(pill.src, pill.style);
    assert.match(style, /\.\.\.categoryPillShell,/, pill.what);
    // And none of them declares one of the shared properties itself, which is
    // the only way they can drift while still spreading it.
    for (const own of [
      'backgroundColor',
      'borderWidth',
      'borderColor',
      'borderRadius',
      'paddingHorizontal',
      'gap',
    ]) {
      assert.doesNotMatch(style, new RegExp(`\\n\\s+${own}:`), `${pill.what} sets its own ${own}`);
    }
  }
});

check('all three draw the dot with the shared component', () => {
  for (const pill of PILLS) {
    assert.match(pill.src, /<CategoryPillDot/, pill.what);
    // Not a rounded View of its own. `chipDot` and `pillDot` are both gone.
    assert.doesNotMatch(pill.src, /chipDot/, pill.what);
    assert.doesNotMatch(pill.src, /pillDot/, pill.what);
  }
  assert.match(shared, /<CategoryDot shades=\{shades\} size=\{CATEGORY_PILL\.dot\} ring=\{ring\} \/>/);
  assert.match(shared, /marginRight: CATEGORY_PILL\.gap/);
});

check('all three label with the shared color and the shared family', () => {
  for (const pill of PILLS) {
    assert.match(pill.src, /color: CATEGORY_PILL\.labelColor,/, pill.what);
    assert.match(pill.src, /fontFamily: CATEGORY_PILL\.labelFont,/, pill.what);
  }
  // No category's own ink or swatch is used as a label any more.
  assert.doesNotMatch(applySet, /color: categoryShades\(entry\.category\)\.ink/);
  assert.doesNotMatch(ui, /backgroundColor: color/);
});

// --- And keeps its own height. -------------------------------------------

check('each one keeps the height its job needs', () => {
  for (const pill of PILLS) {
    assert.match(block(pill.src, pill.style), new RegExp(pill.pad), pill.what);
  }
  // The detail chip's number, spelled out: 13 point text in a 1.2 line box,
  // 2 points of padding each side and 1 of border each side.
  assert.equal(13 * 1.2 + 2 * 2 + 2 * 1, 21.6);
  // The dot is shorter than that line box, so it cannot add to the height.
  assert.ok(7 < 13 * 1.2);
});

// --- The label reads, on every pill and every category. ------------------

check('the label clears 4.5 to 1 wherever a pill is drawn', () => {
  // One color, not derived from the category, so no swatch can make it fail.
  const ratio = contrast(palette.charcoal, palette.card);
  assert.ok(ratio >= 4.5, `measured ${ratio.toFixed(2)}`);
});

check('the Daily lime dot is visible, which is what the ring is for', () => {
  const lime = contrast(CATEGORY_COLORS.daily, palette.card);
  assert.ok(lime < 1.3, `lime on white measured ${lime.toFixed(2)}`);
  assert.match(dot, /borderWidth: StyleSheet\.hairlineWidth,/);
  assert.match(dot, /borderColor: ring \?\? shades\.ink,/);
  for (const [key, ink] of Object.entries(CATEGORY_INK)) {
    const against = contrast(ink as string, palette.card);
    assert.ok(against >= 4.5, `${key} ring on white measured ${against.toFixed(2)}`);
  }
});

// --- Selected, on the filter row. ---------------------------------------

check('selected is the dark fill, and it clears 3 to 1 against unselected', () => {
  // `fillStrong`, not `primary`. `primary` is near black and is also the text
  // color; a pill filled with it read as a hole in the row. `fills.test.ts`
  // owns that rule for the whole app.
  const chipOn = block(knowts, '  chipOn: {');
  assert.match(chipOn, /backgroundColor: theme\.color\.fillStrong,/);
  assert.match(chipOn, /borderColor: theme\.color\.fillStrong,/);
  assert.match(knowts, /chipTextOn: \{ color: theme\.color\.onPrimary \},/);

  const fills = contrast(palette.fillStrong, palette.card);
  assert.ok(fills >= 3, `selected against unselected measured ${fills.toFixed(2)}`);
  const label = contrast(palette.card, palette.fillStrong);
  assert.ok(label >= 4.5, `selected label measured ${label.toFixed(2)}`);
});

check('the lime it used to be could not have passed that', () => {
  // 1.19 to 1 against a white pill. It read at a glance by hue and measured
  // as nothing, which is why the selected state moved rather than staying.
  const lime = contrast(palette.neon, palette.card);
  assert.ok(lime < 3, `lime against white measured ${lime.toFixed(2)}`);
  assert.doesNotMatch(block(knowts, '  chipOn: {'), /highlight/);
});

check('the dot survives selection, with a ring that can be seen on black', () => {
  // Hiding it changed the pill's width on every tap and slid the strip
  // sideways. Keeping it needs the other ring: the category's own ink is the
  // one color that disappears on near black.
  assert.match(
    knowts,
    /ring=\{active \? theme\.color\.onPrimary : undefined\}/,
  );
  assert.doesNotMatch(knowts, /shades && !active/);
  const ring = contrast(palette.card, palette.fillStrong);
  assert.ok(ring >= 3, `white ring on the fill measured ${ring.toFixed(2)}`);
  // The swatch it rings is the worst case, and the ring is what carries it.
  // Two points lighter does not rescue burgundy: it is 2.63 on the fill.
  const worst = Math.min(
    ...Object.values(CATEGORY_COLORS).map((hex) =>
      contrast(hex as string, palette.fillStrong),
    ),
  );
  assert.ok(worst < 3, `every swatch already reads on the fill: worst ${worst.toFixed(2)}`);
});

check('Manage is still the quiet one, and still reads', () => {
  // Not a category: a way to the Categories screen. No dot, never active.
  assert.match(knowts, /chipQuiet: \{ backgroundColor: 'transparent' \},/);
  assert.match(knowts, /chipTextQuiet: \{ color: theme\.color\.textMuted \},/);
  const ratio = contrast(palette.gray, palette.card);
  assert.ok(ratio >= 4.5, `Manage measured ${ratio.toFixed(2)}`);
});

// --- What this sweep must not have touched. ------------------------------

check('the category pickers keep their own look', () => {
  // Setup and Edit Knowt both pick a category over the whole set, where the
  // color is the thing being chosen rather than a label on something already
  // chosen. Turning them into white pills with a dot would take the cue off
  // the control, so neither spreads the shell.
  const setup = read('src/screens/SetupKnowtScreen.tsx');
  const edit = read('src/screens/EditKnowtScreen.tsx');
  for (const [where, src] of [['Setup', setup], ['Edit Knowt', edit]] as const) {
    assert.doesNotMatch(src, /categoryPillShell/, where);
    assert.doesNotMatch(src, /CategoryPillDot/, where);
  }
  // Setup's is pill shaped and selected is a tint of the category it picks.
  assert.match(setup, /chip: \{\n\s+backgroundColor: theme\.color\.background,/);
  assert.match(setup, /borderRadius: theme\.radius\.pill,/);
  assert.match(setup, /backgroundColor: shades\.fill,\n\s+borderColor: shades\.color,/);
  // Edit Knowt's is not even pill shaped: `radius.lg`, and selected is the
  // solid swatch. These are the swatches, not a pill.
  assert.match(edit, /chip: \{\n\s+borderWidth: 1,[\s\S]{0,120}borderRadius: theme\.radius\.lg,/);
  assert.match(edit, /backgroundColor: shades\.color, borderColor: shades\.color/);
});

check('the elements that are not pills are untouched', () => {
  // A tile, a bar and three sizes of bare dot. None of them is pill shaped and
  // none of them carries a label, so none of them is in this sweep.
  assert.match(read('src/components/CategoryIcon.tsx'), /backgroundColor: solid \? shades\.color : shades\.fill,/);
  assert.match(read('src/screens/LogScreen.tsx'), /<CategoryDot shades=\{shades\} size=\{8\} \/>/);
  assert.match(read('src/components/SummaryPanel.tsx'), /listDot: \{ width: 8, height: 8, borderRadius: 4 \}/);
  assert.match(read('src/screens/HomeScreen.tsx'), /stripDot: \{ width: 5, height: 5, borderRadius: 2\.5 \}/);
  assert.match(read('src/screens/CategoriesScreen.tsx'), /\{ backgroundColor: color \}/);
  assert.match(read('src/screens/BrowseSetsScreen.tsx'), /headBadge: \{\n\s+width: 22,/);
});

console.log(`\n${passed} checks passed`);
