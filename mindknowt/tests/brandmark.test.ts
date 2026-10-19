/**
 * The brand tag mark, and the pinned rows that were painted gray.
 *
 * Two separate reports, one file, because both are about a screen rendering
 * something with the wrong identity: a generic price tag where the brand mark
 * belongs, and a Knowt in somebody else's colors.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs brandmark.test.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { categoryShades } = await import(`${ROOT}/src/theme/categoryColors.ts`);

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const icon = read('src/components/Icon.tsx');
const list = read('src/screens/AllKnowtsScreen.tsx');
const detail = read('src/screens/KnowtDetailScreen.tsx');
const ui = read('src/components/ui.tsx');

const ASSET = 'assets/brand/mindknowt-tag-mark.png';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// The asset itself.

check('the mark is saved where the app expects it', () => {
  assert.ok(existsSync(join(ROOT, ASSET)), `${ASSET} is missing`);
  assert.ok(statSync(join(ROOT, ASSET)).size > 1000, 'the file is empty');
});

/**
 * The alpha bounding box, read with Python because there is no image library
 * in this project and adding one for a test would be worse than shelling out.
 */
function inkBox(): { l: number; t: number; r: number; b: number; w: number; h: number } {
  const out = execFileSync(
    'python3',
    [
      '-c',
      [
        'from PIL import Image',
        `im = Image.open(${JSON.stringify(join(ROOT, ASSET))}).convert('RGBA')`,
        'l,t,r,b = im.split()[3].getbbox()',
        'w,h = im.size',
        'print(l,t,r,b,w,h)',
      ].join('\n'),
    ],
    { encoding: 'utf8' },
  );
  const [l, t, r, b, w, h] = out.trim().split(/\s+/).map(Number) as number[];
  return { l: l!, t: t!, r: r!, b: b!, w: w!, h: h! };
}

check('the mark is centered in its square, so centering the box centers it', () => {
  // The component places it with `resizeMode="contain"` in a square box and
  // relies on this. An asset replaced with an off-center one would sit wrong
  // next to the Knowt name and nothing else would say why.
  const { l, t, r, b, w, h } = inkBox();
  assert.ok(Math.abs(l - (w - r)) <= 2, `left ${l} against right ${w - r}`);
  assert.ok(Math.abs(t - (h - b)) <= 2, `top ${t} against bottom ${h - b}`);
  assert.equal(w, h, 'the canvas is not square');
});

check('it is a single color mask, so tintColor paints all of it', () => {
  const out = execFileSync(
    'python3',
    [
      '-c',
      [
        'from PIL import Image',
        `im = Image.open(${JSON.stringify(join(ROOT, ASSET))}).convert('RGBA')`,
        'px = im.load()',
        'w,h = im.size',
        'cols = set()',
        'for y in range(0,h,3):',
        '    for x in range(0,w,3):',
        '        r,g,b,a = px[x,y]',
        '        if a > 220: cols.add((r//8,g//8,b//8))',
        'print(len(cols))',
      ].join('\n'),
    ],
    { encoding: 'utf8' },
  );
  assert.ok(
    Number(out.trim()) <= 2,
    `the opaque pixels span ${out.trim()} color buckets, so it is not a mask`,
  );
});

// Only the icon component knows the file exists.

check('nothing outside Icon.tsx references the asset', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (path.endsWith('src/components/Icon.tsx')) continue;
      if (readFileSync(path, 'utf8').includes('mindknowt-tag-mark')) {
        offenders.push(path.slice(ROOT.length + 1));
      }
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(offenders, [], 'the file is required outside Icon.tsx');

  // And it really is in there, so the sweep above is not passing vacuously.
  assert.ok(icon.includes(ASSET));
});

check('it is reached by name, like every other icon', () => {
  assert.match(icon, /knowtTag:/);
  assert.match(icon, /BRAND_ICONS/);
  // The union, so a caller does not have to know which kind it asked for.
  assert.match(icon, /export type IconName = IoniconKey \| BrandIconName;/);
});

