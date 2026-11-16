/**
 * Which category a preset list belongs to, which is what the
 * "Add a custom knowt to ..." row names and where that knowt lands.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs setcategory.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { setCategoryKey } = await import(`${ROOT}/src/sets/category.ts`);
const { parseStarterSets } = await import(`${ROOT}/src/sets/parse.ts`);
const { CATEGORY_KEYS } = await import(`${ROOT}/src/db/categoryKeys.ts`);
const bundled = (await import(`${ROOT}/assets/starter-sets.json`, { with: { type: 'json' } }))
  .default;

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const set = (categories: string[]) =>
  ({
    id: 's',
    name: 'A set',
    description: '',
    knowts: categories.map((category, i) => ({
      name: `k${i}`,
      category,
      icon: null,
      suggestedMode: null,
      locationNote: null,
      notes: null,
      schedules: [],
    })),
  }) as never;

check('a set that names one category throughout uses it', () => {
  assert.equal(setCategoryKey(set(['home', 'home', 'home'])), 'home');
});

check('a mixed set goes with the category most of it carries', () => {
  // Not whichever comes first. Prescriptions and medical is mostly daily with
  // one admin knowt, and naming it Admin would file the whole list wrongly.
  assert.equal(setCategoryKey(set(['admin', 'daily', 'daily'])), 'daily');
});

check('a tie goes to the one listed first, so the answer is stable', () => {
  // Counting into a map and reading it back must not depend on iteration
  // order for the result to be the same on every run.
  assert.equal(setCategoryKey(set(['go', 'care'])), 'go');
  assert.equal(setCategoryKey(set(['care', 'go'])), 'care');
});

check('a set with nothing in it names no category', () => {
  assert.equal(setCategoryKey(set([])), null);
  // Blank and whitespace are not categories either.
  assert.equal(setCategoryKey(set(['', '  '])), null);
});

check('blank entries do not outvote a real one', () => {
  assert.equal(setCategoryKey(set(['', '', 'home'])), 'home');
});

// Against the content that actually ships.

check('every shipped set resolves to an installed category', () => {
  // A set resolving to a key with no category row would render the row as the
  // bare "Add a custom knowt", silently dropping the category it meant.
  const { sets, errors } = parseStarterSets(bundled);
  assert.deepEqual(errors, [], 'the bundled content parses');
  assert.ok(sets.length >= 20, `only ${sets.length} sets`);

  for (const s of sets) {
    const key = setCategoryKey(s);
    assert.ok(key, `${s.id} resolves to no category`);
    assert.ok(
      (CATEGORY_KEYS as readonly string[]).includes(key),
      `${s.id} resolves to ${key}, which is not a shipped category`,
    );
  }
});

check('the three mixed sets resolve the way a person would read them', () => {
  const { sets } = parseStarterSets(bundled);
  const by = (id: string) => sets.find((s: { id: string }) => s.id === id);

  // Morning essentials spans three: seven go, four care, one daily.
  assert.equal(setCategoryKey(by('morning-essentials')), 'go');
  // Prescriptions and medical reads as a daily set from its name, and is not:
  // five of its eight knowts are admin, so that is where a custom one goes.
  assert.equal(setCategoryKey(by('prescriptions-medical')), 'admin');
  // And a single-category set is never in doubt.
  assert.equal(setCategoryKey(by('household-maintenance')), 'home');
  assert.equal(setCategoryKey(by('finances')), 'admin');
});



// How sets are presented: filing and marks.

const { presentedCategoryKey, setIcon } = await import(`${ROOT}/src/sets/presentation.ts`);
// Read as text: Icon.tsx imports React, which the node runner cannot load.
const ICON_SOURCE = await (await import('node:fs/promises')).readFile(
  `${ROOT}/src/components/Icon.tsx`,
  'utf8',
);
const ICON_NAMES = new Set(
  [...ICON_SOURCE.matchAll(/^  ([a-zA-Z0-9_]+): '[^']+',$/gm)].map((m) => m[1]),
);

check('every set files under a category that exists', () => {
  const { sets } = parseStarterSets(bundled);
  for (const s of sets) {
    const key = presentedCategoryKey(s);
    assert.ok(key, `${s.id} files under nothing`);
    assert.ok(
      (CATEGORY_KEYS as readonly string[]).includes(key),
      `${s.id} files under ${key}, which is not a shipped category`,
    );
  }
});

check('the three named overrides win over what the contents count to', () => {
  const { sets } = parseStarterSets(bundled);
  const by = (id: string) => sets.find((s: { id: string }) => s.id === id);

  // Content says go, care and daily respectively. These read better grouped
  // the way they are named, and the override is the only reason they are.
  assert.equal(setCategoryKey(by('morning-essentials')), 'go');
  assert.equal(presentedCategoryKey(by('morning-essentials')), 'daily');

  assert.equal(setCategoryKey(by('vitamins-supplements')), 'daily');
  assert.equal(presentedCategoryKey(by('vitamins-supplements')), 'care');

  assert.equal(setCategoryKey(by('prescriptions-medical')), 'admin');
  assert.equal(presentedCategoryKey(by('prescriptions-medical')), 'care');
});

check('everything not overridden still files by its own contents', () => {
  const { sets } = parseStarterSets(bundled);
  const overridden = new Set([
    'morning-essentials',
    'vitamins-supplements',
    'prescriptions-medical',
  ]);
  for (const s of sets) {
    if (overridden.has(s.id)) continue;
    assert.equal(
      presentedCategoryKey(s),
      setCategoryKey(s),
      `${s.id} was filed by hand without being listed`,
    );
  }
});

check('the icon names were actually read out of the component', () => {
  // Guards the regex above: if it stops matching, the check below passes
  // vacuously against an empty set and proves nothing.
  assert.ok(ICON_NAMES.size > 20, `only read ${ICON_NAMES.size} icon names`);
  assert.ok(ICON_NAMES.has('alarm') && ICON_NAMES.has('forward'));
});

check('every set has its own mark, and every mark is a real glyph', () => {
  // Twenty eight rows that all carry the same icon are twenty eight rows you
  // have to read. They are only scannable if the marks differ.
  const { sets } = parseStarterSets(bundled);
  const marks = sets.map((s: { id: string }) => setIcon(s.id));
  for (const [i, mark] of marks.entries()) {
    assert.ok(ICON_NAMES.has(mark), `${sets[i].id} uses ${mark}, which is not an icon`);
    assert.notEqual(mark, 'tray', `${sets[i].id} fell back to the default mark`);
  }
  assert.ok(
    new Set(marks).size >= marks.length - 1,
    `only ${new Set(marks).size} distinct marks across ${marks.length} sets`,
  );
});

// Grouping, and the React keys it hands out.

const { groupSetsByCategory } = await import(`${ROOT}/src/sets/presentation.ts`);

const cat = (key: string, name: string, i: number) =>
  ({ id: `cat-${key}`, key, name, color: '#000', icon: 'tray', is_custom: 0, sort: i }) as never;

const ALL_CATEGORIES = ['home', 'daily', 'care', 'ritual', 'go', 'admin', 'seasonal'].map(
  (k, i) => cat(k, k, i),
);

check('every group gets its own key, even before the categories load', () => {
  // The bug, exactly: the screen renders once with no categories, because they
  // come from the database. Every group then had a null category and the
  // screen keyed them all `other`, so React saw seven children with one key.
  const { sets } = parseStarterSets(bundled);
  const groups = groupSetsByCategory(sets, []);
  assert.ok(groups.length > 1, 'this case has to produce several groups');
  assert.equal(
    new Set(groups.map((g: { key: string }) => g.key)).size,
    groups.length,
    'two groups share a key',
  );
});

check('keys are unique once the categories have loaded too', () => {
  const { sets } = parseStarterSets(bundled);
  const groups = groupSetsByCategory(sets, ALL_CATEGORIES);
  assert.equal(
    new Set(groups.map((g: { key: string }) => g.key)).size,
    groups.length,
  );
  assert.ok(groups.every((g: { category: unknown }) => g.category));
});

check('grouping loses no set and duplicates none', () => {
  const { sets } = parseStarterSets(bundled);
  for (const categories of [[], ALL_CATEGORIES]) {
    const grouped = groupSetsByCategory(sets, categories).flatMap(
      (g: { sets: { id: string }[] }) => g.sets.map((x) => x.id),
    );
    assert.equal(grouped.length, sets.length, 'a set was lost or doubled');
    assert.equal(new Set(grouped).size, sets.length);
  }
});

check('groups come out in the categories own order', () => {
  // The Knowts screen order, which is the whole point of matching its header.
  const { sets } = parseStarterSets(bundled);
  const groups = groupSetsByCategory(sets, ALL_CATEGORIES);
  const order = groups.map((g: { category: { key: string } }) => g.category.key);
  const expected = ALL_CATEGORIES.map((c: { key: string }) => c.key).filter((k) =>
    order.includes(k),
  );
  assert.deepEqual(order, expected);
});

console.log(`\n${passed} checks passed`);
