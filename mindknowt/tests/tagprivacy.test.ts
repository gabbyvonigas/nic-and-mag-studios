/**
 * The tag's number, and the one screen that still shows it.
 *
 * `tag_uid` is a hardware UID, fourteen hex characters the tag was born with.
 * It was printed under the tag buttons on the Knowt detail screen and on Edit,
 * where it was the one thing on either screen nobody could act on: it does not
 * say whether the tag works, it does not identify the sticker on the fridge,
 * and nothing is done with it. Nothing replaces it.
 *
 * It is still worth reading out to someone debugging, so Dev tools in Settings
 * lists it. This file walks every screen and fails if it comes back anywhere
 * else.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs tagprivacy.test.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Every `.tsx` under `src/`, by repository relative path. */
function components(dir = 'src'): string[] {
  const out: string[] = [];
  for (const name of readdirSync(`${ROOT}/${dir}`)) {
    const path = `${dir}/${name}`;
    if (statSync(`${ROOT}/${path}`).isDirectory()) out.push(...components(path));
    else if (name.endsWith('.tsx')) out.push(path);
  }
  return out;
}

/** The one screen allowed to print it. */
const DEV = 'src/screens/DevScreen.tsx';

// --- Nowhere but Dev tools. ----------------------------------------------

check('no screen but Dev tools renders the number', () => {
  // Rendered means inside JSX: `{knowt.tag_uid}` or any other expression whose
  // whole value is the uid. Reading it to decide what to draw is fine and is
  // most of what the screens do with it, so this looks for the render.
  const offenses: string[] = [];
  for (const path of components()) {
    if (path === DEV) continue;
    const src = read(path);
    for (const match of src.matchAll(/\{\s*([A-Za-z0-9_.?[\]]*tag_uid)\s*\}/g)) {
      offenses.push(`${path}: {${match[1]}}`);
    }
    // The other way it could reach a screen: interpolated into a string.
    for (const match of src.matchAll(/\$\{[^}]*tag_uid[^}]*\}/g)) {
      offenses.push(`${path}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenses, [], `the tag number is rendered:\n${offenses.join('\n')}`);
});

check('and no style is left behind for it', () => {
  for (const path of components()) {
    if (path === DEV) continue;
    const src = read(path);
    // The style, not the word: `tagUid` is a perfectly good parameter name.
    assert.ok(!src.includes('styles.tagUid'), `${path} still styles the number`);
    assert.ok(!/\n\s+tagUid: \{/.test(src), `${path} keeps the tag number style`);
  }
});

check('the two screens that had it still read it, they just do not print it', () => {
  // Removing the number must not have removed the Knowt's knowledge of having
  // a tag, which is what three controls and the Mode row are gated on.
  const detail = read('src/screens/KnowtDetailScreen.tsx');
  const edit = read('src/screens/EditKnowtScreen.tsx');
  assert.match(detail, /\{knowt\.tag_uid \? \(/);
  assert.match(detail, /tagged=\{!!knowt\.tag_uid\}/);
  assert.match(edit, /const tagged = !!knowt\?\.tag_uid;/);
});

// --- What stays on those screens. ---------------------------------------

check('the Tagged chip and both tag buttons stay', () => {
  const detail = read('src/screens/KnowtDetailScreen.tsx');
  assert.match(detail, /<Pill label="Tagged" icon="knowtTag" \/>/);
  assert.match(detail, /'Replace the Knowt tag'/);
  assert.match(detail, /label="Free this tag for something else"/);
  const edit = read('src/screens/EditKnowtScreen.tsx');
  assert.match(edit, /tagged \? 'Replace the Knowt tag' : 'Add a Knowt tag to scan'/);
});

// --- And Dev tools does show it. ----------------------------------------

check('Dev tools lists every attached tag, by Knowt', () => {
  const dev = read(DEV);
  assert.match(dev, /<Text style=\{styles\.sectionTitle\}>Knowt tags<\/Text>/);
  assert.match(dev, /\{knowt\.tag_uid\}/);
  assert.match(dev, /filter\(\(knowt\) => knowt\.tag_uid\)/);
  // Something to read when there is nothing to list.
  assert.match(dev, /No tags attached\./);
  // Selectable, because reading one out is the whole reason it is here.
  assert.match(dev, /<Text style=\{styles\.metaValue\} selectable>/);
});

check('Dev tools is reached from Settings and not from a tab', () => {
  const settings = read('src/screens/SettingsScreen.tsx');
  assert.match(settings, /navigate\('Dev'\)/);
});

check('the copy has no exclamation marks and no em dash', () => {
  for (const path of [DEV, 'src/screens/KnowtDetailScreen.tsx', 'src/screens/EditKnowtScreen.tsx']) {
    const src = read(path);
    assert.ok(!src.includes('—'), `${path} has an em dash`);
  }
});

console.log(`\n${passed} checks passed`);