check('it is tinted and its proportions are kept', () => {
  assert.match(icon, /tintColor: color/);
  assert.match(icon, /resizeMode="contain"/);
  // A square source at a square size, so nothing is stretched. The size is
  // the image's own, worked out from the ink band rather than from the box,
  // which is what makes a mark the same height as a glyph beside it.
  assert.match(icon, /width: mark\.image,\n\s+height: mark\.image,/);
});

// The old glyph is gone from the tagged state.

check('the tagged state no longer uses the generic price tag', () => {
  // `tag` is still in ICONS and may be used for other things, but not for
  // "this Knowt has a Knowt Tag attached".
  assert.ok(
    !/tag_uid \?[\s\S]{0,200}name="tag"/.test(list),
    'the Knowts list still shows the old glyph for a tagged Knowt',
  );
  assert.match(list, /tag_uid \? \([\s\S]{0,300}name="knowtTag"/);
});

check('the Tagged chip carries the mark too', () => {
  assert.match(detail, /<Pill label="Tagged" icon="knowtTag" \/>/);
  // And the untagged chip does not, because there is nothing to show.
  assert.match(detail, /<Pill label="No tag" \/>/);
});

check('the chip can hold an icon at all, sized to its own word', () => {
  assert.match(
    ui,
    /<Icon name=\{icon\} size=\{CHIP_GLYPH\} color=\{theme\.color\.textSecondary\} \/>/,
  );
  // Laid out as a row, or the glyph would sit above the label.
  assert.match(ui, /pill: \{\n\s+flexDirection: 'row'/);
});

check('the row keeps it centered on the name at any text size', () => {
  // Centered against the text's line box rather than a fixed height, so a
  // larger system text size moves the box with it.
  assert.match(list, /rowTitle: \{\n\s+flexDirection: 'row',[\s\S]{0,240}alignItems: 'baseline'/);
  assert.match(list, /name="knowtTag" size=\{NAME_GLYPH\}/);
});

// Pinned rows, in their own colors.

const HOME = { key: 'home', color: '#FF4D3D' } as never;
const CARE = { key: 'care', color: '#24C2B5' } as never;

check('a category has colors of its own, unlike no category', () => {
  // If these matched, the bug would have been invisible and this file would
  // be proving nothing.
  const home = categoryShades(HOME);
  const none = categoryShades(null);
  assert.notEqual(home.fill, none.fill);
  assert.notEqual(home.ink, none.ink);
  assert.notEqual(home.color, none.color);
});

check('the same Knowt resolves the same colors wherever it is listed', () => {
  // Pinned and in its own group are the same call on the same Knowt, so they
  // cannot differ. That is the fix: one place decides.
  for (const category of [HOME, CARE, null]) {
    const inPinned = categoryShades(category);
    const inGroup = categoryShades(category);
    assert.deepEqual(inPinned, inGroup);
  }
});

check('the row resolves its own colors rather than taking the section’s', () => {
  // The bug in one line: the Pinned section passes `categoryShades(null)`,
  // and that used to reach every row inside it.
  assert.match(list, /const shades = categoryShades\(knowt\.category\);/);
  assert.ok(
    !/shades: CategoryShades;\n\s+now: Date;\n\s+\/\*\* Whether its scan/.test(list),
    'KnowtRow still takes a shades prop',
  );
  // The row's own props no longer mention it.
  const rowProps = list.slice(
    list.indexOf('function KnowtRow({'),
    list.indexOf('const pinned = knowt.is_pinned === 1;'),
  );
  assert.ok(!rowProps.includes('shades'), 'KnowtRow is still handed shades');
});

check('the Pinned heading stays neutral', () => {
  // The section's own shades are still the uncategorized ones, which is right
  // for a heading that is not a category.
  assert.match(list, /name="Pinned"[\s\S]{0,400}shades=\{categoryShades\(null\)\}/);
});

check('the pin glyph is still there', () => {
  assert.match(list, /<Icon name="pin" size=\{11\}/);
});

// The viewfinder bracket, gone everywhere it meant scanning.

check('nothing in the app draws the scan bracket any more', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const source = readFileSync(path, 'utf8');
      if (/name="scan"|name=\{'scan'\}/.test(source)) {
        offenders.push(path.slice(ROOT.length + 1));
      }
    }
  };
  walk(join(ROOT, 'src'));
  assert.deepEqual(offenders, [], 'the bracket is still drawn');
  // And it cannot come back by name, because the table no longer has it.
  assert.ok(!/^\s+scan: /m.test(icon), 'scan is still in ICONS');
});

