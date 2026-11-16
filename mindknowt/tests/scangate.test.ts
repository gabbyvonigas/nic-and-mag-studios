/**
 * Every path that can finish a Knowt, and whether a tap is allowed to.
 *
 * Reported as: a Scan + Alarm Knowt with a tag and one "Once" schedule was
 * marked done by tapping the ring on its Today card. No reader opened and
 * nothing was said. The Upcoming ring had been gated the round before and the
 * Today card had not, because each half of Daily wrote its own completion.
 *
 * That is the shape of this bug and the reason this file exists: the question
 * "does this Knowt need a scan" was asked next to one control instead of once,
 * so a new entry point could forget to ask. `needsScan` lives in
 * `knowts/modes.ts` now, and every path is checked here by name.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs scangate.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const read = (path: string) => readFileSync(`${ROOT}/${path}`, 'utf8');
const home = read('src/screens/HomeScreen.tsx');
const detail = read('src/screens/KnowtDetailScreen.tsx');
const list = read('src/screens/AllKnowtsScreen.tsx');
const scan = read('src/knowts/scanKnowt.ts');
const ringing = read('src/screens/RingingScreen.tsx');
const session = read('src/ringing/useRingingSession.ts');

const { needsScan, stopChoiceOf } = await import(`${ROOT}/src/knowts/modes.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const knowt = (over: Record<string, unknown>) =>
  ({ mode: 'open', scan_only: 0, ...over }) as never;

// --- The one question, asked in one place. -------------------------------

check('needsScan answers for all three Modes, from the Knowt', () => {
  // Alarm Only.
  assert.equal(needsScan(knowt({ mode: 'open', scan_only: 0 })), false);
  // Scan + Alarm. Stores `strict`.
  assert.equal(needsScan(knowt({ mode: 'strict', scan_only: 0 })), true);
  // Scan Knowt. Stores `strict` too, or `open` when it has no tag yet, and the
  // flag is what makes it one either way.
  assert.equal(needsScan(knowt({ mode: 'strict', scan_only: 1 })), true);
  assert.equal(needsScan(knowt({ mode: 'open', scan_only: 1 })), true);
  // Which is exactly "not Alarm Only", and asked of the Knowt rather than the
  // mode column, because `strict` no longer names one thing.
  for (const k of [
    knowt({ mode: 'open' }),
    knowt({ mode: 'strict' }),
    knowt({ mode: 'strict', scan_only: 1 }),
  ]) {
    assert.equal(needsScan(k), stopChoiceOf(k) !== 'alarm');
  }
});

check('it is defined once and imported, not copied beside a control', () => {
  assert.match(read('src/knowts/modes.ts'), /export function needsScan\(/);
  assert.match(home, /import \{ needsScan \} from '\.\.\/knowts\/modes';/);
  assert.match(detail, /needsScan,/);
  // Not a second definition on a screen.
  assert.ok(!home.includes('function needsScan'), 'HomeScreen defines its own');
  assert.ok(!detail.includes('function needsScan'), 'the detail screen defines its own');
});

// --- Every completion path. ----------------------------------------------

check('Daily: one dispatcher, and both rings go through it', () => {
  // The Today card used to call a completion of its own with no Mode check at
  // all, which is the bug. There is one `completeOccurrence` call on this
  // screen now and it sits behind the gate.
  assert.match(home, /const completeTarget = async \(target: Target\) => \{/);
  assert.match(home, /if \(!needsScan\(target\.knowt\)\) \{/);
  assert.match(home, /\? \(\) => void completeTarget\(cardTarget\(card\)\)/);
  assert.match(home, /onComplete=\{\(entry\) => void completeTarget\(upcomingTarget\(entry\)\)\}/);
  assert.equal(home.match(/completeOccurrence\(\{/g)?.length, 1);
  // And the scan is what writes it for a scan Mode.
  assert.match(home, /await scanKnowtTag\(/);
});

check('Knowt detail: Done and the quieter button both scan for a scan Mode', () => {
  // One function serves both, and the gate is the first thing in it after the
  // occurrence is named.
  assert.equal(detail.match(/void finishNow\(\)/g)?.length, 2);
  const at = detail.indexOf('const finishNow');
  const body = detail.slice(at, detail.indexOf('/** Puts it off again', at));
  assert.match(body, /if \(needsScan\(knowt\)\) \{/);
  assert.match(body, /const scanned = await scanKnowtTag\(/);
  assert.match(body, /if \(scanned\.kind === 'canceled'\) return;/);
  assert.match(body, /if \(scanned\.kind === 'failed'\) \{/);
  // The tap path is below the gate and returns before reaching it.
  const gate = body.indexOf('if (needsScan(knowt))');
  const tap = body.indexOf("method: 'tap',");
  assert.ok(gate > 0 && tap > gate, 'the tap path runs before the gate');
  // And the labels say which.
  assert.match(detail, /label=\{needsScan\(knowt\) \? 'Scan the tag' : 'Done'\}/);
  assert.ok(!detail.includes('label="Mark done"'), 'a tap still claims to finish one');
});

check('the Knowts list row and the detail lead button were already scans', () => {
  // Neither has ever completed without a read; both go through the one module.
  assert.match(list, /const outcome = await scanKnowtTag\(knowt\);/);
  assert.match(detail, /const outcome = await scanKnowtTag\(knowt\);/);
});

check('the scan module is the only thing that writes a scan completion', () => {
  assert.match(scan, /method: 'scan',/);
  assert.match(scan, /expectRawUid: knowt\.tag_uid,/);
  // No tag, nothing to scan, nothing written.
  assert.match(scan, /if \(!knowt\.tag_uid\) \{/);
  assert.match(scan, /There is nothing to scan|nothing to scan/);
  // A failure or a cancel returns before the completion.
  const write = scan.indexOf('completeOccurrence({');
  assert.ok(scan.indexOf('return failure ?') < write, 'it records before it checks');
});

check('the ringing screen keeps its scan, and the Override is the one exception', () => {
  // A scan Mode gets no Done button there either: it gets Scan the tag.
  assert.match(ringing, /\{scanRequired \? \(\n\s+<Button\n\s+label=\{scanning \? 'Scanning' : 'Scan the tag'\}/);
  assert.match(ringing, /\) : \(\n\s+<Button label="Done" onPress=\{\(\) => void finish\(\(\) => complete\('tap'\)\)\} \/>/);
  // The Override is a hold, it is gated to a scan Mode, and it records as an
  // override rather than as a tap or a scan, which is what makes it the one
  // way out that the Log can tell apart.
  assert.match(ringing, /\{scanRequired && \(/);
  assert.match(ringing, /holdMs=\{OVERRIDE_HOLD_MS\}/);
  assert.match(ringing, /complete\('override', atToday\(doneAt\)\)/);
  assert.match(ringing, /recorded as an override, not\n\s+as a scan\./);
  assert.match(session, /method: Extract<EventMethod, 'tap' \| 'override'>,/);
});

check('nothing else in the app writes a completion', () => {
  // The sweep: every call site of the three writers, named. A new one has to
  // be added here, which is the point.
  const sites: [string, string, number][] = [
    ['src/screens/HomeScreen.tsx', 'completeOccurrence({', 1],
    ['src/screens/KnowtDetailScreen.tsx', 'completeOccurrence({', 1],
    ['src/knowts/scanKnowt.ts', 'completeOccurrence({', 1],
    ['src/ringing/useRingingSession.ts', 'completeRinging(', 1],
  ];
  for (const [path, call, count] of sites) {
    const found = read(path).split(call).length - 1;
    assert.equal(found, count, `${path} has ${found} of ${call}`);
  }
  // `logCompletion` is reached only through `completeOccurrence`, which is what
  // makes "every completion resyncs" true.
  assert.match(
    read('src/knowts/completeOccurrence.ts'),
    /const eventId = await logCompletion\(args\);/,
  );
  for (const path of [
    'src/screens/HomeScreen.tsx',
    'src/screens/KnowtDetailScreen.tsx',
    'src/screens/AllKnowtsScreen.tsx',
    'src/screens/RingingScreen.tsx',
    'src/knowts/scanKnowt.ts',
  ]) {
    assert.ok(
      !/await logCompletion\(|= logCompletion\(/.test(read(path)),
      `${path} writes a history row directly`,
    );
  }
});

check('no widget or notification can finish one, because none exists', () => {
  // The alarm's own buttons run App Intents in the module, which write App
  // Group records and never a completion. Stop opens the app and the app
  // decides; there is no widget extension in this project at all.
  const module = 'node_modules/expo-alarm-kit/ios/ExpoAlarmKitModule.swift';
  let swift = '';
  try {
    swift = read(module);
  } catch {
    // A bare clone has no node_modules. The other checks still hold.
    return;
  }
  assert.ok(!swift.includes('completeOccurrence'));
  assert.ok(!swift.includes('events'), 'the module touches the events table');
});

// --- A "Once" schedule, and a Knowt with no tag. -------------------------

check('a Once schedule is gated the same as any other', () => {
  // Nothing in the gate reads `repeat_type`: it asks the Knowt, not the
  // schedule, so a one-off cannot slip past by being a one-off. This is the
  // exact shape of the Knowt in the report.
  const once = knowt({ mode: 'strict', scan_only: 0 });
  assert.equal(needsScan(once), true);
  const at = home.indexOf('const completeTarget');
  const after = home.slice(at, at + 1400);
  assert.ok(!after.includes('repeat_type'), 'the gate looks at the schedule');
  assert.ok(!after.includes("'once'"), 'the gate special cases a one-off');
});

check('a scan Mode with no tag completes nothing and says why', () => {
  // The reader is never opened, because there is nothing to hold the phone to.
  // One message, in the scan module, so all four entry points say it.
  assert.match(scan, /This Knowt has no tag yet, so there is nothing to scan\. Attach one first\./);
  const at = scan.indexOf('if (!knowt.tag_uid) {');
  const body = scan.slice(at, at + 320);
  assert.match(body, /kind: 'failed'/);
  assert.ok(!body.includes('completeOccurrence'));
});

console.log(`\n${passed} checks passed`);
