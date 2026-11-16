/**
 * Monthly, six-monthly and annual repeats, which ride on repeat_type
 * 'interval' with interval_months set.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs monthly.test.ts
 */
import assert from 'node:assert/strict';

import {
  describeRepeat,
  isDueOn,
  nextOccurrence,
  weeklyDaysFor,
} from '../src/db/scheduling.ts';
import type { ScheduleRow } from '../src/db/types.ts';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function monthly(over: Partial<ScheduleRow>): ScheduleRow {
  return {
    id: 's', knowt_id: 'k', label: null, time: '08:00',
    repeat_type: 'interval', days_of_week: null,
    interval_days: null, interval_months: 1,
    supply_days: null, lead_days: null, start_date: '2026-01-15',
    enabled: 1, alarmkit_id: null,
    ...over,
  } as ScheduleRow;
}

const on = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('monthly fires on the anchor day each month', () => {
  const s = monthly({});
  assert.equal(isDueOn(s, on(2026, 0, 15)), true, 'January, the start');
  assert.equal(isDueOn(s, on(2026, 1, 15)), true, 'February');
  assert.equal(isDueOn(s, on(2026, 2, 15)), true, 'March');
});

check('monthly does not fire on other days', () => {
  const s = monthly({});
  assert.equal(isDueOn(s, on(2026, 1, 14)), false);
  assert.equal(isDueOn(s, on(2026, 1, 16)), false);
});

check('monthly never fires before its start date', () => {
  const s = monthly({ start_date: '2026-06-10' });
  assert.equal(isDueOn(s, on(2026, 4, 10)), false, 'May is before June');
  assert.equal(isDueOn(s, on(2026, 5, 10)), true);
});

check('the 31st falls back to the last day of a short month', () => {
  const s = monthly({ start_date: '2026-01-31' });
  assert.equal(isDueOn(s, on(2026, 0, 31)), true, 'January has a 31st');
  assert.equal(isDueOn(s, on(2026, 1, 28)), true, 'February 2026 ends on the 28th');
  assert.equal(isDueOn(s, on(2026, 1, 27)), false);
  assert.equal(isDueOn(s, on(2026, 3, 30)), true, 'April ends on the 30th');
  assert.equal(isDueOn(s, on(2026, 4, 31)), true, 'May has a 31st again');
});

check('the 31st lands on the 29th in a leap February', () => {
  const s = monthly({ start_date: '2024-01-31' });
  assert.equal(isDueOn(s, on(2024, 1, 29)), true, '2024 is a leap year');
  assert.equal(isDueOn(s, on(2024, 1, 28)), false);
});

check('the 30th also clamps in February', () => {
  const s = monthly({ start_date: '2026-01-30' });
  assert.equal(isDueOn(s, on(2026, 1, 28)), true);
});

check('a clamped month does not shift the ones after it', () => {
  const s = monthly({ start_date: '2026-01-31' });
  // February clamps to the 28th, but March must still be the 31st.
  assert.equal(isDueOn(s, on(2026, 2, 28)), false, 'March is not the 28th');
  assert.equal(isDueOn(s, on(2026, 2, 31)), true);
});

check('six monthly skips the months in between', () => {
  const s = monthly({ interval_months: 6, start_date: '2026-01-15' });
  assert.equal(isDueOn(s, on(2026, 0, 15)), true, 'January');
  assert.equal(isDueOn(s, on(2026, 1, 15)), false, 'February is not six months');
  assert.equal(isDueOn(s, on(2026, 6, 15)), true, 'July is');
  assert.equal(isDueOn(s, on(2027, 0, 15)), true, 'and the January after');
});

check('annual fires once a year, including across a leap year', () => {
  const s = monthly({ interval_months: 12, start_date: '2023-03-01' });
  assert.equal(isDueOn(s, on(2024, 2, 1)), true);
  assert.equal(isDueOn(s, on(2025, 2, 1)), true);
  assert.equal(isDueOn(s, on(2024, 2, 2)), false);
});

check('a leap day anniversary clamps in common years', () => {
  const s = monthly({ interval_months: 12, start_date: '2024-02-29' });
  assert.equal(isDueOn(s, on(2024, 1, 29)), true, 'the leap day itself');
  assert.equal(isDueOn(s, on(2025, 1, 28)), true, '2025 has no 29th');
  assert.equal(isDueOn(s, on(2028, 1, 29)), true, 'the next leap year');
});

check('nextOccurrence finds the next monthly date', () => {
  const s = monthly({ start_date: '2026-01-15', time: '08:00' });
  const at = nextOccurrence(s, new Date(2026, 0, 15, 9, 0, 0));
  assert.ok(at);
  assert.equal(at.getMonth(), 1, 'February');
  assert.equal(at.getDate(), 15);
  assert.equal(at.getHours(), 8);
});

check('nextOccurrence reaches a year ahead for an annual repeat', () => {
  const s = monthly({ interval_months: 12, start_date: '2026-03-01' });
  const at = nextOccurrence(s, new Date(2026, 2, 1, 9, 0, 0));
  assert.ok(at, 'an annual repeat must resolve inside the search horizon');
  assert.equal(at.getFullYear(), 2027);
  assert.equal(at.getMonth(), 2);
});

check('months beat days when both are somehow set', () => {
  const s = monthly({ interval_months: 1, interval_days: 3, start_date: '2026-01-15' });
  assert.equal(isDueOn(s, on(2026, 0, 18)), false, 'not the three day rhythm');
  assert.equal(isDueOn(s, on(2026, 1, 15)), true, 'the monthly one');
});

check('day intervals still work untouched', () => {
  const s = monthly({ interval_months: null, interval_days: 2, start_date: '2026-01-01' });
  assert.equal(isDueOn(s, on(2026, 0, 1)), true);
  assert.equal(isDueOn(s, on(2026, 0, 2)), false);
  assert.equal(isDueOn(s, on(2026, 0, 3)), true);
});

check('a monthly repeat is not a weekly one', () => {
  assert.equal(weeklyDaysFor(monthly({})), null, 'it cannot be a recurring alarm');
});

check('the copy reads properly for each shape', () => {
  assert.equal(describeRepeat(monthly({ interval_months: 1 })), 'Every month');
  assert.equal(describeRepeat(monthly({ interval_months: 6 })), 'Every 6 months');
  assert.equal(describeRepeat(monthly({ interval_months: 12 })), 'Every year');
  assert.equal(
    describeRepeat(monthly({ interval_months: null, interval_days: 2 })),
    'Every other day',
  );
  assert.equal(
    describeRepeat(monthly({ interval_months: null, interval_days: 14 })),
    'Every two weeks',
  );
  assert.equal(
    describeRepeat(monthly({ interval_months: null, interval_days: 90 })),
    'Every 90 days',
  );
});

check('a months value of zero is ignored rather than dividing by zero', () => {
  const s = monthly({ interval_months: 0, interval_days: 2, start_date: '2026-01-01' });
  assert.equal(isDueOn(s, on(2026, 0, 3)), true, 'falls through to days');
});

check('an interval with no start date never fires', () => {
  assert.equal(isDueOn(monthly({ start_date: null }), on(2026, 0, 15)), false);
});

console.log(`\n${passed} checks passed.`);