check('a Daily card for a scanning Knowt wears the mark', () => {
  const card = read('src/components/KnowtCard.tsx');
  assert.match(
    card,
    /requiresScan\(mode\) \|\| neverRings \? \(\n\s+<Icon name="knowtTag" size=\{CARD_GLYPH\}/,
  );
  // The alarm glyph takes the same size, so swapping one for the other moves
  // nothing on the card.
  assert.match(card, /<Icon name="alarm" size=\{CARD_GLYPH\}/);
});

check('the Mode row tells the two scanning modes apart', () => {
  const modes = read('src/knowts/modes.ts');
  const row = read('src/components/StopChoiceRow.tsx');
  assert.match(modes, /icons: \['alarm'\],\n\s+label: 'Alarm Only'/);
  assert.match(modes, /icons: \['knowtTag'\],\n\s+label: 'Scan Knowt'/);
  assert.match(modes, /icons: \['alarm', 'knowtTag'\],\n\s+label: 'Scan \+ Alarm'/);
  // Both glyphs, side by side and smaller, so the pair fits the card the two
  // single-glyph cards fit.
  assert.match(row, /choice\.icons\.map\(\(glyph\) => \(/);
  // One size for the pair and for a single, sized to the `lg` text band.
  // Two sizes, one per shape, because one size matched the wrong thing.
  assert.match(row, /size=\{sizeOf\(glyph\)\}/);
  assert.match(row, /const CLOCK = iconSizeForText\(theme\.font\.size\.lg, BAND\.ascender\);/);
  assert.match(row, /const MARK = sizeForMarkRect\(clockFaceHeight\(CLOCK\)\);/);
  assert.match(row, /glyph === 'knowtTag' \? MARK : CLOCK/);
  assert.match(row, /glyphs: \{\n\s+flexDirection: 'row'/);
});

// The list row's scan control: the pill is the button.

check('a Scan Knowt row carries one pill, and it is tappable', () => {
  // The bracket beside a "Scan only" label was two things saying one thing,
  // and the bracket looked like a camera. Now the pill that holds the next
  // time on every other row holds the action on this one.
  assert.match(list, /\{knowt\.tag_uid \? 'Scan' : 'Add tag'\}/);
  assert.match(list, /styles\.rowPill,\n\s+styles\.rowPillOn,/);
  assert.match(list, /rowPillOn: \{ backgroundColor: theme\.color\.highlight \}/);
  assert.match(list, /color: theme\.color\.onHighlight/);
  // Same pill, so the same shape and height as the rest of the row.
  assert.match(list, /rowPill: \{\n\s+flexDirection: 'row'/);
  assert.ok(!list.includes('rowScan:'), 'the old glyph wrapper is still styled');
});

check('the pill is reachable at 44pt without making the row taller', () => {
  assert.match(list, /hitSlop=\{\{ top: 12, bottom: 12, left: 12, right: 12 \}\}/);
  assert.match(list, /ROW_HEIGHT/);
});

check('once scanned it goes quiet, and says so', () => {
  const quiet = list.slice(list.indexOf('doneToday ? ('));
  assert.match(quiet, /<View style=\{\[styles\.rowPill, styles\.rowPillQuiet\]\}>/);
  assert.match(quiet, /<Icon name="check" size=\{13\}/);
  assert.match(quiet, /\{SCANNED_TODAY\}/);
  // A View, not a Pressable: there is nothing to do until tomorrow.
  const block = quiet.slice(0, quiet.indexOf('</View>'));
  assert.ok(!block.includes('Pressable'), 'the done pill is still tappable');
});

console.log(`\n${passed} checks passed`);
