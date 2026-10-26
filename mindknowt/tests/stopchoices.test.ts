/**
 * The three ways a Knowt stops, and the rename that came with the third.
 *
 * "Scan Knowt" used to mean "rings, and only the tag stops it". It now means
 * "no alarm at all", and the old behavior is called "Scan + Alarm". So the
 * thing most worth asserting is that nothing anywhere still reads the old
 * meaning, and that the stored values did not move: a Knowt saved as the old
 * Scan Knowt still stores `strict`, still requires a scan, and now simply
 * shows a different name.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs stopchoices.test.ts
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const modes = await import(`${ROOT}/src/knowts/modes.ts`);
const {
  missingFor,
  STOP_CHOICES,
  canScan,
  modeChoice,
  requiresScan,
  stopChoice,
  stopChoiceOf,
  stopLabelOf,
} = modes;

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const setup = read('src/screens/SetupKnowtScreen.tsx');
const edit = read('src/screens/EditKnowtScreen.tsx');
const detail = read('src/screens/KnowtDetailScreen.tsx');
const ringing = read('src/screens/RingingScreen.tsx');
const list = read('src/screens/AllKnowtsScreen.tsx');
const row = read('src/components/StopChoiceRow.tsx');
const pin = read('src/components/PinToggle.tsx');
const home = read('src/screens/HomeScreen.tsx');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const schedule = {
  id: 's1', knowt_id: 'k1', label: null, time: '09:00',
  repeat_type: 'daily', days_of_week: null, interval_days: null,
  interval_months: null, supply_days: null, lead_days: null,
  start_date: '2026-10-01', enabled: 1,
} as never;

const knowt = (over: Record<string, unknown>) =>
  ({
    id: 'k1', name: 'Vitamins', mode: 'open', tag_uid: null,
    schedules: [schedule], scan_only: 0, ...over,
  }) as never;

// The labels.

check('the three labels are exact, and in the order asked for', () => {
  assert.deepEqual(
    STOP_CHOICES.map((choice) => choice.label),
    ['Alarm Only', 'Scan Knowt', 'Scan + Alarm'],
  );
});

check('they stay close in length, which is why they were chosen', () => {
  const lengths = STOP_CHOICES.map((choice) => choice.label.length);
  assert.ok(
    Math.max(...lengths) - Math.min(...lengths) <= 2,
    `lengths ${lengths.join(', ')} are too far apart for one row`,
  );
});

check('no exclamation marks, no em dashes, Knowt capitalized', () => {
  for (const choice of STOP_CHOICES) {
    for (const text of [choice.label, choice.detail]) {
      assert.ok(!text.includes('!'), text);
      assert.ok(!text.includes('—'), text);
      assert.ok(!/\bknowt\b/.test(text), text);
    }
  }
});

// The stored values, which is the no-migration promise.

check('Scan + Alarm stores exactly what the old Scan Knowt stored', () => {
  // The whole of "existing Knowts keep working with no migration".
  assert.equal(stopChoice('both').mode, 'strict');
  assert.equal(stopChoice('alarm').mode, 'open');
  assert.equal(stopChoice('scan').mode, 'strict');
});

check('only the two ringing choices have a schedule', () => {
  assert.equal(stopChoice('alarm').rings, true);
  assert.equal(stopChoice('both').rings, true);
  assert.equal(stopChoice('scan').rings, false);
});

check('only Scan + Alarm needs a tag up front', () => {
  // Scan Knowt is choosable with none, because it carries a manual Mark done
  // and a way to attach one. An alarm only a tag stops, with no tag, is an
  // alarm nothing stops.
  assert.equal(stopChoice('both').needsTag, true);
  assert.equal(stopChoice('scan').needsTag, false);
  assert.equal(stopChoice('alarm').needsTag, false);
});

check('the two scanning choices no longer look identical', () => {
  // Scan Knowt and Scan + Alarm both wore the same single glyph, so the row
  // read as alarm, scan, scan. Scan + Alarm is both things and now shows both.
  assert.deepEqual(stopChoice('alarm').icons, ['alarm']);
  assert.deepEqual(stopChoice('scan').icons, ['knowtTag']);
  assert.deepEqual(stopChoice('both').icons, ['alarm', 'knowtTag']);
  // The viewfinder bracket is gone from all three.
  for (const value of ['alarm', 'scan', 'both'] as const) {
    assert.ok(!stopChoice(value).icons.includes('scan'), value);
  }
});

// Reading a stored Knowt back.

check('an existing Knowt saved as the old Scan Knowt now reads Scan + Alarm', () => {
  // strict plus a schedule and scan_only 0, which is what every row that
  // predates the column looks like after the upgrade.
  const old = knowt({ mode: 'strict', tag_uid: 'aa01' });
  assert.equal(stopChoiceOf(old), 'both');
  assert.equal(stopLabelOf(old), 'Scan + Alarm');
  // And it behaves exactly as before.
  assert.equal(requiresScan('strict'), true);
  assert.equal(modeChoice('strict'), 'strict');
  assert.equal(canScan('strict', 'aa01'), true);
});

check('a timed Alarm Only Knowt still reads Alarm Only', () => {
  const open = knowt({ mode: 'open' });
  assert.equal(stopChoiceOf(open), 'alarm');
  assert.equal(stopLabelOf(open), 'Alarm Only');
  assert.equal(requiresScan('open'), false);
});

check('the flag reads Scan Knowt whatever the mode', () => {
  // The mode cannot answer this one: a Scan Knowt stores `strict` once a tag
  // is attached and `open` before that.
  for (const mode of ['open', 'strict']) {
    const standing = knowt({ mode, schedules: [], scan_only: 1 });
    assert.equal(stopChoiceOf(standing), 'scan', mode);
    assert.equal(stopLabelOf(standing), 'Scan Knowt', mode);
  }
});

check('having no schedule does not make it a Scan Knowt', () => {
  // The reported bug. A Knowt applied from a preset has no schedule until
  // someone gives it a time, and four of them were being read as standing
  // scan items. It is Alarm Only, waiting for a time.
  const preset = knowt({ mode: 'open', schedules: [], scan_only: 0 });
  assert.equal(stopChoiceOf(preset), 'alarm');
  assert.equal(stopLabelOf(preset), 'Alarm Only');
});

check('the retired soft mode still reads Alarm Only', () => {
  const legacy = knowt({ mode: 'soft' });
  assert.equal(stopChoiceOf(legacy), 'alarm');
  assert.equal(stopLabelOf(legacy), 'Alarm Only');
});

check('a paused schedule is still Scan + Alarm', () => {
  const paused = knowt({
    mode: 'strict',
    schedules: [{ ...(schedule as never as object), enabled: 0 }],
  });
  assert.equal(stopChoiceOf(paused), 'both');
});

// Nothing still reads the old meaning.

check('the two-way helpers are gone, so nothing can read them', () => {
  // Deleted rather than adjusted: both answered from the mode alone, which can
  // no longer tell Scan Knowt from Scan + Alarm. Anything still reading them
  // fails to compile, which is the only guarantee worth having.
  assert.equal('MODE_CHOICES' in modes, false);
  assert.equal('modeLabel' in modes, false);
});

check('the superseded timing chooser is gone', () => {
  // It asked the same question in different words, and two controls for one
  // question can contradict each other.
  assert.equal(existsSync(`${ROOT}/src/components/TimingChoice.tsx`), false);
  for (const [name, source] of [['setup', setup], ['edit', edit]] as const) {
    assert.ok(!source.includes('TimingChoice'), `${name} still uses it`);
  }
});

check('no screen maps strict straight to the words Scan Knowt', () => {
  // The exact mistake to guard: a chip or row that renders the label from the
  // mode would say Scan Knowt for something that rings.
  for (const [name, source] of [
    ['setup', setup], ['edit', edit], ['detail', detail], ['list', list],
  ] as const) {
    assert.ok(
      !/'strict'[^\n]*Scan Knowt|Scan Knowt[^\n]*'strict'/.test(source),
      `${name} pairs strict with the old label`,
    );
  }
});

check('all three editors ask with the one component', () => {
  for (const [name, source] of [['setup', setup], ['edit', edit], ['detail', detail]] as const) {
    assert.match(source, /<StopChoiceRow/, `${name} rolls its own`);
  }
});

check('the chip on the detail screen reads from the Knowt, not the mode', () => {
  assert.match(detail, /<Pill label=\{stopLabelOf\(knowt\)\} \/>/);
});

check('the ringing screen asks for a tag, not for a mode', () => {
  // Its buttons are an action. Leaving them reading "Scan Knowt" would now
  // name one of the three modes on a button that changes none of them.
  assert.ok(!ringing.includes("'Scan Knowt'"), 'the old label is still a button');
  assert.match(ringing, /'Scan the tag'/);
  assert.match(ringing, /'Scan the tag instead'/);
});

check('the Knowts list tells four states apart', () => {
  // A Scan Knowt reads its state off the pill button now, not off this
  // function, but the branch stays because the label still has to be right
  // for any row that is listed without a scan control.

  // All four used to read "No schedule", which is why Supplements Tag Test
  // said one thing here and another on Daily.
  assert.match(list, /if \(isScanOnly\(knowt\)\) return doneToday \? SCANNED_TODAY : SCAN_ONLY_META;/);
  assert.match(list, /if \(knowt\.schedules\.length === 0\) return 'No schedule';/);
  assert.match(list, /\? 'Finished'/);
  assert.match(list, /: 'Paused'/);
});

// The MODE heading.

check('all three screens call the section Mode', () => {
  assert.match(detail, /<Text style=\{styles\.sectionTitle\}>Mode<\/Text>/);
  assert.match(edit, /<Text style=\{styles\.label\}>Mode<\/Text>/);
  assert.match(setup, /title="Mode"/);
  for (const [name, source] of [
    ['detail', detail], ['edit', edit], ['setup', setup],
  ] as const) {
    assert.ok(!source.includes('How it stops'), `${name} still says it`);
  }
});

// The support text under the row.

check('the Scan Knowt support text is exactly what was asked for', () => {
  assert.equal(
    stopChoice('scan').detail,
    'No alarm, no schedule. Press Scan Knowt to log when you tap its tag. Pin it to keep it at the top of your Knowts.',
  );
});

check('the other two have support lines in the same plain style', () => {
  for (const value of ['alarm', 'both'] as const) {
    const detail = stopChoice(value).detail;
    assert.ok(detail.length > 20, `${value} has no support line`);
    assert.ok(detail.trim().endsWith('.'), `${value} does not end in a period`);
    assert.ok(!detail.includes('!'), value);
    assert.ok(!detail.includes('\u2014'), value);
    // The tag requirement is not stated before it applies.
    assert.ok(!detail.includes('needs a tag'), `${value} states the tag rule`);
  }
});

check('the note says what is still missing, and only for Scan + Alarm', () => {
  // It used to be one flat sentence, written while Scan + Alarm could not be
  // chosen without a tag. It can now, so the note names whatever is left.
  const both = (tagged: boolean, scheduled: boolean) =>
    missingFor('both', { tagged, scheduled });
  assert.equal(both(true, true), null);
  assert.match(both(false, false) ?? '', /Knowt Tag and a schedule/);
  assert.match(both(false, true) ?? '', /Knowt Tag\./);
  assert.match(both(true, false) ?? '', /a schedule\./);
  // Every one of them says what the consequence is, which is the point.
  for (const text of [both(false, false), both(false, true), both(true, false)]) {
    assert.match(text ?? '', /will not ring until it has/);
    assert.ok(!(text ?? '').includes('!'));
  }
  // The other two modes are never incomplete.
  for (const value of ['alarm', 'scan'] as const) {
    assert.equal(missingFor(value, { tagged: false, scheduled: false }), null);
  }
  // Rendered by the one component, so no screen can forget it or add its own.
  assert.match(row, /missingFor\(value, \{ tagged, scheduled \}\)/);
  for (const [name, source] of [
    ['detail', detail], ['edit', edit], ['setup', setup],
  ] as const) {
    assert.ok(
      !source.includes('will not ring until it has a Knowt Tag and'),
      `${name} writes its own copy of it`,
    );
  }
});

check('no mode card is ever disabled or grayed out', () => {
  // Scan + Alarm was `disabled` whenever there was no tag, so the one mode
  // that needs setting up was the one mode that could not be chosen: it drew
  // in the muted gray and the press did nothing at all.
  assert.ok(!row.includes('cardBlocked'), 'the blocked fill is still there');
  assert.ok(!row.includes('labelBlocked'), 'the blocked label is still there');
  assert.ok(!row.includes('disabled={'), 'a card is still disabled');
  assert.ok(!row.includes('needsTag && !tagged'), 'the gate is still there');
  assert.match(row, /accessibilityState=\{\{ selected: on \}\}/);
  assert.match(row, /style=\{\[styles\.card, on && styles\.cardOn\]\}/);
});

check('the support text is emphasized by ink and size, not by weight', () => {
  // `fontWeight` does nothing useful with the rounded family: it resolves to
  // the regular face and then matches the weight against plain San Francisco,
  // so asking for bold changes nothing or drops the rounding.
  assert.match(row, /support: \{/);
  assert.match(row, /color: theme\.color\.textPrimary/);
  // Matched on the code, since the comment explaining the limit says the word
  // too.
  const code = row.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.ok(!code.includes('fontWeight'), 'it asks for a weight');
});

// The Scan Knowt action.

check('the detail screen leads with the scan, not the ringing screen', () => {
  assert.match(detail, /'Scan Knowt'/);
  assert.match(detail, /'Add a Knowt Tag to scan'/);
  assert.match(detail, /'Done today'/);
  assert.match(detail, /scanKnowtTag/);
  // The quieter fallback stays, and it scans too: a Scan Knowt cannot be
  // finished by a tap any more, so the label says what the button does.
  assert.match(detail, /label="Scan the tag"\n\s+variant="secondary"/);
  assert.ok(!detail.includes('label="Mark done"'));
  // And nothing routes a Knowt to the ringing screen any more.
  assert.ok(!home.includes("navigate('Ringing'"), 'Daily still opens Ringing');
});

check('the wording matches between the support text and the button', () => {
  // The support text tells the person to press Scan Knowt, so that has to be
  // what the button says. "Scan to log" was the earlier wording.
  assert.ok(stopChoice('scan').detail.includes('Press Scan Knowt'));
  // And the button on the detail screen is the one it names.
  assert.match(detail, /label=\{scanLabel\}/);
  assert.match(detail, /\? 'Scan Knowt'/);
  for (const [name, source] of [['detail', detail], ['list', list]] as const) {
    assert.ok(!source.includes('Scan to log'), `${name} still says Scan to log`);
  }
});

check('the list can start a scan without opening the Knowt', () => {
  assert.match(list, /onScan/);
  assert.match(list, /scanKnowtTag/);
  assert.match(list, /SCANNED_TODAY/);
});

// Pinned.

check('Pinned leads the Knowts tab and is absent when empty', () => {
  assert.match(list, /name="Pinned"/);
  // Absent, not an empty heading, the same as Upcoming on Daily.
  assert.match(list, /\{pinned\.length > 0 \? \(/);
  assert.match(list, /const pinned = visible\.filter\(\(knowt\) => knowt\.is_pinned === 1\);/);
  // Above the category groups.
  assert.ok(
    list.indexOf('name="Pinned"') < list.indexOf('{sections.map((section) => ('),
    'Pinned is not above the categories',
  );
});

check('the pin toggle is offered for every mode, under the support text', () => {
  for (const [name, source] of [['detail', detail], ['edit', edit]] as const) {
    assert.match(source, /<PinToggle/, name);
    // Directly after the row, which renders the support text, and not inside
    // any per-mode branch.
    const rowAt = source.indexOf('<StopChoiceRow');
    const pinAt = source.indexOf('<PinToggle');
    assert.ok(pinAt > rowAt, `${name} puts the toggle above the row`);
    assert.ok(pinAt - rowAt < 400, `${name} separates them`);
  }
  // The old button next to Archive and Delete is gone.
  assert.ok(!detail.includes("'Pin to the top'"));
});

check('pinning needed no column', () => {
  // is_pinned arrived at schema 13.
  assert.match(list, /setPinned/);
  assert.match(pin, /is_pinned` already existed/);
});

check('nothing user facing says the stored word out loud', () => {
  // The notice read "is now strict", which leaked a column into a sentence and
  // named something that is no longer one thing. Matched on the rendered form
  // rather than the words, since the comment explaining the fix says them too.
  assert.ok(
    !/is now strict\./.test(detail.replace(/\/\/[^\n]*/g, '')),
    'a column leaked into a sentence',
  );
  assert.match(detail, /is now \$\{stopLabelOf\(refreshed\)\}/);
});

