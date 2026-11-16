/**
 * Settings copy, and the Dev entry that answers a silent scan.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs settingscopy.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const settings = readFileSync(`${ROOT}/src/screens/SettingsScreen.tsx`, 'utf8');
const dev = readFileSync(`${ROOT}/src/screens/DevScreen.tsx`, 'utf8');
const navTypes = readFileSync(`${ROOT}/src/navigation/types.ts`, 'utf8');
const navigator = readFileSync(`${ROOT}/src/navigation/RootNavigator.tsx`, 'utf8');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** JSX wraps copy across lines, so compare on collapsed whitespace. */
const flat = settings.replace(/\s+/g, ' ');

check('the reorder line is the new sentence, ending in a period', () => {
  assert.ok(
    flat.includes(
      'Order more tags below until our Knowt Tags are back in stock.',
    ),
  );
});

check('the old sentence and its exclamation mark are gone', () => {
  assert.ok(!flat.includes('Until our own Knowt Tags are back in stock'));
  assert.ok(!flat.includes('you can order more here'));
});

check('nothing on Settings carries an exclamation mark', () => {
  // Spec section 8. The old line was the only one that did.
  const copy = settings.match(/>[^<>{}]*[a-z][^<>{}]*</g) ?? [];
  for (const line of copy) {
    assert.ok(!line.includes('!'), `exclamation mark in ${line.trim()}`);
  }
});

check('the pill button and the disclosure are untouched', () => {
  assert.ok(flat.includes('Order Knowt Tags on Amazon'));
  assert.match(settings, /accessibilityLabel="Order Knowt Tags on Amazon"/);
  assert.ok(flat.includes('We do not sell these ourselves.'));
  assert.match(settings, /\{DISCLOSURE\}/);
});

check('Knowt is capitalized in the sentence', () => {
  assert.ok(flat.includes('our Knowt Tags'));
  assert.ok(!flat.includes('our knowt Tags'));
});

// The Dev entry.

check('Dev tools offers the NFC check, listed first', () => {
  assert.match(dev, /label="NFC check"/);
  assert.match(dev, /navigate\('NfcCheck'\)/);
  assert.ok(
    dev.indexOf('label="NFC check"') < dev.indexOf('label="NFC scan history"'),
    'the diagnostic goes above the history',
  );
});

check('the route exists in both the types and the navigator', () => {
  // A route in one and not the other typechecks on one side and crashes on
  // the other.
  assert.match(navTypes, /NfcCheck: undefined;/);
  assert.match(navigator, /name="NfcCheck" component=\{NfcCheckScreen\}/);
});

check('the check screen reports rather than assumes', () => {
  const screen = readFileSync(`${ROOT}/src/screens/NfcCheckScreen.tsx`, 'utf8');
  // Every line on it comes from the platform probe, and the scan is there so
  // the tag can be tested with no alarm involved.
  assert.match(screen, /nfcReader\.probe\(\)/);
  assert.match(screen, /nfcReader\.scanTag\(/);
  assert.match(screen, /Tag reading available/);
  assert.match(screen, /Session open now/);
  assert.match(screen, /Last error/);
  // It must not claim to have read the entitlement, which JavaScript cannot.
  assert.match(screen, /cannot be read\s+from JavaScript/);
});

console.log(`\n${passed} checks passed`);
