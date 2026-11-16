/**
 * Crossing between the stored `HH:MM` and the Date the native picker takes.
 *
 * Replaces the old wheel's tests. The wheel is gone, and with it the geometry
 * that needed asserting; what is left is the conversion, which is where am and
 * pm, midnight and noon can still be got wrong.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs timeofday.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const { dateFromTime, partsOf, timeFromDate, twelveHour, TIME_PATTERN } =
  await import(`${ROOT}/src/components/timeOfDay.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const TODAY = new Date(2026, 9, 8);

check('every minute of the day survives the round trip', () => {
  // The only assertion that really matters: nothing the picker can be set to
  // may come back as a different time.
  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 1) {
      const stored = `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
      assert.equal(timeFromDate(dateFromTime(stored, TODAY)), stored);
    }
  }
});

check('the stored form is always two digits and two digits', () => {
  assert.equal(timeFromDate(new Date(2026, 9, 8, 7, 5)), '07:05');
  assert.equal(timeFromDate(new Date(2026, 9, 8, 0, 0)), '00:00');
  assert.match(timeFromDate(new Date(2026, 9, 8, 9, 9)), TIME_PATTERN);
});

check('midnight is midnight, not noon', () => {
  const d = dateFromTime('00:00', TODAY);
  assert.equal(d.getHours(), 0);
  assert.equal(timeFromDate(d), '00:00');
  assert.deepEqual(twelveHour('00:00'), { hour12: 12, minute: 0, isPm: false });
});

check('noon is noon, not midnight', () => {
  const d = dateFromTime('12:00', TODAY);
  assert.equal(d.getHours(), 12);
  assert.equal(timeFromDate(d), '12:00');
  assert.deepEqual(twelveHour('12:00'), { hour12: 12, minute: 0, isPm: true });
});

check('the am and pm boundary falls where it should', () => {
  // The two readings either side of noon, which is where a twelve hour clock
  // goes wrong if the arithmetic is naive.
  assert.deepEqual(twelveHour('11:59'), { hour12: 11, minute: 59, isPm: false });
  assert.deepEqual(twelveHour('12:01'), { hour12: 12, minute: 1, isPm: true });
  assert.deepEqual(twelveHour('13:00'), { hour12: 1, minute: 0, isPm: true });
  assert.deepEqual(twelveHour('23:59'), { hour12: 11, minute: 59, isPm: true });
  assert.deepEqual(twelveHour('00:01'), { hour12: 12, minute: 1, isPm: false });
});

check('the twelve hour reading is never 0 and never 13', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const { hour12 } = twelveHour(`${`${hour}`.padStart(2, '0')}:00`);
    assert.ok(hour12 >= 1 && hour12 <= 12, `${hour} read as ${hour12}`);
  }
});

check('the picker opens on today, carrying only the clock', () => {
  const d = dateFromTime('14:30', TODAY);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 8);
  assert.equal(d.getSeconds(), 0);
  assert.equal(d.getMilliseconds(), 0);
});

check('a value that was never set falls back rather than to midnight', () => {
  // Midnight would be an alarm nobody asked for. Eight is the same fallback
  // the old control used.
  for (const bad of ['', 'nonsense', '99:99', '24:00', '12', ':30', '8:xx']) {
    const { hour24 } = partsOf(bad);
    assert.equal(hour24, 8, `${JSON.stringify(bad)} did not fall back`);
  }
});

check('a reading inside the range is kept, not replaced', () => {
  assert.deepEqual(partsOf('00:00'), { hour24: 0, minute: 0 });
  assert.deepEqual(partsOf('23:59'), { hour24: 23, minute: 59 });
  assert.deepEqual(partsOf('9:05'), { hour24: 9, minute: 5 });
  assert.deepEqual(partsOf(' 09:05 '), { hour24: 9, minute: 5 });
});

check('a bad minute does not drag a good hour down with it', () => {
  assert.deepEqual(partsOf('09:99'), { hour24: 9, minute: 0 });
});

console.log(`\n${passed} checks passed`);
