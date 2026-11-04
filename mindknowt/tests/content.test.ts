/**
 * The bundled starter set content, validated by the app's own parser.
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs content.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseStarterSets } from '../src/sets/parse.ts';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const raw = JSON.parse(
  readFileSync(`${ROOT}/assets/starter-sets.json`, 'utf8'),
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const result = parseStarterSets(raw);

check('every bundled set validates', () => {
  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  assert.ok(result.sets.length >= 28, `only ${result.sets.length} sets parsed`);
});

check('Morning essentials is present and leads the list', () => {
  assert.equal(result.sets[0]?.id, 'morning-essentials');
  assert.equal(result.sets[0]?.knowts.length, 12);
});

check('no set supplies a time, which is the user to choose', () => {
  for (const set of result.sets) {
    for (const knowt of set.knowts) {
      assert.equal(
        (knowt as Record<string, unknown>).time,
        undefined,
        `${set.id}/${knowt.name} carries a time`,
      );
    }
  }
});

check('set ids are unique', () => {
  const ids = result.sets.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

check('no knowt in the new set is named twice', () => {
  const names = result.sets[0]!.knowts.map((k) => k.name);
  assert.equal(new Set(names).size, names.length);
});

check('the retired soft mode never survives parsing', () => {
  for (const set of result.sets) {
    for (const knowt of set.knowts) {
      assert.notEqual(knowt.suggestedMode, 'soft', `${set.id}/${knowt.name}`);
    }
  }
});

console.log(`\n${passed} checks passed. ${result.sets.length} sets, ${result.sets.reduce((n, s) => n + s.knowts.length, 0)} knowts.`);
