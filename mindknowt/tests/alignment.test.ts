/**
 * Visual alignment: one left edge for the names, one bottom line for the
 * glyphs, one height for the chips.
 *
 * Four reports, one file, because all four are the same mistake: a box sized
 * by a number of its own rather than by the text it stands next to. The pin
 * pushed the name right, the mark floated above the letters and read thinner
 * than the glyph beside it, and the one chip with a glyph stood taller than
 * the chips next to it.
 *
 * The font and the two PNGs are measured here rather than quoted, so a
 * swapped asset or an upgraded icon set fails this file instead of quietly
 * moving everything half a point.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs alignment.test.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const list = read('src/screens/AllKnowtsScreen.tsx');
const icon = read('src/components/Icon.tsx');
const ui = read('src/components/ui.tsx');
const card = read('src/components/KnowtCard.tsx');
const row = read('src/components/StopChoiceRow.tsx');

const {
  BAND,
  HEAVY_BELOW,
  IONICON,
  LINE_BOX,
  MARK,
  SHAPE,
  clockFaceHeight,
  iconSizeForText,
  inkHeight,
  ioniconStroke,
  markLayout,
  markRectHeight,
  markStroke,
  sizeForMarkRect,
} = await import(`${ROOT}/src/components/iconMetrics.ts`);
/**
 * The two tokens this file does arithmetic with, read off the theme rather
 * than imported: `src/theme/index.ts` pulls in `react-native`, which the
 * off-device runner cannot load.
 */
const themeSource = read('src/theme/index.ts');
const theme = { font: { size: { xs: 13, md: 16, lg: 18 } }, spacing: { sm: 8 } };
for (const [name, value] of Object.entries(theme.font.size)) {
  assert.match(
    themeSource,
    new RegExp(`\\n\\s+${name}: ${value},`),
    `font size ${name} is no longer ${value}`,
  );
}
assert.match(themeSource, /\n\s+sm: 8,/);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const near = (a: number, b: number, slack: number, what: string) =>
  assert.ok(Math.abs(a - b) <= slack, `${what}: ${a} against ${b}`);

/**
 * Stroke thickness, as the most common run of opaque pixels across the
 * drawing. A uniform stroke crosses a row or a column in exactly its own
 * width far more often than anything else in the shape does.
 */
function strokeOf(python: string, em: number): number {
  const out = execFileSync('python3', ['-I', '-c', `
from collections import Counter
${python}
w, h = im.size
px = im.load()
lengths = Counter()
for y in range(h):
    run = 0
    for x in range(w):
        if px[x, y] > 128:
            run += 1
        else:
            if run: lengths[run] += 1
            run = 0
    if run: lengths[run] += 1
for x in range(w):
    run = 0
    for y in range(h):
        if px[x, y] > 128:
            run += 1
        else:
            if run: lengths[run] += 1
            run = 0
    if run: lengths[run] += 1
cand = [(n, c) for n, c in lengths.items() if n >= 3]
cand.sort(key=lambda t: -t[1])
print(cand[0][0])
`], { encoding: 'utf8' });
  return Number(out.trim()) / em;
}

const glyphStroke = (codepoint: number) =>
  strokeOf(`
from PIL import Image, ImageFont, ImageDraw
f = ImageFont.truetype("${ROOT}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf", 512)
img = Image.new('L', (1024, 1024), 0)
ImageDraw.Draw(img).text((256, 256), chr(${codepoint}), font=f, fill=255)
im = img.crop(img.getbbox())
`, 512);

const markPng = (file: string) =>
  strokeOf(`
from PIL import Image
im = Image.open("${ROOT}/assets/brand/${file}").convert('RGBA').split()[3]
`, 512);

// What the constants claim, against the font and the files.

