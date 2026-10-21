/**
 * The two reading cards on Log: Peak time and Avg complete time.
 *
 * Every color is asserted as a named token rather than as a literal in the
 * component, which is the part a screenshot cannot tell you and the part that
 * drifts, and every one of them is measured against the surface it actually
 * lands on. The cards are white now, so the figures carry the emphasis that a
 * pale lime fill used to carry, and a colored figure on white is exactly the
 * thing that fails a contrast floor quietly.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs factcards.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { palette } = await import(`${ROOT}/src/theme/palette.ts`);

const panel = readFileSync(`${ROOT}/src/components/PeriodPanel.tsx`, 'utf8');
const icons = readFileSync(`${ROOT}/src/components/Icon.tsx`, 'utf8');
const themeSource = readFileSync(`${ROOT}/src/theme/index.ts`, 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** sRGB relative luminance, the way WCAG defines it. */
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

check('the pale lime is in the palette, at the branding value', () => {
  assert.equal(palette.neonPale.toUpperCase(), '#F1FFBE');
});

check('it is paler than the tint it replaced, which is paler than the neon', () => {
  // One family, three steps. A card, a panel and a control.
  assert.ok(luminance(palette.neonPale) > luminance(palette.neonTint));
  assert.ok(luminance(palette.neonTint) > luminance(palette.neon));
});

// The cards are white, and the lime is down to one badge.

