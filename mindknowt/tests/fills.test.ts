/**
 * What a solid dark shape is filled with, and what text is set in.
 *
 * One token did both. `theme.color.primary` is `palette.ink`, near black, and
 * it was the fill on every primary button, the round plus, the selected filter
 * pill, the Browse presets capsule, two selected states on the schedule editor,
 * the checked box on Apply set, two screen buttons and the calendar's ring
 * marks, as well as being the color of headings and body text.
 *
 * At the size of a button or a capsule near black reads as a hole punched in
 * the page rather than as something drawn on it, which is the same reason no
 * chart fill in this app uses it. Fills now take `fillStrong`, and text keeps
 * `ink`, because a letterform is thin enough that the extra weight is what
 * makes it read.
 *
 * This file is the guard on both halves: it walks every file under `src/` and
 * fails if any `backgroundColor` resolves to near black or pure black, and it
 * fails if a text token stops pointing at `ink`.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs fills.test.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');

const { palette } = await import(`${ROOT}/src/theme/palette.ts`);
const { CATEGORY_COLORS: categoryColors } = await import(
  `${ROOT}/src/theme/categoryColors.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function luminance(hex: string): number {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const channels = [1, 3, 5].map((at) => parseInt(full.slice(at, at + 2), 16) / 255);
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

/** Every `.ts` and `.tsx` under `src/`, by repository relative path. */
function sources(dir = 'src'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(`${ROOT}/${dir}`)) {
    const path = `${dir}/${name}`;
    if (statSync(`${ROOT}/${path}`).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

const FILES = sources();

// --- The two values, and what each is for. -------------------------------

check('the fill token is #343434 and the text token is still near black', () => {
  assert.equal(palette.fillStrong.toUpperCase(), '#343434');
  assert.equal(palette.ink.toUpperCase(), '#111111');
  assert.notEqual(palette.fillStrong, palette.ink);
  // One new value and no others: nothing else in the palette moved.
  assert.equal(palette.card.toUpperCase(), '#FFFFFF');
  assert.equal(palette.charcoal.toUpperCase(), '#3A3A3A');
  assert.equal(palette.neon.toUpperCase(), '#D9FA3C');
});

check('white on the fill clears 4.5 to 1 with room to spare', () => {
  const ratio = contrast(palette.card, palette.fillStrong);
  assert.ok(ratio >= 4.5, `measured ${ratio.toFixed(2)}`);
  // About 12.4. Near black was 18.88, so this gives up nothing that matters.
  assert.ok(ratio > 12 && ratio < 13, `measured ${ratio.toFixed(2)}`);
});

check('a selected pill still clears 3 to 1 against an unselected white one', () => {
  const ratio = contrast(palette.fillStrong, palette.card);
  assert.ok(ratio >= 3, `measured ${ratio.toFixed(2)}`);
});

check('the fill is lighter than near black but still unmistakably dark', () => {
  assert.ok(luminance(palette.fillStrong) > luminance(palette.ink));
  // Against the page, not just against white, because most of these sit on it.
  assert.ok(contrast(palette.fillStrong, palette.page) >= 4.5);
});

// --- The tokens are wired the way they are meant to be. ------------------

check('the theme names a fill token and keeps the text tokens on ink', () => {
  const theme = read('src/theme/index.ts');
  assert.match(theme, /fillStrong: palette\.fillStrong,/);
  // Unchanged, every one of them.
  assert.match(theme, /textPrimary: palette\.ink,/);
  assert.match(theme, /primary: palette\.ink,/);
  assert.match(theme, /onHighlight: palette\.ink,/);
  assert.match(theme, /accent: palette\.ink,/);
  assert.match(theme, /onPrimary: palette\.card,/);
  assert.match(theme, /onAccent: palette\.card,/);
  assert.match(theme, /textSecondary: palette\.charcoal,/);
  assert.match(theme, /textMuted: palette\.gray,/);
});

// --- No fill anywhere goes back. ----------------------------------------

/** Token names that resolve to near black. */
const NEAR_BLACK = [
  'theme.color.primary',
  'theme.color.accent',
  'theme.color.textPrimary',
  'theme.color.textBody',
  'theme.color.onHighlight',
  'palette.ink',
];

check('no backgroundColor in the app resolves to near black or pure black', () => {
  const offenses: string[] = [];
  for (const path of FILES) {
    const src = read(path);
    for (const match of src.matchAll(/backgroundColor:\s*([^,\n}]+)/g)) {
      const value = (match[1] ?? '').trim();
      // A token by name. `primaryDisabled` and `accentDisabled` are light
      // gray, so the comparison is exact rather than a prefix.
      for (const token of NEAR_BLACK) {
        if (value === token) offenses.push(`${path}: ${value}`);
      }
      // A hex literal, judged by what it actually is rather than by its
      // spelling, so '#000', '#000000', '#010101' and 'black' are all caught.
      const hex = /^'(#[0-9a-fA-F]{3,8})'$/.exec(value)?.[1];
      if (hex && luminance(hex) < 0.02) offenses.push(`${path}: ${value}`);
      if (/^'black'$/.test(value)) offenses.push(`${path}: ${value}`);
    }
  }
  assert.deepEqual(offenses, [], `near black fills:\n${offenses.join('\n')}`);
});

check('and every shape that had one is on the fill token', () => {
  // Named one at a time, so reverting any single screen fails here even if the
  // sweep above still passes because the value became some other dark color.
  const expected: [string, string][] = [
    ['src/components/ui.tsx', 'button'],
    ['src/navigation/CapsuleTabBar.tsx', 'add'],
    ['src/screens/AllKnowtsScreen.tsx', 'chipOn'],
    ['src/screens/AllKnowtsScreen.tsx', 'presets'],
    ['src/screens/AddKnowtScreen.tsx', 'presets'],
    ['src/screens/EditScheduleScreen.tsx', 'chipOn'],
    ['src/screens/EditScheduleScreen.tsx', 'dayOn'],
    ['src/screens/ApplySetScreen.tsx', 'boxChecked'],
    ['src/screens/AlarmScreen.tsx', 'button'],
    ['src/screens/ScanScreen.tsx', 'button'],
    ['src/components/MonthCalendar.tsx', 'markOn'],
    ['src/components/MonthCalendar.tsx', 'markOnSelected'],
  ];
  for (const [path, style] of expected) {
    const src = read(path);
    const at = src.indexOf(`  ${style}: {`);
    const block =
      at >= 0
        ? src.slice(at, src.indexOf('\n  },', at))
        : // A one line style: `markOn: { ... },`
          /.*/.exec(src.slice(src.indexOf(`  ${style}: {`)))?.[0] ?? '';
    assert.match(
      block,
      /theme\.color\.fillStrong/,
      `${path} ${style} is not on the fill token`,
    );
  }
});

check('the labels and glyphs on those fills are still white', () => {
  const ui = read('src/components/ui.tsx');
  assert.match(ui, /variant === 'primary' \? theme\.color\.onPrimary : theme\.color\.textPrimary;/);
  assert.match(read('src/screens/ApplySetScreen.tsx'), /tick: \{ color: theme\.color\.onAccent/);
  assert.match(read('src/screens/EditScheduleScreen.tsx'), /chipTextOn: \{ color: theme\.color\.onAccent \},/);
  assert.match(read('src/screens/AllKnowtsScreen.tsx'), /chipTextOn: \{ color: theme\.color\.onPrimary \},/);
});

// --- What was deliberately left alone. -----------------------------------

check('a shadow is not a fill, so the shadows keep near black', () => {
  // A shadow is near black at low opacity everywhere, which is what a shadow
  // is. Lightening it would only make it weaker.
  assert.match(read('src/navigation/CapsuleTabBar.tsx'), /shadowColor: '#111111',/);
  assert.match(read('src/theme/index.ts'), /shadowColor: '#111111',/);
});

check('the chart fill was already not near black, and did not move', () => {
  // `graph` is #2E3236, chosen because a solid dark bar reads as a hole in the
  // card. It is a dark slate rather than a near black and is not in this sweep.
  assert.equal(palette.graph.toUpperCase(), '#2E3236');
  assert.ok(luminance(palette.graph) > luminance(palette.ink));
});

check('every category swatch is untouched', () => {
  // None of them was ever near black, and a swatch is the one color the person
  // may have chosen themselves.
  for (const [key, hex] of Object.entries(categoryColors)) {
    assert.ok(luminance(hex as string) > 0.02, `${key} ${hex}`);
  }
});

console.log(`\n${passed} checks passed`);
