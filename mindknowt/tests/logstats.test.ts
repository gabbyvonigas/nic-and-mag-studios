/**
 * The four breakdowns added for Log: snoozes, response time, weekday shape,
 * and what was missed.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs logstats.test.ts
 */
import assert from 'node:assert/strict';

import { summarizeMonth } from '../src/history/summary.ts';
import type {
  CategoryRow,
  EventRow,
  KnowtWithDetail,
  ScheduleRow,
} from '../src/db/types.ts';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const HOME: CategoryRow = {
  id: 'cHome', name: 'Home', key: 'home', color: '#C06A4C',
  icon: 'house', is_custom: 0, sort: 0,
};

function schedule(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: 's', knowt_id: 'k', label: null, time: '08:00',
    repeat_type: 'daily', days_of_week: null, interval_days: null,
    interval_months: null, supply_days: null, lead_days: null,
    start_date: null, enabled: 1, alarmkit_id: null,
    ...over,
  } as ScheduleRow;
}

function knowt(id: string, name: string): KnowtWithDetail {
  return {
    id, tag_uid: null, mode: 'open', name, icon: 'dot',
    category_id: HOME.id, location_note: null, notes: null, link_url: null,
    suggested_mode: null, daily_target: null, target_unit: null,
    priority: 1, refire_minutes: 5, snooze_minutes: 5,
    archived: 0, created_at: 1,
    category: HOME, schedules: [schedule({ knowt_id: id })],
  } as KnowtWithDetail;
}

let seq = 0;
function event(over: Partial<EventRow>): EventRow {
  seq += 1;
  return {
    id: `e${seq}`, knowt_id: 'kA', schedule_id: null,
    fired_at: null, completed_at: null, method: 'tap',
    note: null, snooze_count: 0,
    ...over,
  } as EventRow;
}

/** September 2026 is month 8. */
const at = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 8, day, hour, minute, 0).getTime();

const KNOWTS = [knowt('kA', 'Vitamins'), knowt('kB', 'Bins')];

