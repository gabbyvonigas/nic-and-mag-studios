/**
 * Reordering categories, and the colors someone can pick for one.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs categories.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { canMove, moveCategory, orderMatches, sortValues } = await import(
  `${ROOT}/src/knowts/categoryOrder.ts`
);
const { allSwatches, hslToHex, swatchGrid } = await import(
  `${ROOT}/src/theme/colorGrid.ts`
);
const { shadesFromHex } = await import(`${ROOT}/src/theme/categoryColors.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const cat = (id: string, sort: number) =>
  ({ id, name: id, key: id, color: '#FF4D3D', icon: 'tray', is_custom: 0, sort, color_locked: 0 }) as never;

const LIST = [cat('home', 0), cat('daily', 1), cat('care', 2), cat('go', 3)] as never[];
const ids = (list: { id: string }[]) => list.map((c) => c.id);

// Reordering.

check('moving up swaps with the one above', () => {
  assert.deepEqual(ids(moveCategory(LIST, 'care', 'up')), [
    'home',
    'care',
    'daily',
    'go',
  ]);
});

check('moving down swaps with the one below', () => {
  assert.deepEqual(ids(moveCategory(LIST, 'home', 'down')), [
    'daily',
    'home',
    'care',
    'go',
  ]);
});

check('the ends do not wrap around', () => {
  // A control that looks like it did nothing must not have sent the category
  // to the far end of the list.
  assert.deepEqual(ids(moveCategory(LIST, 'home', 'up')), ids(LIST));
  assert.deepEqual(ids(moveCategory(LIST, 'go', 'down')), ids(LIST));
});

check('a category that is not in the list changes nothing', () => {
  assert.deepEqual(ids(moveCategory(LIST, 'gone', 'up')), ids(LIST));
});

check('moving never adds, drops or duplicates a category', () => {
  for (const id of ids(LIST)) {
    for (const move of ['up', 'down'] as const) {
      const out = moveCategory(LIST, id, move);
      assert.equal(out.length, LIST.length, `${id} ${move} changed the count`);
      assert.deepEqual(
        [...ids(out)].sort(),
        [...ids(LIST)].sort(),
        `${id} ${move} lost or duplicated one`,
      );
    }
  }
});

check('moving one down then back up returns the original order', () => {
  const down = moveCategory(LIST, 'daily', 'down');
  assert.deepEqual(ids(moveCategory(down, 'daily', 'up')), ids(LIST));
});

check('walking one from the bottom to the top passes everything', () => {
  let list = LIST;
  for (let i = 0; i < 3; i += 1) list = moveCategory(list, 'go', 'up');
  assert.deepEqual(ids(list), ['go', 'home', 'daily', 'care']);
  // And one more does nothing, because it is at the top.
  assert.deepEqual(ids(moveCategory(list, 'go', 'up')), ids(list));
});

check('the controls are absent exactly at the ends', () => {
  assert.equal(canMove(LIST, 'home', 'up'), false);
  assert.equal(canMove(LIST, 'home', 'down'), true);
  assert.equal(canMove(LIST, 'go', 'down'), false);
  assert.equal(canMove(LIST, 'go', 'up'), true);
  assert.equal(canMove(LIST, 'care', 'up'), true);
  assert.equal(canMove(LIST, 'gone', 'up'), false);
});

check('a list of one has no moves at all', () => {
  const one = [cat('home', 0)] as never[];
  assert.equal(canMove(one, 'home', 'up'), false);
  assert.equal(canMove(one, 'home', 'down'), false);
});

check('sort values are dense and zero based', () => {
  // Two categories sharing a sort value fall through to the secondary sort,
  // which reads as the move not having taken.
  const moved = moveCategory(LIST, 'go', 'up');
  const values = sortValues(moved);
  assert.deepEqual([...values.values()], [0, 1, 2, 3]);
  assert.equal(values.get('go'), 2);
  assert.equal(values.get('care'), 3);
  assert.equal(new Set(values.values()).size, moved.length, 'a value repeats');
});

check('an unchanged order is recognized, so nothing is written', () => {
  assert.equal(orderMatches(LIST), true);
  assert.equal(orderMatches(moveCategory(LIST, 'go', 'up')), false);
  // Every category shipped at sort 0, which is the state this replaces.
  const flat = LIST.map((c: never) => ({ ...(c as object), sort: 0 })) as never[];
  assert.equal(orderMatches(flat), false);
});

// The color grid.

check('hsl converts to the hex the palette is written in', () => {
  assert.equal(hslToHex(0, 1, 0.5), '#FF0000');
  assert.equal(hslToHex(120, 1, 0.5), '#00FF00');
  assert.equal(hslToHex(240, 1, 0.5), '#0000FF');
  assert.equal(hslToHex(0, 0, 0), '#000000');
  assert.equal(hslToHex(0, 0, 1), '#FFFFFF');
});

check('a hue past the wheel wraps rather than breaking', () => {
  assert.equal(hslToHex(360, 1, 0.5), hslToHex(0, 1, 0.5));
  assert.equal(hslToHex(-60, 1, 0.5), hslToHex(300, 1, 0.5));
});

check('every swatch is a valid six digit hex', () => {
  for (const color of allSwatches()) {
    assert.ok(/^#[0-9A-F]{6}$/.test(color), color);
  }
});

check('the grid offers a real spread rather than near duplicates', () => {
  const all = allSwatches();
  assert.ok(all.length >= 36, `only ${all.length} swatches`);
  assert.equal(new Set(all).size, all.length, 'the grid repeats a color');
});

check('every swatch survives being turned into shades', () => {
  // A swatch whose ink comes back as the fallback is a category whose name
  // renders in gray no matter what was picked.
  for (const color of allSwatches()) {
    const shades = shadesFromHex(color);
    // Case insensitive: the grid writes uppercase and `shadesFromHex`
    // normalizes to lowercase, so every comparison of a stored color against
    // a swatch has to fold case. The picker's selected check already does.
    assert.equal(
      shades.color.toLowerCase(),
      color.toLowerCase(),
      `${color} did not round trip`,
    );
    assert.notEqual(shades.ink, shades.color, `${color} has no darker ink`);
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(shades.ink), `${color} ink ${shades.ink}`);
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(shades.fill), `${color} fill`);
  }
});

check('every swatch ink is dark enough to read on its own fill', () => {
  const lum = (hex: string) => {
    const v = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => {
      const c = parseInt(v.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
  };
  for (const color of allSwatches()) {
    const { ink, fill } = shadesFromHex(color);
    const a = lum(ink);
    const b = lum(fill);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    assert.ok(ratio >= 4.5, `${color}: ink on fill is only ${ratio.toFixed(2)}`);
  }
});

check('the grid is rows of the same length, bar the grays', () => {
  const grid = swatchGrid();
  assert.ok(grid.length >= 3);
  const hueRows = grid.slice(0, 3);
  for (const row of hueRows) {
    assert.equal(row.length, hueRows[0]!.length, 'a hue row is a different length');
  }
});

console.log(`\n${passed} checks passed`);
