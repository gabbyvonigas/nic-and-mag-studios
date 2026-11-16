/**
 * What Daily says is snoozed, and for how much longer.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs snoozed.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { buildSnoozed, showSnoozed, snoozeCountdown } = await import(
  `${ROOT}/src/knowts/snoozed.ts`
);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const NOW = new Date(2026, 5, 24, 9, 0, 0).getTime();
const MIN = 60_000;

let seq = 0;
function alarm(
  knowtId: string,
  minutesFromNow: number,
  kind = 'snooze',
): never {
  seq += 1;
  return {
    id: `p${seq}`,
    knowt_id: knowtId,
    schedule_id: null,
    alarmkit_id: `ak${seq}`,
    fires_at: NOW + minutesFromNow * MIN,
    kind,
    signature: null,
    created_at: NOW,
  } as never;
}

const KNOWTS = [
  { id: 'k1', name: 'Vitamins', category: null },
  { id: 'k2', name: 'Trash out', category: null },
  { id: 'k3', name: 'Stretch', category: null },
] as never[];

const build = (alarms: never[], now = NOW) =>
  buildSnoozed({ alarms, knowts: KNOWTS, now } as never);

check('a snoozed knowt is listed with the minutes left', () => {
  const list = build([alarm('k1', 9)] as never[]);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.knowt.id, 'k1');
  assert.equal(list[0]!.minutesLeft, 9);
  assert.equal(list[0]!.firesAt, NOW + 9 * MIN);
});

check('only snoozes count, not scheduled alarms or test rings', () => {
  // Every knowt with a schedule has a pending scheduled alarm. Counting those
  // would report the entire app as snoozed.
  const list = build([
    alarm('k1', 30, 'scheduled'),
    alarm('k2', 10, 'refire'),
    alarm('k3', 5, 'test'),
  ] as never[]);
  assert.deepEqual(list, []);
});

check('a snooze that has come due is no longer snoozed', () => {
  assert.deepEqual(build([alarm('k1', -1)] as never[]), []);
  // Exactly now is due, not pending. It is ringing, which is a different screen.
  assert.deepEqual(build([alarm('k1', 0)] as never[]), []);
  assert.equal(build([alarm('k1', 0.5)] as never[]).length, 1);
});

check('the soonest one wins when a knowt has two snoozes', () => {
  // Listing it twice would read as two separate things waiting.
  const list = build([alarm('k1', 40), alarm('k1', 8)] as never[]);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.minutesLeft, 8);
});

check('the list runs soonest first', () => {
  const list = build([
    alarm('k3', 50),
    alarm('k1', 5),
    alarm('k2', 20),
  ] as never[]);
  assert.deepEqual(
    list.map((entry: { knowt: { id: string } }) => entry.knowt.id),
    ['k1', 'k2', 'k3'],
  );
});

check('an alarm for a knowt that is gone does not crash the section', () => {
  // A deleted knowt can leave a pending row behind, and reading .name off
  // undefined would take the whole screen down.
  const list = build([alarm('ghost', 10), alarm('k1', 12)] as never[]);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.knowt.id, 'k1');
});

check('a snooze crossing midnight is still snoozed today', () => {
  // Snoozed at 11:55pm for 30 minutes: it fires tomorrow, but right now it is
  // snoozed, and right now is the only thing this section is about.
  const late = new Date(2026, 5, 24, 23, 55, 0).getTime();
  const list = buildSnoozed({
    alarms: [
      {
        id: 'p99',
        knowt_id: 'k1',
        schedule_id: null,
        alarmkit_id: 'ak99',
        fires_at: late + 30 * MIN,
        kind: 'snooze',
        signature: null,
        created_at: late,
      },
    ],
    knowts: KNOWTS,
    now: late,
  } as never);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.minutesLeft, 30);
  assert.equal(new Date(list[0]!.firesAt).getDate(), 25, 'it fires tomorrow');
});

check('nothing snoozed is an empty list, not a placeholder row', () => {
  assert.deepEqual(build([] as never[]), []);
});

// The countdown copy.

check('the countdown says when it comes back', () => {
  assert.equal(snoozeCountdown(9), 'Back in 9 min');
  assert.equal(snoozeCountdown(1), 'Back in 1 min');
  assert.equal(snoozeCountdown(65), 'Back in 1 hr 5 min');
  assert.equal(snoozeCountdown(120), 'Back in 2 hr');
});

check('the last minute does not read as zero', () => {
  // "Back in 0 min" is the obvious failure here, and it would sit on screen
  // for a full minute.
  assert.equal(snoozeCountdown(0.4), 'Back in under a minute');
  assert.equal(snoozeCountdown(0.01), 'Back in under a minute');
  for (let m = 0.01; m < 3; m += 0.01) {
    const label = snoozeCountdown(m);
    assert.ok(!label.includes('0 min'), `${m} gave ${label}`);
  }
});

check('a countdown that has run out says so rather than going negative', () => {
  assert.equal(snoozeCountdown(0), 'Ringing now');
  assert.equal(snoozeCountdown(-5), 'Ringing now');
});

// When the section shows at all.

check('the section is absent when nothing is snoozed', () => {
  assert.equal(showSnoozed({ count: 0, stance: 'today' }), false);
  assert.equal(showSnoozed({ count: 1, stance: 'today' }), true);
});

check('the section is only on today', () => {
  // A countdown against a day in the past or the future is counting down to
  // something that has nothing to do with the day on screen.
  assert.equal(showSnoozed({ count: 3, stance: 'past' }), false);
  assert.equal(showSnoozed({ count: 3, stance: 'future' }), false);
});

// Where the section sits.

const home = readFileSync(
  `${ROOT}/src/screens/HomeScreen.tsx`,
  'utf8',
);

check('the card is spaced off the week strip above it', () => {
  // It was reported as sitting against the dots row. The gap is the same one
  // the scrolling content puts between its own sections, and it is on the one
  // wrapper that holds every snoozed Knowt, so two of them space the same as
  // one.
  const style = home.match(/\n {2}snoozed: \{[^}]*\}/)?.[0] ?? '';
  assert.match(style, /marginTop: theme\.spacing\.md/);
  assert.match(style, /marginBottom: theme\.spacing\.md/);
});

check('the Snoozed heading is the only thing between them', () => {
  // One section, one heading, whatever the count. The count goes in the
  // heading rather than into a second card.
  assert.equal(home.match(/<SnoozedSection/g)?.length, 1);
});

console.log(`\n${passed} checks passed`);
