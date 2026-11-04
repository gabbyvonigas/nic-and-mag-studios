/**
 * Scan + Alarm, half set up.
 *
 * The mode needs a tag and a schedule. It used to be impossible to choose
 * without a tag: the card was `disabled`, so the one mode that needs setting
 * up was the one mode that could not be picked, and `setMode` threw for
 * `strict` with no tag on top of that.
 *
 * Both of those are gone, which moves the safety question. "An alarm only a
 * tag can stop, with no tag, is an alarm nothing stops" is still true, so the
 * alarm is withheld where alarms are decided rather than the mode being
 * refused where modes are stored. This file is the proof of that trade: the
 * mode is kept, and nothing is armed until both halves exist.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs modegating.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const knowtsDb = read('src/db/knowts.ts');
const sync = read('src/alarms/scheduleSync.ts');
const detail = read('src/screens/KnowtDetailScreen.tsx');

const { requiresScan, stopChoiceOf, missingFor } = await import(
  `${ROOT}/src/knowts/modes.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const knowt = (over: Record<string, unknown>) =>
  ({
    id: 'k1', name: 'Journal', mode: 'open', tag_uid: null,
    schedules: [], scan_only: 0, ...over,
  }) as never;

// The mode is stored, whatever is missing.

check('strict no longer needs a tag to be saved', () => {
  assert.ok(
    !/if \(mode !== 'open' && !knowt\.tag_uid\) \{/.test(knowtsDb),
    'setMode still refuses strict without a tag',
  );
  assert.match(knowtsDb, /UPDATE knowts SET mode = \? WHERE id = \?/);
});

check('a tagless Scan + Alarm Knowt still reads as Scan + Alarm', () => {
  // The chip, the row and the detail screen all ask this one function.
  const half = knowt({ mode: 'strict', tag_uid: null, schedules: [{ id: 's1' }] });
  assert.equal(stopChoiceOf(half), 'both');
  assert.equal(requiresScan(half.mode), true);
});

// And nothing rings until both halves exist.

check('the sync arms nothing for a Knowt whose scan cannot happen', () => {
  assert.match(sync, /const unanswerable = requiresScan\(knowt\.mode\) && !knowt\.tag_uid;/);
  assert.match(sync, /const desired = unanswerable \? null : desiredFor\(schedule, now, done\);/);
});

check('and takes down anything already armed for it', () => {
  // The `!desired` branch cancels the existing record, so losing the tag on a
  // Knowt that is already armed stands its alarm down rather than leaving one
  // ringing that nothing can answer.
  const gate = sync.indexOf('const desired = unanswerable');
  const after = sync.slice(gate, gate + 400);
  assert.match(after, /if \(!desired\) \{/);
  assert.match(after, /await cancelRecord\(existing\);/);
});

check('a schedule is still what a ringing Knowt needs to ring at all', () => {
  // Nothing is armed per Knowt; it is armed per schedule. A Knowt with none
  // never enters the inner loop, which is what makes "no schedule, no alarm"
  // true without a second gate for it.
  assert.match(sync, /for \(const schedule of knowt\.schedules\) \{/);
});

// What the person is told.

check('the detail screen says which half is missing, and leads to it', () => {
  assert.match(detail, /const incomplete = \(\(\) => \{/);
  assert.match(detail, /if \(stopChoiceOf\(knowt\) !== 'both'\) return null;/);
  assert.match(detail, /action: 'Add a tag',/);
  assert.match(detail, /action: 'Add a schedule',/);
  // Each one is the tap that fixes it, not just a label.
  assert.match(detail, /onPress: \(\) => void scanToAttach\(setNotice\),/);
  assert.match(detail, /navigation\.navigate\('EditSchedule', \{ knowtId: knowt\.id \}\)/);
});

check('the copy is calm, capitalized and has no exclamation marks', () => {
  for (const text of [
    'This Knowt will not ring until it has a Knowt Tag.',
    'This Knowt will not ring until it has a schedule.',
    'Add a tag',
    'Add a schedule',
  ]) {
    assert.ok(detail.includes(text), `missing: ${text}`);
    assert.ok(!text.includes('!'), text);
    assert.ok(!text.includes('—'), text);
  }
  // "Knowt" is capitalized wherever it is a word rather than an identifier.
  assert.ok(!detail.includes('will not ring until it has a knowt'));
});

// Choosing it goes and gets what it needs.

check('picking Scan + Alarm asks for the tag, then for the schedule', () => {
  assert.match(detail, /if \(want\.needsTag && !knowt\.tag_uid\) \{\n\s+await scanToAttach\(setNotice\);/);
  const tagAt = detail.indexOf('if (want.needsTag && !knowt.tag_uid)');
  const schedAt = detail.indexOf('if (knowt.schedules.length === 0) {', tagAt);
  assert.ok(tagAt > 0 && schedAt > tagAt, 'the schedule step does not follow the tag step');
  // The same attach the "Add a Knowt Tag to scan" button runs, not a second
  // copy of it.
  assert.equal(detail.match(/const scanToAttach = async/g)?.length, 1);
});

check('backing out of either step leaves the mode saved', () => {
  // Both steps run after `setMode`, so neither can undo it. That is the whole
  // reason the incomplete line exists.
  const setAt = detail.indexOf('await setMode(knowt.id, want.mode);');
  const tagAt = detail.indexOf('if (want.needsTag && !knowt.tag_uid)');
  assert.ok(setAt > 0 && tagAt > setAt, 'the tag step runs before the mode is saved');
});

check('the row still describes what is missing, for the other two screens', () => {
  assert.equal(missingFor('both', { tagged: true, scheduled: true }), null);
  assert.match(
    missingFor('both', { tagged: false, scheduled: false }) ?? '',
    /will not ring/,
  );
});

console.log(`\n${passed} checks passed`);
