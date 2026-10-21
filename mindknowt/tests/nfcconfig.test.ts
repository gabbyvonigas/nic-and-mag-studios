/**
 * The native config a scan cannot work without.
 *
 * Asserted through `expo config --type introspect`, which is the only thing
 * that shows what prebuild will actually generate. Reading `app.json` is not
 * the same question: the NFC entitlement is not in `app.json` at all. It comes
 * from the `react-native-nfc-manager` config plugin, and `ios.entitlements`
 * carries only the App Group, so the thing worth proving is that the two are
 * merged rather than one replacing the other.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs nfcconfig.test.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');


const config = JSON.parse(
  execFileSync('npx', ['expo', 'config', '--type', 'introspect', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);

const ios = config.ios ?? {};
const entitlements = ios.entitlements ?? {};
const infoPlist = ios.infoPlist ?? {};

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('the NFC reader session entitlement is generated', () => {
  // Without this, iOS returns nil from the tag reader session initializer, the
  // library calls beginSession on that nil and keeps a callback it will never
  // invoke, and the scan promise never settles: no sheet, no error.
  assert.deepEqual(
    [...(entitlements['com.apple.developer.nfc.readersession.formats'] ?? [])].sort(),
    ['NDEF', 'TAG'],
  );
});

check('the App Group does not replace it', () => {
  // Both, in one entitlements file. `ios.entitlements` in app.json sets only
  // the App Group, and a merge that lost the plugin's keys would look exactly
  // like a correct app.json.
  assert.deepEqual(entitlements['com.apple.security.application-groups'], [
    'group.com.nicandmag.mindknowt',
  ]);
  assert.ok(
    Object.keys(entitlements).length >= 2,
    `only ${Object.keys(entitlements).length} entitlement(s)`,
  );
});

check('the usage description iOS actually reads is set', () => {
  // The key is NFCReaderUsageDescription. There is no NS prefix on this one,
  // and a missing description is a launch-time crash on first scan.
  assert.ok(infoPlist.NFCReaderUsageDescription);
  assert.ok(!('NSNFCReaderUsageDescription' in infoPlist));
});

check('no FeliCa system codes are declared, so nothing polls ISO18092', () => {
  assert.ok(
    !('com.apple.developer.nfc.readersession.felica.systemcodes' in infoPlist),
  );
});

check('the App Group matches the one the alarm code opens', () => {
  const types = execFileSync('cat', [`${ROOT}/src/alarms/types.ts`], {
    encoding: 'utf8',
  });
  const id = types.match(/APP_GROUP_ID = '([^']+)'/)?.[1];
  assert.equal(id, entitlements['com.apple.security.application-groups'][0]);
});

console.log(`\n${passed} checks passed`);
