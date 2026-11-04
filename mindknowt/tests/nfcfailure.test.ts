/**
 * What a failed scan says out loud, and that nothing can fail in silence.
 *
 * The reported bug was a scan that opened no sheet, showed no error and left
 * the Scan button stuck reading "Scanning". Two halves to that: iOS never
 * created a reader session, and nothing in this app was written so that a scan
 * which produces nothing has to say so. This covers the second half.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs nfcfailure.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { nfcFailureMessage } = await import(`${ROOT}/src/nfc/failureText.ts`);
const { NfcScanError, formatUid } = await import(`${ROOT}/src/nfc/types.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** Every reason the contract declares. Kept in step with `types.ts` below. */
const REASONS = [
  'canceled',
  'wrong-tag',
  'timeout',
  'radio-disabled',
  'unsupported',
  'busy',
  'no-uid',
  'no-session',
  'unknown',
] as const;

check('the reason list here is the reason list in the contract', () => {
  // A new reason with no copy would fall through to `undefined` and render as
  // nothing, which is the exact failure mode this file exists to prevent.
  const types = readFileSync(`${ROOT}/src/nfc/types.ts`, 'utf8');
  const declared = (
    types.match(/export type NfcFailureReason =[\s\S]*?;/)?.[0] ?? ''
  )
    .match(/'[a-z-]+'/g)
    ?.map((quoted) => quoted.slice(1, -1));
  assert.deepEqual([...REASONS].sort(), [...(declared ?? [])].sort());
});

check('every reason but canceling produces a visible message', () => {
  for (const reason of REASONS) {
    const message = nfcFailureMessage(new NfcScanError(reason, 'raw detail'));
    if (reason === 'canceled') {
      assert.equal(message, null, 'backing out of the sheet is not a failure');
      continue;
    }
    assert.ok(message, `${reason} said nothing`);
    assert.ok(message.text.trim().length > 0, `${reason} said nothing`);
    assert.ok(
      message.tone === 'warn' || message.tone === 'danger',
      `${reason} has no tone`,
    );
  }
});

check('no-session says what to do about it', () => {
  // The one failure that used to be completely silent. It is also the one the
  // person cannot fix on the phone, so the message has to say that.
  const message = nfcFailureMessage(new NfcScanError('no-session', ''));
  assert.ok(message);
  assert.match(message.text, /entitlement/);
  assert.match(message.text, /new build/);
  assert.match(message.text, /NFC check/);
  assert.equal(message.tone, 'danger');
});

check('a wrong tag repeats what the sheet said', () => {
  const message = nfcFailureMessage(new NfcScanError('wrong-tag', 'Not Pills'));
  assert.equal(message?.text, 'Not Pills');
});

check('an error that is not ours still identifies itself', () => {
  // Third-party errors are routinely built with an empty message, and
  // String(err) on one renders as the useless word "Error".
  class SomeLibraryError extends Error {}
  assert.equal(
    nfcFailureMessage(new SomeLibraryError())?.text,
    'SomeLibraryError',
  );
  assert.equal(
    nfcFailureMessage(new SomeLibraryError('refused'))?.text,
    'SomeLibraryError: refused',
  );
  assert.equal(nfcFailureMessage('a bare string')?.text, 'a bare string');
  assert.equal(nfcFailureMessage(undefined)?.text, 'undefined');
});

check('an unknown reason with no message still says something', () => {
  assert.equal(nfcFailureMessage(new NfcScanError('unknown', ''))?.text, 'The scan failed.');
});

check('the copy follows the voice rules', () => {
  for (const reason of REASONS) {
    const message = nfcFailureMessage(new NfcScanError(reason, 'detail'));
    if (!message) continue;
    assert.ok(!message.text.includes('!'), `${reason} has an exclamation mark`);
    assert.ok(!message.text.includes('—'), `${reason} has an em dash`);
  }
});

// The scan path itself.

const reader = readFileSync(`${ROOT}/src/nfc/NfcReader.ios.ts`, 'utf8');

check('the scan checks that a session opened, rather than waiting forever', () => {
  // `requestTechnology` resolves when a tag is read or the session closes, so
  // it cannot be awaited to find out whether a sheet appeared. The session
  // object existing is the one signal that separates the two.
  assert.match(reader, /isTagSessionAvailableIOS/);
  assert.match(reader, /SESSION_CHECK_MS/);
  assert.match(reader, /'no-session'/);
});

check('the request is observed before it is raced', () => {
  // Not awaiting a promise that may reject is how an unhandled rejection gets
  // into a release build.
  assert.match(reader, /request\.catch\(\(\) => \{\}\)/);
});

check('FeliCa polling is still not requested', () => {
  // It silently switches on ISO18092, which iOS rejects without system codes
  // in Info.plist, and every scan fails instantly with an empty error. Only
  // the tech list is checked: the file names FeliCa in the comment saying not
  // to add it, and that comment is the point.
  const techs = reader.match(/const SCAN_TECHS = \[[^\]]*\]/)?.[0] ?? '';
  assert.equal(techs, 'const SCAN_TECHS = [NfcTech.Ndef]');
});

check('a UID still formats the way the app shows it', () => {
  assert.equal(formatUid('04a2b3c4'), '04:A2:B3:C4');
});

// The path from an alarm to the sheet.

const ringing = readFileSync(`${ROOT}/src/screens/RingingScreen.tsx`, 'utf8');

check('the auto-scan claims itself when it is scheduled, not before', () => {
  // The effect depends on `knowt`, `finish` and `scanToStop`. Claiming the one
  // allowed scan when the effect ran meant a re-run saw the claim, returned
  // early, and left the AppState listener removed with nothing scheduled: an
  // alarm that opened the screen and then never asked for a tag.
  const start = ringing.match(/const start = \(\) => \{[\s\S]*?\n {4}\};/)?.[0] ?? '';
  assert.match(start, /autoScanned\.current = true/);
  assert.match(start, /if \(autoScanned\.current\) return;/);
});

check('the scan waits for the app to be frontmost', () => {
  // A session requested before the app is active is rejected by iOS, and an
  // alarm dismissal relaunches the process.
  assert.match(ringing, /AppState\.currentState === 'active'/);
  assert.match(ringing, /AppState\.addEventListener/);
});

check('a required scan is what opens the sheet, not a tap', () => {
  assert.match(ringing, /requiresScan\(knowt\.mode\) \|\| !knowt\.tag_uid/);
});

console.log(`\n${passed} checks passed`);