check('the Ionicon numbers are the font’s, not a guess', () => {
  // Both of the glyphs a mark ever sits beside, so the 6.25 percent is not
  // one glyph's accident.
  const out = execFileSync('python3', ['-I', '-c', `
from PIL import ImageFont
f = ImageFont.truetype("${ROOT}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf", 512)
asc, desc = f.getmetrics()
for cp in (0xf10d, 0xf5de):
    x0, y0, x1, y1 = f.getbbox(chr(cp))
    print(asc - y1, y1 - y0)
`], { encoding: 'utf8' }).trim().split('\n').map((line) => line.split(/\s+/).map(Number));

  const [alarmBelow, alarmInk] = out[0] as number[];
  const [clockBelow] = out[1] as number[];
  // alarm-outline ends exactly on the baseline, which is what lets a
  // `baseline` row put a glyph and a mark on one line with no nudging.
  assert.equal(alarmBelow, 0, 'the alarm no longer sits on the baseline');
  assert.equal(IONICON.inkBottom, 0);
  // The clock dips 16 units under it, which is 3 percent of the box: the
  // reason the constant is taken from the alarm and not averaged.
  assert.ok(Math.abs(clockBelow!) <= 20, `clock ${clockBelow} off the baseline`);
  near(IONICON.ink, alarmInk! / 512, 0.004, 'ink over the box');
});

check('an outline glyph is drawn at 6.25 percent, and both of them are', () => {
  for (const [name, codepoint] of [['alarm', 0xf10d], ['clock', 0xf5de]] as const) {
    near(glyphStroke(codepoint), IONICON.stroke, 0.004, `${name} stroke`);
  }
  assert.equal(IONICON.stroke * 512, 32);
});

check('the mark was thinner than that, and the heavy one is not', () => {
  const before = markPng('mindknowt-tag-mark.png');
  const after = markPng('mindknowt-tag-mark-heavy.png');
  near(before, MARK.strokeLight, 0.002, 'the supplied stroke');
  near(after, MARK.strokeHeavy, 0.002, 'the heavy stroke');
  // The point of the exercise, in one line.
  assert.ok(before < IONICON.stroke * 0.75, `${before} was not thin`);
  near(after, IONICON.stroke, 0.002, 'the heavy stroke against the glyph');
});

check('both files carry the same drawing in the same place', () => {
  // One set of metrics places either of them, so the heavy one cannot be a
  // differently cropped export that renders a hair off.
  const box = (file: string) =>
    execFileSync('python3', ['-I', '-c', `
from PIL import Image
im = Image.open("${ROOT}/assets/brand/${file}").convert('RGBA')
print(*im.split()[3].getbbox(), *im.size)
`], { encoding: 'utf8' }).trim();
  assert.equal(box('mindknowt-tag-mark-heavy.png'), box('mindknowt-tag-mark.png'));
  assert.equal(box('mindknowt-tag-mark.png'), '59 24 452 487 512 512');
  near(MARK.ink, 463 / 512, 0.0001, 'ink over the canvas');
  near(MARK.aspect, 393 / 463, 0.0001, 'ink aspect');
});

// The heavier variant is registered, and used where it is meant to be.

