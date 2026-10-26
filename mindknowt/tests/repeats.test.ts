/**
 * Repeat presets: the mapping onto schedule columns, and recognizing an
 * existing schedule again.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs repeats.test.ts
 */
import assert from 'node:assert/strict';

import {
  presetFor,
  REPEAT_PRESETS,
  shapeFor,
  type RepeatPresetId,
} from '../src/knowts/repeats.ts';
import { isDueOn } from '../src/db/scheduling.ts';
import type { ScheduleRow } from '../src/db/types.ts';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/** Builds the row a screen would write for a preset. */
function rowFor(
  id: RepeatPresetId,
  options: { days?: number[]; count?: number; start?: string } = {},
): ScheduleRow {
  const shape = shapeFor(id, options);
  return {
    id: 's', knowt_id: 'k', label: null, time: '08:00',
    repeat_type: shape.repeatType,
    days_of_week: shape.daysOfWeek ? JSON.stringify(shape.daysOfWeek) : null,
    interval_days: shape.intervalDays,
    interval_months: shape.intervalMonths,
    supply_days: null, lead_days: null,
    start_date: shape.needsStartDate ? (options.start ?? '2026-01-01') : null,
    enabled: 1, alarmkit_id: null,
  } as ScheduleRow;
}

const on = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('every preset survives a round trip back to itself', () => {
  for (const preset of REPEAT_PRESETS) {
    const options =
      preset.id === 'weekly'
        ? { days: [4] }
        : preset.id === 'certain_days'
          ? { days: [2, 4, 6] }
          : preset.id === 'every_n_days'
            ? { count: 5 }
            : {};
    const row = rowFor(preset.id, options);
    assert.equal(
      presetFor(row),
      preset.id,
      `${preset.id} came back as ${presetFor(row)}`,
    );
  }
});

check('every other day skips a day', () => {
  const row = rowFor('every_other_day', { start: '2026-01-01' });
  assert.equal(isDueOn(row, on(2026, 0, 1)), true);
  assert.equal(isDueOn(row, on(2026, 0, 2)), false);
  assert.equal(isDueOn(row, on(2026, 0, 3)), true);
});

check('every two weeks lands on the same weekday', () => {
  // 2026-01-01 is a Thursday.
  const row = rowFor('biweekly', { start: '2026-01-01' });
  assert.equal(on(2026, 0, 1).getDay(), 4, 'fixture assumes a Thursday');
  assert.equal(isDueOn(row, on(2026, 0, 15)), true, 'two weeks on');
  assert.equal(isDueOn(row, on(2026, 0, 8)), false, 'not the week between');
  assert.equal(on(2026, 0, 15).getDay(), 4, 'still a Thursday');
});

check('today plus N days counts from the start date', () => {
  const row = rowFor('every_n_days', { count: 5, start: '2026-03-10' });
  assert.equal(row.interval_days, 5);
  assert.equal(isDueOn(row, on(2026, 2, 10)), true);
  assert.equal(isDueOn(row, on(2026, 2, 15)), true);
  assert.equal(isDueOn(row, on(2026, 2, 14)), false);
});

check('a count below one is refused rather than dividing by zero', () => {
  assert.equal(shapeFor('every_n_days', { count: 0 }).intervalDays, 1);
  assert.equal(shapeFor('every_n_days', { count: -4 }).intervalDays, 1);
  assert.equal(shapeFor('every_n_days', { count: 2.6 }).intervalDays, 3);
});

check('weekly fires on the chosen day only', () => {
  // 5 is Thursday, Sunday being 1.
  const row = rowFor('weekly', { days: [5] });
  assert.equal(isDueOn(row, on(2026, 0, 1)), true, 'Thursday');
  assert.equal(isDueOn(row, on(2026, 0, 2)), false, 'Friday');
  assert.equal(isDueOn(row, on(2026, 0, 8)), true, 'the next Thursday');
});

check('certain days fires on each chosen day', () => {
  const row = rowFor('certain_days', { days: [2, 6] });
  assert.equal(isDueOn(row, on(2026, 0, 5)), true, 'Monday');
  assert.equal(isDueOn(row, on(2026, 0, 9)), true, 'Friday');
  assert.equal(isDueOn(row, on(2026, 0, 7)), false, 'Wednesday');
});

check('chosen days are sorted and deduplicated', () => {
  assert.deepEqual(shapeFor('certain_days', { days: [6, 2, 2, 6] }).daysOfWeek, [2, 6]);
});

check('a day outside one to seven is dropped', () => {
  assert.deepEqual(shapeFor('certain_days', { days: [0, 3, 9] }).daysOfWeek, [3]);
});

check('monthly, six months and annually set months not days', () => {
  for (const [id, months] of [
    ['monthly', 1],
    ['six_months', 6],
    ['annually', 12],
  ] as const) {
    const shape = shapeFor(id);
    assert.equal(shape.intervalMonths, months, id);
    assert.equal(shape.intervalDays, null, `${id} must not also set days`);
    assert.equal(shape.repeatType, 'interval', `${id} rides on interval`);
  }
});

check('ninety days is days, not three months', () => {
  const shape = shapeFor('ninety_days');
  assert.equal(shape.intervalDays, 90);
  assert.equal(shape.intervalMonths, null);
});

check('intervals and one-offs need a start date, the rest do not', () => {
  for (const id of ['every_other_day', 'biweekly', 'monthly', 'annually', 'once'] as const) {
    assert.equal(shapeFor(id).needsStartDate, true, id);
  }
  for (const id of ['daily', 'weekdays', 'weekends', 'weekly', 'certain_days'] as const) {
    assert.equal(shapeFor(id).needsStartDate, false, id);
  }
});

check('an interval matching no named preset reads as every few days', () => {
  const row = rowFor('every_n_days', { count: 37 });
  assert.equal(presetFor(row), 'every_n_days');
  assert.equal(row.interval_days, 37, 'and keeps its actual number');
});

check('a supply schedule does not masquerade as daily', () => {
  const row = { ...rowFor('daily'), repeat_type: 'supply' } as ScheduleRow;
  assert.equal(presetFor(row), 'every_n_days');
});

check('monthly is recognized from months alone', () => {
  const row = rowFor('monthly', { start: '2026-01-31' });
  assert.equal(presetFor(row), 'monthly');
  assert.equal(isDueOn(row, on(2026, 1, 28)), true, 'and still clamps');
});

console.log(`\n${passed} checks passed.`);