// Three in one row, on the narrowest iPhone iOS 26.1 runs on.

/**
 * Advances per 1000 em, SF Pro, for the characters these labels use.
 * Approximate, and that is the point: the assertion below has room for the
 * approximation, and what it really catches is a label changed to something
 * far longer.
 */
const ADVANCE: Record<string, number> = {
  A: 636, O: 744, S: 598, K: 662, '+': 600, ' ': 232,
  a: 544, c: 526, l: 262, m: 898, n: 597, o: 598, r: 388, t: 370, w: 770, y: 530,
};

function widthAt(text: string, points: number): number {
  let em = 0;
  for (const character of text) {
    const advance = ADVANCE[character];
    assert.ok(advance, `no advance recorded for "${character}"`);
    em += advance;
  }
  return (em / 1000) * points;
}

check('the longest label fits the narrowest column at full size', () => {
  // The Setup screen is the tightest: 375pt screen, 24pt page padding each
  // side, 16pt step card padding each side, two 8pt gaps, split three ways,
  // less a 1pt border each side. The cards carry no horizontal padding, for
  // exactly this reason.
  const column = (375 - 24 * 2 - 16 * 2 - 8 * 2) / 3 - 2;
  assert.ok(column > 90 && column < 92, `column measured ${column}`);

  const widest = Math.max(...STOP_CHOICES.map((c) => widthAt(c.label, 14)));
  assert.ok(widest < column, `widest label ${widest.toFixed(1)} over ${column}`);
  // And the shrink floor leaves real headroom, so the estimate above being a
  // few points optimistic still does not truncate anything.
  assert.ok(widest * 0.85 < column - 15);
});

check('the row holds every label to one line and keeps the heights equal', () => {
  assert.match(row, /numberOfLines=\{1\}/);
  assert.match(row, /adjustsFontSizeToFit/);
  assert.match(row, /minimumFontScale=\{0\.85\}/);
  // A label that shrank would otherwise leave its card shorter than the others.
  assert.match(row, /lineHeight: 18/);
  // Equal width comes from flex, not from a guess at the screen.
  assert.match(row, /flex: 1/);
});

console.log(`\n${passed} checks passed`);
