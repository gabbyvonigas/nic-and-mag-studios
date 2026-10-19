/**
 * The path from a Scan Knowt to a logged completion, minus the NFC itself.
 *
 * Everything here is what a device cannot tell you: that the controls exist
 * for the right Knowt, that a failure reports where the finger was, and that
 * the completion lands with the right shape. Whether iOS opens a reader
 * session is a separate question and only a phone can answer it.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs scanflow.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const detail = read('src/screens/KnowtDetailScreen.tsx');
const list = read('src/screens/AllKnowtsScreen.tsx');
const scan = read('src/knowts/scanKnowt.ts');
const failure = read('src/nfc/failureText.ts');

const { isScanOnly } = await import(`${ROOT}/src/knowts/scanOnly.ts`);
const { stopChoiceOf, stopChoice } = await import(`${ROOT}/src/knowts/modes.ts`);
const { nfcFailureMessage } = await import(`${ROOT}/src/nfc/failureText.ts`);
const { NfcScanError } = await import(`${ROOT}/src/nfc/types.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const knowt = (over: Record<string, unknown>) =>
  ({
    id: 'k1', name: 'Water filter', mode: 'open', tag_uid: null,
    schedules: [], scan_only: 0, is_pinned: 0, category: null, ...over,
  }) as never;

// (a) The controls exist, and only for a Scan Knowt.

check('the action button is gated on the flag, not on having no schedule', () => {
  // The whole reason nothing appeared: a Knowt that lost the flag at schema 17
  // is an ordinary unscheduled Knowt and gets the ordinary Done button.
  assert.equal(isScanOnly(knowt({ scan_only: 1 })), true);
  assert.equal(isScanOnly(knowt({ scan_only: 0 })), false);
  assert.match(detail, /const scanOnly = isScanOnly\(knowt\);/);
  assert.match(detail, /\{scanOnly \? \(\n\s+<View style=\{styles\.leadAction\}>/);
});

check('the scan leads the detail screen, above Notes', () => {
  // It used to sit in the actions at the very bottom, past Notes, Mode, the
  // tag controls, Schedules and History: several screens below the title on a
  // small iPhone, for the one thing the screen is for.
  const button = detail.indexOf('<View style={styles.leadAction}>');
  const chips = detail.indexOf('<View style={styles.pills}>');
  const notes = detail.indexOf('<Text style={styles.sectionTitle}>Notes</Text>');
  const mode = detail.indexOf('<Text style={styles.sectionTitle}>Mode</Text>');
  assert.ok(button > chips, 'it is above the chips row');
  assert.ok(button < notes, 'it is still below Notes');
  assert.ok(notes < mode, 'Notes and Mode swapped places');
  // And only that button moved. Mark done stayed in the actions.
  const actions = detail.indexOf('<View style={styles.actions}>');
  assert.ok(actions > mode, 'the actions block moved');
  assert.match(
    detail.slice(actions),
    /label="Mark done"\n\s+variant="secondary"/,
    'Mark done did not stay in the actions',
  );
});

check('the button wears the mark rather than a bracket', () => {
  assert.match(detail, /icon=\{doneToday \? 'check' : 'knowtTag'\}/);
  assert.match(detail, /iconColor=\{theme\.color\.highlight\}/);
  // The slot exists on the shared button, at button size.
  assert.match(
    read('src/components/ui.tsx'),
    /<Icon\n\s+name=\{icon\}\n\s+size=\{BUTTON_GLYPH\}\n\s+color=\{iconColor \?\? labelColor\}\n\s+\/>/,
  );
});

check('the three labels it can carry are all there', () => {
  assert.match(detail, /'Done today'/);
  assert.match(detail, /'Scan Knowt'/);
  assert.match(detail, /'Add a Knowt Tag to scan'/);
  // Disabled only while a scan is running or it is already done today.
  assert.match(detail, /disabled=\{busy \|\| doneToday\}/);
});

check('the list row offers a scan, and hides it once done', () => {
  assert.match(list, /scanOnly && onScan \?/);
  // The row hands it up, the section hands it down, and both sections pass
  // it: a pinned Scan Knowt with no control would be the obvious miss.
  assert.match(list, /onScan=\{\(\) => onScan\(knowt\)\}/);
  assert.equal(
    list.match(/onScan=\{\(knowt\) => void scanRow\(knowt\)\}/g)?.length,
    2,
    'one of the two sections does not pass onScan',
  );
});

check('the list shows today without having to be remounted', () => {
  // Scanning from the detail screen and coming back has to show it landed,
  // and a day rolling over while the app is open has to clear it.
  const focus = list.slice(list.lastIndexOf('useFocusEffect('));
  assert.match(focus, /void reloadDoneToday\(\);/);
});

// (b) No tag.

check('a Scan Knowt with no tag is still a Scan Knowt', () => {
  // `setMode` refuses strict without a tag, so it stores `open`. The flag is
  // what decides, and the mode only picks the glyph.
  const tagless = knowt({ scan_only: 1, mode: 'open', tag_uid: null });
  assert.equal(isScanOnly(tagless), true);
  assert.equal(stopChoiceOf(tagless), 'scan');
  assert.equal(stopChoice('scan').needsTag, false);
});

check('with no tag the button attaches one instead of scanning', () => {
  assert.match(
    detail,
    /knowt\.tag_uid\n\s+\? void scanToLog\(\)\n\s+: void scanToAttach\(setActionNotice\)/,
  );
  // And the attach really is the attach, not a stub.
  assert.match(detail, /await attachTag\(knowt\.id, tag\.rawUid\);/);
  assert.match(detail, /await reload\(\);/);
});

check('the scan path refuses a Knowt with no tag rather than opening a sheet', () => {
  assert.match(scan, /if \(!knowt\.tag_uid\) \{/);
  assert.match(scan, /nothing to scan\. Attach one first\./);
});

check('a row with no tag goes to the screen where attaching lives', () => {
  assert.match(list, /if \(!knowt\.tag_uid\) \{\n\s+navigation\.navigate\('KnowtDetail'/);
});

// (c) Every failure says why, where it can be seen.

check('every scan failure but canceling produces a message', () => {
  const reasons = [
    'wrong-tag', 'timeout', 'radio-disabled', 'unsupported',
    'busy', 'no-uid', 'no-session', 'unknown',
  ];
  for (const reason of reasons) {
    const message = nfcFailureMessage(new NfcScanError(reason, 'raw detail'));
    assert.ok(message, `${reason} said nothing`);
    assert.ok(message.text.trim().length > 0, reason);
  }
  assert.equal(nfcFailureMessage(new NfcScanError('canceled', '')), null);
});

check('the scan path turns every one of them into an outcome', () => {
  // It never throws, so a caller cannot forget to catch it.
  assert.match(scan, /kind: 'failed'; message: string/);
  assert.match(scan, /return failure \? \{ kind: 'failed', message: failure\.text \} : \{ kind: 'canceled' \}/);
  // A read that worked but could not be written still says so.
  assert.match(scan, /The tag was read but it could not be recorded\./);
});

check('a failure is reported next to the button that caused it', () => {
  // The screen is long. A scan reporting a screen away from the finger that
  // started it is a scan that says nothing: the sheet does not open, nothing
  // changes, and the reason is out of sight.
  assert.match(detail, /const \[actionNotice, setActionNotice\]/);
  assert.match(detail, /if \(outcome\.kind === 'failed'\) setActionNotice\(outcome\.message\);/);
  const leadAt = detail.indexOf('<View style={styles.leadAction}>');
  const noticeAt = detail.indexOf('{actionNotice ? (');
  const notesAt = detail.indexOf('<Text style={styles.sectionTitle}>Notes</Text>');
  assert.ok(leadAt > 0 && noticeAt > leadAt, 'it is not inside the lead action');
  assert.ok(noticeAt < notesAt, 'it is below the button it explains');
  // One place only, now that the button is in one place.
  assert.equal(detail.match(/\{actionNotice \? \(/g)?.length, 1);
});

check('the attach reports wherever it was started from', () => {
  // One function, two call sites, each reporting next to itself.
  assert.match(detail, /const scanToAttach = async \(report = setNotice\) => \{/);
  assert.match(detail, /if \(failure\) report\(failure\.text\);/);
  assert.ok(!/if \(failure\) setNotice\(failure\.text\);/.test(detail));
});

check('the list reports above the scroll, where it cannot be scrolled off', () => {
  const noticeAt = list.indexOf('{notice ? (');
  const scrollAt = list.indexOf('<ScrollView showsVerticalScrollIndicator={false} style={styles.list}>');
  assert.ok(noticeAt > 0 && noticeAt < scrollAt, 'the notice is inside the list');
});

// What the completion looks like.

check('a scan writes a completion that resets with the day', () => {
  // `completeOccurrence` rather than `logCompletion`, which is the rule for
  // every completion path. With no occurrence passed there is no schedule to
  // name, which is what makes a Scan Knowt readable per day; an Upcoming row
  // passes one, because naming the firing is the only thing that stands its
  // alarm down.
  assert.match(scan, /scheduleId: occurrence\?\.scheduleId \?\? null,/);
  assert.match(scan, /method: 'scan',/);
  assert.match(scan, /completedAt: occurrence\?\.completedAt,/);
  // Named in a comment, never called.
  assert.doesNotMatch(scan, /await logCompletion|= logCompletion/);
});

check('the scan is bounded, so the button cannot stick on Scanning', () => {
  // The lesson from the alarm screen: a native call that never settles leaves
  // a disabled button reading Scanning with no way back.
  assert.match(scan, /settled\(/);
  assert.match(detail, /} finally \{\n\s+setBusy\(false\);/);
});

check('the expected tag goes down into the reader', () => {
  // So a wrong tag is rejected inside the system sheet, while the phone is
  // still against it, rather than after the sheet has closed.
  assert.match(scan, /expectRawUid: knowt\.tag_uid/);
  assert.match(scan, /expectLabel: knowt\.name/);
});

console.log(`\n${passed} checks passed`);
