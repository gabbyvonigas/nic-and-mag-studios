/**
 * The Lock Screen banner's text, and the alarm signature that decides when a
 * banner already handed to the system has gone stale.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs banner.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { bannerTitle, snoozeLabel, stopLabel, MODULE_DEFAULT_SNOOZE_MINUTES } =
  await import(`${ROOT}/src/alarms/banner.ts`);
const { desiredFor, signatureOf } = await import(`${ROOT}/src/alarms/scheduleSync.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('the name comes first, so the system truncates the time', () => {
  // AlarmPresentation.Alert takes one string and has no subtitle, so the time
  // shares the title's line. Which half survives a long name matters.
  assert.equal(bannerTitle('Exfoliate', '4:23 pm'), 'Exfoliate · 4:23 pm');
  assert.ok(bannerTitle('Exfoliate', '4:23 pm').startsWith('Exfoliate'));
});

check('no time means no separator left hanging', () => {
  assert.equal(bannerTitle('Exfoliate'), 'Exfoliate');
  assert.equal(bannerTitle('Exfoliate', null), 'Exfoliate');
  assert.equal(bannerTitle('Exfoliate', '   '), 'Exfoliate');
});

check('a nameless Knowt still says something', () => {
  assert.equal(bannerTitle('   ', '4:23 pm'), '4:23 pm');
  assert.equal(bannerTitle('', null), '');
});

check('whitespace in either part does not reach the banner', () => {
  assert.equal(bannerTitle('  Exfoliate  ', ' 4:23 pm '), 'Exfoliate · 4:23 pm');
});

check('no em dash is ever used to join them', () => {
  assert.ok(!bannerTitle('Exfoliate', '4:23 pm').includes('—'));
});

check('the snooze button says how long it defers for', () => {
  // The glyph is "zzz" and cannot be changed from JavaScript, so the words are
  // the only place the length can be stated.
  assert.equal(snoozeLabel(5), 'Snooze 5 min');
  assert.equal(snoozeLabel(10), 'Snooze 10 min');
  assert.equal(snoozeLabel(1), 'Snooze 1 min');
});

check('a length that is not a length falls back to the bare word', () => {
  // Better a plain "Snooze" than a button promising "Snooze NaN min".
  for (const bad of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
    assert.equal(snoozeLabel(bad as number), 'Snooze');
  }
});

check('the stop button is the only place a scan can be asked for', () => {
  assert.equal(stopLabel(true), 'Scan to stop');
  assert.equal(stopLabel(false), 'Done');
  assert.equal(stopLabel(), 'Done');
});

check('the module default is recorded, because nobody chose it', () => {
  // What AlarmKit counts down for when no snoozeDuration is handed over.
  assert.equal(MODULE_DEFAULT_SNOOZE_MINUTES, 9);
});

// The signature. Both of the new parts are on the banner, so an alarm armed
// before either changed is stale even though its time has not moved.

const row = {
  id: 'sched-9am',
  knowt_id: 'k1',
  label: null,
  time: '09:00',
  repeat_type: 'daily',
  days_of_week: null,
  interval_days: null,
  interval_months: null,
  supply_days: null,
  lead_days: null,
  start_date: '2026-10-01',
  enabled: 1,
} as never;

const knowt = (over: Record<string, unknown> = {}) =>
  ({
    id: 'k1',
    name: 'Morning supplements',
    mode: 'scan',
    snooze_minutes: 5,
    ...over,
  }) as never;

const desired = desiredFor(row, new Date(2026, 9, 12, 7), new Set());

check('changing the snooze length restates the alarm', () => {
  // The Snooze button's label and the countdown it starts are the same number,
  // so an alarm armed at five minutes is wrong once the Knowt says ten.
  assert.notEqual(
    signatureOf(knowt(), row, desired),
    signatureOf(knowt({ snooze_minutes: 10 }), row, desired),
  );
});

check('changing the mode restates the alarm', () => {
  // It decides whether Stop says "Scan to stop" or "Done".
  assert.notEqual(
    signatureOf(knowt(), row, desired),
    signatureOf(knowt({ mode: 'alarm' }), row, desired),
  );
});

check('nothing else changing leaves the signature alone', () => {
  assert.equal(signatureOf(knowt(), row, desired), signatureOf(knowt(), row, desired));
});

console.log(`\n${passed} checks passed`);