check('both files are registered, and nothing else requires either', () => {
  assert.match(icon, /knowtTag: \{/);
  assert.match(icon, /light: require\('\.\.\/\.\.\/assets\/brand\/mindknowt-tag-mark\.png'\)/);
  assert.match(icon, /heavy: require\('\.\.\/\.\.\/assets\/brand\/mindknowt-tag-mark-heavy\.png'\)/);
  // One name for callers. A screen asks for the mark, not for a weight.
  assert.ok(!list.includes('heavy') && !ui.includes('Heavy'), 'a screen picks the weight');
});

check('the heavy one is what gets drawn under 24 points', () => {
  assert.equal(HEAVY_BELOW, 24);
  assert.match(icon, /box < HEAVY_BELOW \? art\.heavy : art\.light/);
  // Every size the app actually draws it at is under the line, so the thin
  // one is kept for a large use rather than being dead weight.
  for (const size of [
    iconSizeForText(theme.font.size.md, BAND.ascender),
    iconSizeForText(theme.font.size.lg, BAND.ascender),
    iconSizeForText(theme.font.size.xs, BAND.chip),
    15,
    18,
  ]) {
    assert.ok(size < HEAVY_BELOW, `${size} would take the thin one`);
  }
});

// Sizing and the baseline.

check('a mark and a glyph are the same height at the same size', () => {
  for (const size of [13.5, 15, 15.5, 17.5, 18]) {
    // `Icon` gives a mark a box that is its ink, and an Ionicon's ink is a
    // known fraction of its own box, so one number sizes both.
    assert.equal(markLayout(size).height, inkHeight(size));
  }
});

check('the mark’s box bottom is the ink’s bottom', () => {
  // Which is the whole trick: a `baseline` row aligns a view by its bottom
  // edge, so the drawing lands on the text baseline with nothing to tune.
  const at18 = markLayout(18);
  near(at18.bottom, -MARK.padBottom * at18.image, 0.0001, 'the overhang');
  // The padding hangs below the box rather than being inside it.
  assert.ok(at18.bottom < 0 && at18.left < 0);
  near(at18.image * MARK.ink, at18.height, 0.0001, 'the ink fills the box');
});

check('every row that mixes the two sits them on one line', () => {
  for (const [name, source] of [
    ['the Knowts list', list],
    ['a Daily card', card],
    ['the Mode row', row],
    ['a chip and a button', ui],
  ] as const) {
    assert.match(source, /alignItems: 'baseline'/, `${name} still centers them`);
  }
  // The button keeps its own centering, because baseline on a 52 point box
  // would stack the pair against the top of it.
  assert.match(ui, /buttonInner: \{\n\s+flexDirection: 'row',\n\s+alignItems: 'baseline',/);
  assert.match(ui, /height: 52,\n\s+alignItems: 'center',\n\s+justifyContent: 'center',/);
});

/**
 * The two shapes the Mode row matches on, measured off the font and the file.
 *
 * Python again, and connected components rather than a bounding box, because
 * what has to match is the clock's face and the tag's rectangle, not the
 * glyphs around them. The face is the largest enclosed hole in the alarm
 * grown by one stroke on each side; the rectangle is the largest connected
 * run of ink in the mark, the signal waves being their own pieces.
 */
function shapes(): {
  face: number;
  faceCenter: number;
  rect: number;
  rectCenter: number;
} {
  const out = execFileSync('python3', ['-I', '-c', `
from PIL import Image, ImageFont, ImageDraw
ROOT = ${JSON.stringify(ROOT)}
TTF = ROOT + '/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf'
EM, S = 512, 4

# The center column, which is the cheap way to measure these two shapes and
# the reason this runs in a second rather than a minute. The alarm's bells sit
# at the top left and top right and its feet at the bottom corners, so a column
# down the middle meets the clock face's top stroke, the hands, and the face's
# bottom stroke, and nothing else. The tag's signal waves hang off the top
# right, so a column down the middle of the mark meets only its rectangle.
font = ImageFont.truetype(TTF, EM*S)
asc, desc = font.getmetrics()
pad = EM*S//2
img = Image.new('L', (EM*S*2, EM*S*2), 0)
ImageDraw.Draw(img).text((pad, pad), chr(0xf10d), font=font, fill=255)
bb = img.getbbox(); px = img.load()
cx = (bb[0]+bb[2])//2
col = [y for y in range(bb[1], bb[3]+1) if px[cx, y] > 128]
baseline = pad + asc
print((col[-1]-col[0]+1)/S/EM)
print((baseline-(col[0]+col[-1])/2)/S/EM)

mark = Image.open(ROOT + '/assets/brand/mindknowt-tag-mark.png').convert('RGBA').split()[3]
mp = mark.load(); box = mark.getbbox()
mcx = (box[0]+box[2])//2
mcol = [y for y in range(box[1], box[3]+1) if mp[mcx, y] >= 128]
ink = box[3]-box[1]
print((mcol[-1]-mcol[0]+1)/ink)
print((box[3]-(mcol[0]+mcol[-1])/2)/ink)
`], { encoding: 'utf8' });
  const [face, faceCenter, rect, rectCenter] = out
    .trim()
    .split('\n')
    .map(Number) as number[];
  return {
    face: face!,
    faceCenter: faceCenter!,
    rect: rect!,
    rectCenter: rectCenter!,
  };
}

check('the shape ratios are the font\u2019s and the file\u2019s', () => {
  const m = shapes();
  // The constants come from the hole in the face grown by one stroke; this
  // measures the outermost ink down the middle. They are the same circle, so
  // they agree to within a unit of 512.
  near(SHAPE.clockFace, m.face, 0.003, 'clock face over the em box');
  near(SHAPE.clockFaceCenter, m.faceCenter, 0.003, 'clock face center');
  near(SHAPE.markRect, m.rect, 0.001, 'tag rectangle over the ink');
  near(SHAPE.markRectCenter, m.rectCenter, 0.001, 'tag rectangle center');
  // The ink fraction the rest of the math already leans on.
  near(IONICON.ink, 386 / 512, 0.004, 'ionicon ink');
});

check('the two shapes come out the same height on the Mode row', () => {
  // The whole point. One size for both put the face at 12.02 and the
  // rectangle at 10.54, which is 12 percent apart on the pair of shapes the
  // eye is comparing.
  const clock = iconSizeForText(18, BAND.ascender);
  const mark = sizeForMarkRect(clockFaceHeight(clock));
  assert.equal(clock, 17.5);
  assert.equal(mark, 20);
  const face = clockFaceHeight(clock);
  const rect = markRectHeight(mark);
  assert.ok(Math.abs(face - rect) < 0.1, `${face.toFixed(2)} against ${rect.toFixed(2)}`);
  // And the old single size really was the gap this fixes.
  assert.ok(clockFaceHeight(clock) - markRectHeight(clock) > 1.4);
});

check('equal heights put the pair on one vertical center', () => {
  // Both shapes end on the baseline, so matching their heights matches their
  // centers. That is why the row needs no transform to line the pair up.
  const clock = iconSizeForText(18, BAND.ascender);
  const mark = sizeForMarkRect(clockFaceHeight(clock));
  const faceCenter = clock * SHAPE.clockFaceCenter;
  const rectCenter = mark * IONICON.ink * SHAPE.markRectCenter;
  assert.ok(
    Math.abs(faceCenter - rectCenter) < 0.2,
    `${faceCenter.toFixed(2)} against ${rectCenter.toFixed(2)}`,
  );
});

check('both glyph boxes still fit the row that keeps the cards level', () => {
  const clock = iconSizeForText(18, BAND.ascender);
  const mark = sizeForMarkRect(clockFaceHeight(clock));
  // The mark's box is its ink; the Ionicon's is a line box, 1.115 em for this
  // font. The row is a fixed 22, which is what makes the three cards equal.
  assert.ok(markLayout(mark).height < 22, 'the mark overflows the row');
  assert.ok(clock * 1.115 < 22, 'the clock overflows the row');
  assert.match(row, /height: 22,/);
  // And the gap between them, and the card's own gap to the label, are the
  // same for all three cards because there is one of each.
  assert.match(row, /gap: 3,/);
  assert.match(row, /  card: \{[\s\S]{0,200}gap: theme\.spacing\.xs,/);
});

check('the Mode row draws its pair at one size and one bottom', () => {
  // One size for the pair and for a single, sized to the `lg` text band.
  // Two sizes, one per shape, because one size matched the wrong thing.
  assert.match(row, /size=\{sizeOf\(glyph\)\}/);
  assert.match(row, /const CLOCK = iconSizeForText\(theme\.font\.size\.lg, BAND\.ascender\);/);
  assert.match(row, /const MARK = sizeForMarkRect\(clockFaceHeight\(CLOCK\)\);/);
  assert.match(row, /glyph === 'knowtTag' \? MARK : CLOCK/);
  assert.match(row, /glyphs: \{\n\s+flexDirection: 'row',[\s\S]{0,140}alignItems: 'baseline',\n\s+justifyContent: 'center',/);
  // Equal ink heights, and strokes within a fifth of a point of each other.
  assert.equal(inkHeight(15), markLayout(15).height);
  assert.ok(markStroke(15, true) > ioniconStroke(15) * 0.8);
  assert.ok(markStroke(15, false) < ioniconStroke(15) * 0.6, 'the thin one matched');
});

// The names, and the pin that used to move them.

check('a Knowt name starts at the same x whether or not it is pinned', () => {
  // The row is: 8 of padding, a 30 point category icon, an 8 point gap, then
  // the text. Nothing between the gap and the name, in any row.
  const pin = list.indexOf('<Icon name="pin"');
  const titleOpen = list.indexOf('<View style={styles.rowTitle}>');
  const name = list.indexOf('{knowt.name}');
  assert.ok(pin > 0 && pin < titleOpen, 'the pin is still in front of the name');
  const title = list.slice(titleOpen, name);
  assert.ok(!title.includes('<Icon'), 'a glyph still precedes the name');
  assert.ok(!title.includes('pinned'), 'the title row still branches on pinned');

  // It is a badge on the icon instead, which costs no width at all.
  assert.match(list, /rowPin: \{ position: 'absolute', top: -4, left: -4 \}/);
  assert.match(list, /<View style=\{styles\.rowPin\}>/);

  // And the arithmetic, so a later edit that reserves a slot has to say so.
  const padding = 8;
  const categoryIcon = 30;
  const gap = 8;
  const nameX = padding + categoryIcon + gap;
  assert.equal(nameX, 46);
  // What it used to be with the pin in front of the name: the glyph's 11
  // points and the title row's 4 point gap.
  assert.equal(nameX + 11 + 4, 61);
});

check('the mark beside a name is the name’s own band', () => {
  assert.match(list, /const NAME_GLYPH = iconSizeForText\(theme\.font\.size\.md, BAND\.ascender\);/);
  const size = iconSizeForText(theme.font.size.md, BAND.ascender);
  // Bottom on the baseline, top at the height of b, l and k.
  near(inkHeight(size), theme.font.size.md * BAND.ascender, 0.3, 'the band');
  // Shorter than it was: a 16 point box of a mark whose ink is 90 percent of
  // its canvas drew 14.5 points of ink against 11.7 of letters.
  assert.ok(inkHeight(size) < 16 * MARK.ink, 'it did not shrink to the band');
});

check('the mark takes the category icon’s color, not its own', () => {
  // Both are `shades.ink`, so a row in any category is one color.
  assert.match(list, /<CategoryIcon icon=\{knowt\.category\?\.icon\} shades=\{shades\} size=\{30\} \/>/);
  assert.match(read('src/components/CategoryIcon.tsx'), /color=\{solid \? '#FFFFFF' : shades\.ink\}/);
  assert.match(list, /name="knowtTag" size=\{NAME_GLYPH\} color=\{shades\.ink\}/);
  assert.match(list, /<Icon name="pin" size=\{11\} color=\{shades\.ink\} \/>/);
});

// Chips.

check('every chip is the same height, with a glyph or without', () => {
  // A chip is its text plus 2 points of padding and a 1 point border, top and
  // bottom. The glyph only mattered because it was taller than the text.
  const text = theme.font.size.xs * LINE_BOX;
  const before = Math.max(text, 18) + 2 * 2 + 1 * 2;
  const after = Math.max(text, inkHeight(iconSizeForText(theme.font.size.xs, BAND.chip))) + 2 * 2 + 1 * 2;
  assert.ok(before - after > 2, `the Tagged chip only lost ${before - after}`);
  assert.equal(after, text + 6, 'the glyph still sets the height');
  assert.match(ui, /const CHIP_GLYPH = iconSizeForText\(theme\.font\.size\.xs, BAND\.chip\);/);
});

check('the chip glyph is cap height and a little, and no larger', () => {
  const size = iconSizeForText(theme.font.size.xs, BAND.chip);
  const ink = inkHeight(size);
  const cap = theme.font.size.xs * BAND.cap;
  assert.ok(ink > cap, `${ink} is under the cap height`);
  assert.ok(ink < cap + 2, `${ink} is more than a little over ${cap}`);
  // And under the line the word already draws, which is what keeps the
  // heights equal.
  assert.ok(ink < theme.font.size.xs * LINE_BOX);
});

check('one padding, one radius, one font size for all of them', () => {
  // There is one chip component, so this is really a check that no screen
  // grew its own.
  const pill = ui.slice(ui.indexOf('  pill: {'), ui.indexOf('  pillText: {'));
  assert.match(pill, /borderRadius: theme\.radius\.pill/);
  assert.match(pill, /paddingVertical: 2/);
  assert.match(pill, /paddingHorizontal: theme\.spacing\.md/);
  // The category chip carries its swatch as a dot now, matching the filter
  // pills on Knowts, so every chip in the row is white with the same border
  // and one text color. The fill it had was the fix for drawing a swatch as
  // text, which failed 4.5 to 1 for five of the seven and was invisible for
  // Daily; the dot keeps that fixed without painting one chip in three.
  assert.doesNotMatch(ui, /backgroundColor: color/);
  assert.match(pill, /backgroundColor: theme\.color\.surface/);
  assert.match(pill, /borderWidth: 1/);
  // The two leading elements take their own gap, because the dot matches the
  // filter pills at `sm` and the glyph keeps the `xs` it had.
  assert.doesNotMatch(pill, /\n\s+gap: /);
  assert.match(ui, /pillDot: \{\n\s+alignSelf: 'center',\n\s+marginRight: theme\.spacing\.sm,/);
  assert.match(ui, /pillGlyph: \{ marginRight: theme\.spacing\.xs \},/);
  const detail = read('src/screens/KnowtDetailScreen.tsx');
  assert.ok(!/style=\{styles\.pill[^s]/.test(detail), 'a screen styles its own chip');
});

check('three chips in a row stay as they are on a small iPhone', () => {
  /** Advances per 1000 em, SF Pro, for the characters these labels use. */
  const advance: Record<string, number> = {
    S: 598, A: 636, T: 580, '+': 600, ' ': 232,
    a: 544, c: 526, d: 598, e: 541, g: 572, l: 262, m: 898,
    n: 597, o: 598, r: 388, t: 370, u: 597, y: 530,
  };
  const widthAt = (text: string, points: number) => {
    let em = 0;
    for (const character of text) {
      const value = advance[character];
      assert.ok(value, `no advance recorded for "${character}"`);
      em += value;
    }
    return (em / 1000) * points;
  };

  // The detail screen at 320 points, 16 of page padding each side.
  const available = 320 - 16 * 2;
  // A chip is its label plus 8 of padding each side and a 1 point border.
  const chip = (label: string) => widthAt(label, theme.font.size.xs) + 8 * 2 + 2;
  const widest = chip('Scan + Alarm');
  const uniform = widest * 3 + theme.spacing.sm * 2;
  assert.ok(
    uniform > available,
    `three equal chips measure ${uniform.toFixed(0)}, which fits ${available}`,
  );
  // So they are not forced to one width. Heights are equal, widths are not,
  // and the row wraps rather than truncating a category nobody can shorten.
  assert.match(read('src/screens/KnowtDetailScreen.tsx'), /flexWrap: 'wrap'/);
  assert.ok(!ui.includes('minWidth'), 'a chip was given a common width');
});

console.log(`\n${passed} checks passed`);