function run(events: EventRow[], today = new Date(2026, 8, 22, 12, 0, 0)) {
  return summarizeMonth({
    year: 2026, month: 8, knowts: KNOWTS, categories: [HOME], events, today,
  });
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('an empty month reports zeroes, not nulls that crash a screen', () => {
  const s = run([]);
  assert.equal(s.snoozes, 0);
  assert.deepEqual(s.mostSnoozed, []);
  assert.equal(s.medianResponseMinutes, null);
  assert.deepEqual(s.byWeekday, [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.missedKnowts, []);
});

check('snoozes are totaled across every event, completed or not', () => {
  const s = run([
    event({ knowt_id: 'kA', completed_at: at(1), snooze_count: 2 }),
    // Snoozed three times and then never done. This is the clearest case of
    // all, so it must still count.
    event({ knowt_id: 'kA', fired_at: at(2), method: 'missed', snooze_count: 3 }),
    event({ knowt_id: 'kB', completed_at: at(3), snooze_count: 1 }),
  ]);
  assert.equal(s.snoozes, 6);
});

check('the most snoozed Knowt leads the list', () => {
  const s = run([
    event({ knowt_id: 'kA', completed_at: at(1), snooze_count: 2 }),
    event({ knowt_id: 'kA', completed_at: at(2), snooze_count: 3 }),
    event({ knowt_id: 'kB', completed_at: at(3), snooze_count: 1 }),
  ]);
  assert.equal(s.mostSnoozed.length, 2);
  assert.equal(s.mostSnoozed[0]?.name, 'Vitamins');
  assert.equal(s.mostSnoozed[0]?.snoozes, 5);
  assert.equal(s.mostSnoozed[1]?.snoozes, 1);
});

check('a Knowt that was never snoozed is left off the list', () => {
  const s = run([event({ knowt_id: 'kA', completed_at: at(1), snooze_count: 0 })]);
  assert.deepEqual(s.mostSnoozed, []);
});

check('median response time uses the middle value', () => {
  const s = run([
    event({ knowt_id: 'kA', fired_at: at(1, 8, 0), completed_at: at(1, 8, 2) }),
    event({ knowt_id: 'kA', fired_at: at(2, 8, 0), completed_at: at(2, 8, 10) }),
    event({ knowt_id: 'kA', fired_at: at(3, 8, 0), completed_at: at(3, 8, 30) }),
  ]);
  assert.equal(s.medianResponseMinutes, 10);
});

check('an even count averages the middle two', () => {
  const s = run([
    event({ knowt_id: 'kA', fired_at: at(1, 8, 0), completed_at: at(1, 8, 2) }),
    event({ knowt_id: 'kA', fired_at: at(2, 8, 0), completed_at: at(2, 8, 8) }),
  ]);
  assert.equal(s.medianResponseMinutes, 5);
});

check('a check-in that never rang does not drag the median to zero', () => {
  const s = run([
    // No fired_at: done spontaneously, with no alarm to answer.
    event({ knowt_id: 'kA', completed_at: at(1, 8, 0) }),
    event({ knowt_id: 'kA', fired_at: at(2, 8, 0), completed_at: at(2, 8, 20) }),
  ]);
  assert.equal(s.medianResponseMinutes, 20, 'only the one that rang counts');
});

check('a completion recorded before its ring is ignored rather than negative', () => {
  const s = run([
    event({ knowt_id: 'kA', fired_at: at(2, 9, 0), completed_at: at(2, 8, 0) }),
  ]);
  assert.equal(s.medianResponseMinutes, null, 'a negative wait is not a wait');
});

check('a missed event never counts as a response', () => {
  const s = run([
    event({
      knowt_id: 'kA', fired_at: at(1, 8, 0), completed_at: at(1, 9, 0),
      method: 'missed',
    }),
  ]);
  assert.equal(s.medianResponseMinutes, null);
});

check('weekdays are counted Sunday first', () => {
  // 2026-09-06 is a Sunday, the 7th a Monday.
  assert.equal(new Date(2026, 8, 6).getDay(), 0, 'fixture assumes a Sunday');
  const s = run([
    event({ knowt_id: 'kA', completed_at: at(6) }),
    event({ knowt_id: 'kA', completed_at: at(7) }),
    event({ knowt_id: 'kB', completed_at: at(7) }),
  ]);
  assert.equal(s.byWeekday[0], 1, 'Sunday');
  assert.equal(s.byWeekday[1], 2, 'Monday');
  assert.equal(s.byWeekday.reduce((a, b) => a + b, 0), 3);
});

check('misses are named and counted, not just totaled', () => {
  const s = run([
    event({ knowt_id: 'kA', fired_at: at(1), method: 'missed' }),
    event({ knowt_id: 'kA', fired_at: at(2), method: 'missed' }),
    event({ knowt_id: 'kB', fired_at: at(3), method: 'missed' }),
  ]);
  assert.equal(s.missed, 3);
  assert.equal(s.missedKnowts[0]?.name, 'Vitamins');
  assert.equal(s.missedKnowts[0]?.misses, 2);
  assert.equal(s.missedKnowts[1]?.misses, 1);
});

check('a deleted Knowt still reports its history under a plain name', () => {
  const s = run([
    event({ knowt_id: 'kGone', completed_at: at(1), snooze_count: 2 }),
    event({ knowt_id: 'kGone', fired_at: at(2), method: 'missed' }),
  ]);
  assert.equal(s.mostSnoozed[0]?.name, 'Deleted Knowt');
  assert.equal(s.missedKnowts[0]?.name, 'Deleted Knowt');
});

check('events outside the month are excluded from all of it', () => {
  const august = new Date(2026, 7, 20, 12).getTime();
  const s = run([
    event({ knowt_id: 'kA', completed_at: august, snooze_count: 9 }),
    event({ knowt_id: 'kA', completed_at: at(5), snooze_count: 1 }),
  ]);
  assert.equal(s.snoozes, 1, 'August stays in August');
  assert.equal(s.completions, 1);
});

console.log(`\n${passed} checks passed.`);