check('neither card is filled any more', () => {
  const style = panel.slice(panel.indexOf('  factCard: {'), panel.indexOf('  factHead: {'));
  assert.doesNotMatch(style, /backgroundColor/, 'the fact card is still tinted');
  // It inherits the one every other card on the screen uses, so the radius,
  // the padding and the surface cannot drift from the Completion trend card
  // above it or the category card below it.
  assert.match(panel, /<View style=\{\[styles\.card, styles\.factCard\]\}>/);
  assert.match(panel, /  card: \{\n\s+backgroundColor: theme\.color\.surface/);
});

check('the lime is the badge, and the mark on it is ink', () => {
  assert.match(panel, /backgroundColor: theme\.color\.highlight,/);
  assert.match(panel, /<Icon name=\{icon\} size=\{16\} color=\{theme\.color\.textPrimary\} \/>/);
  // 15.9 to 1. The neon is bright enough to take ink and nothing paler.
  assert.ok(contrast(palette.neon, palette.ink) > 7);
  assert.ok(contrast(palette.neon, palette.gray) < 4.5, 'gray would not carry');
});

check('each value takes the color of the tile that counts the same thing', () => {
  // Peak time against the completion rate tile, Avg complete time against
  // Knowts completed. Named, so a palette change moves both together.
  assert.match(panel, /tint=\{theme\.color\.tileLavenderInk\}/);
  assert.match(panel, /tint=\{theme\.color\.tileMintInk\}/);
  assert.match(themeSource, /tileLavenderInk: palette\.lavenderInk/);
  assert.match(themeSource, /tileMintInk: palette\.mintInk/);
  assert.match(panel, /style=\{\[styles\.factValue, \{ color: tint \}\]\}/);
});

check('both of those clear 4.5 to 1 on a white card', () => {
  // The reason neither needed the darker shade of its own hue.
  const purple = contrast(palette.card, palette.lavenderInk);
  const green = contrast(palette.card, palette.mintInk);
  assert.ok(purple >= 4.5, `purple ${purple.toFixed(2)}`);
  assert.ok(green >= 4.5, `green ${green.toFixed(2)}`);
  // And they are the same two values the tiles above already use, so the
  // screen does not grow a second purple.
  assert.equal(palette.lavenderInk.toUpperCase(), '#5B2ED6');
  assert.equal(palette.mintInk.toUpperCase(), '#1B6A4B');
});

check('the note is the muted gray, which carries on white and did not on lime', () => {
  assert.match(panel, /color: theme\.color\.textMuted,/);
  assert.ok(contrast(palette.card, palette.gray) >= 4.5, 'gray on white');
  // 4.22 on the old tint, which is why it used to be charcoal.
  assert.ok(contrast(palette.neonPale, palette.gray) < 4.5, 'gray on the old lime');
});

check('the cards name tokens, they do not carry values', () => {
  assert.doesNotMatch(
    panel,
    /#[0-9a-fA-F]{3,8}/,
    'a hex literal has appeared in a component',
  );
});

check('the label is the short one, on both cards and every span', () => {
  // One PeriodPanel serves Day, Week and Month, so there is one label to fix.
  assert.match(panel, /title="Avg complete time"/);
  assert.doesNotMatch(panel, /Avg time to complete/);
  assert.match(panel, /title="Peak time"/);
  assert.equal(panel.match(/<FactCard/g)?.length, 2);
});

check('the label keeps the size and the look of the Completion trend heading', () => {
  // One style, used by both, so "same size as the heading above" cannot drift
  // into two numbers that have to be kept equal.
  assert.match(panel, /style=\{\[styles\.cardTitle, styles\.factTitle\]\}/);
  assert.match(panel, /<Text numberOfLines=\{1\} style=\{styles\.cardTitle\}>/);
  const title = panel.slice(panel.indexOf('  cardTitle: {'), panel.indexOf('  trend:'));
  assert.match(title, /fontSize: theme\.font\.size\.xs/);
  assert.match(title, /textTransform: 'uppercase'/);
  assert.match(title, /color: theme\.color\.textMuted/);
  // factTitle adds no size and no color of its own, only room to wrap.
  const extra = panel.slice(panel.indexOf('  factTitle: {'), panel.indexOf('  factValue: {'));
  assert.doesNotMatch(extra, /fontSize|color:/);
});

check('nothing clips, at any span or any text size', () => {
  // Two lines and a shrink floor on both the label and the value, so Dynamic
  // Type at its largest makes them smaller rather than cutting them off.
  // "Under a minute" is the long one: at 27pt it is wider than half a 375pt
  // screen, so it wraps on every phone rather than only on the small ones.
  assert.equal(panel.match(/numberOfLines=\{2\}/g)?.length, 2);
  assert.equal(panel.match(/adjustsFontSizeToFit/g)?.length, 2);
  assert.match(panel, /minimumFontScale=\{0\.85\}/);
  assert.match(panel, /minimumFontScale=\{0\.7\}/);
  // Both heights are reserved, so one card wrapping and the other not cannot
  // leave the two values or the two notes on different lines.
  assert.match(panel, /minHeight: 34/);
  assert.match(panel, /minHeight: 62/);
});

check('the value is the size that was asked for, from a token', () => {
  assert.match(panel, /fontSize: theme\.font\.size\.stat/);
  assert.match(themeSource, /stat: 27,/);
});

check('both marks come from the icon set, and the stopwatch is in it', () => {
  // The rule is one icon component and no glyph drawn anywhere else.
  assert.match(panel, /icon="clock"/);
  assert.match(panel, /icon="stopwatch"/);
  assert.match(icons, /clock: 'time-outline',/);
  assert.match(icons, /stopwatch: 'stopwatch-outline',/);
  assert.doesNotMatch(panel, /from '@expo\/vector-icons/);
});

check('the copy and the numbers are untouched', () => {
  // The restyle moved no data and reworded nothing.
  assert.match(panel, /value=\{summary\.peakHour === null \? '-' : hourRange\(summary\.peakHour\)\}/);
  assert.match(panel, /durationLabel\(summary\.averageMinutes\)/);
  assert.match(panel, /'When most things get done'/);
  assert.match(panel, /'From ringing to done'/);
  assert.match(panel, /'Nothing finished yet'/);
  assert.match(panel, /'Nothing has rung yet'/);
});

check('the label has no exclamation mark and no em dash', () => {
  assert.ok(!'Avg complete time'.includes('!'));
  assert.ok(!panel.includes('—'));
  // Every piece of copy these two cards render, rather than the whole file,
  // which is full of `!==` and `!Number.isFinite`.
  for (const copy of [
    'Peak time', 'Avg complete time',
    'When most things get done', 'From ringing to done',
    'Nothing finished yet', 'Nothing has rung yet',
  ]) {
    assert.ok(!copy.includes('!'), copy);
    assert.ok(panel.includes(copy), `${copy} is no longer in the panel`);
  }
});

console.log(`\n${passed} checks passed`);
