/**
 * Which days a schedule being built would actually ring on.
 *
 * This is what the calendar in "When it happens" highlights. It does not
 * reimplement the repeat rules: it assembles the same `ScheduleRow` shape the
 * database stores and asks `isDueOn`, which is the function the dashboard, the
 * alarm sync and the Log all already go through. A second copy of those rules
 * would drift from the first, and the calendar would then be confidently wrong
 * about when an alarm is coming.
 *
 * Pure, so the highlighting can be asserted without a database or a device.
 */
import { isDueOn, toISODate } from '../db/scheduling';
import { shapeFor, type RepeatPresetId } from './repeats';
import type { ScheduleRow } from '../db/types';

export type DraftSchedule = {
  preset: RepeatPresetId;
  /** Chosen days, for the presets that take them. Sunday = 1. */
  days: number[];
  /** How many days apart, for the interval presets that ask. */
  count: number;
  /** The day the rhythm counts from, and the day a one-off happens on. */
  startDate: Date;
};

/**
 * The row the database would hold for this draft.
 *
 * Exported because it is the thing worth asserting: if this is assembled
 * wrongly, every occurrence the calendar draws is wrong in the same way.
 */
export function draftRow(draft: DraftSchedule): ScheduleRow {
  const shape = shapeFor(draft.preset, {
    days: draft.days,
    count: draft.count,
  });

  return {
    id: 'draft',
    knowt_id: 'draft',
    label: null,
    time: '08:00',
    repeat_type: shape.repeatType,
    days_of_week: shape.daysOfWeek ? JSON.stringify(shape.daysOfWeek) : null,
    interval_days: shape.intervalDays,
    interval_months: shape.intervalMonths,
    supply_days: null,
    lead_days: null,
    // Always set, even for the shapes that do not read it. A shape that does
    // not need a start date ignores the field, and one that does would answer
    // false for every date without it.
    start_date: toISODate(draft.startDate),
    enabled: 1,
    alarmkit_id: null,
  };
}

/** The days of the month containing `anchor`, with Monday-free padding so the
 * grid starts on a Sunday and runs in whole weeks. */
export function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(
    first.getFullYear(),
    first.getMonth(),
    1 - first.getDay(),
  );

  // Six weeks always. A month can span six, and a grid that changes height as
  // you page through the months makes everything below it jump.
  return Array.from({ length: 42 }, (_, i) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

/**
 * Whether the draft rings on a given day.
 *
 * Nothing before the start date ever counts, whatever the repeat says. A
 * weekly schedule starting on the 20th must not light up the 6th: the rhythm
 * has not begun, and `isDueOn` answers only the weekday question for the
 * shapes that do not read a start date.
 */
export function occursOn(row: ScheduleRow, day: Date, startDate: Date): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const from = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  if (dayStart < from) return false;
  return isDueOn(row, dayStart);
}

/** The next few days this draft rings on, for the summary line. */
export function nextOccurrences(
  draft: DraftSchedule,
  limit = 6,
  horizonDays = 400,
): Date[] {
  const row = draftRow(draft);
  const out: Date[] = [];
  const cursor = new Date(
    draft.startDate.getFullYear(),
    draft.startDate.getMonth(),
    draft.startDate.getDate(),
  );

  for (let i = 0; i < horizonDays && out.length < limit; i += 1) {
    const day = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + i,
    );
    if (occursOn(row, day, draft.startDate)) out.push(day);
  }

  return out;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "Mon, Oct 12", or "today" when that is what it is. */
export function dayLabel(day: Date, today: Date): string {
  const same =
    day.getFullYear() === today.getFullYear() &&
    day.getMonth() === today.getMonth() &&
    day.getDate() === today.getDate();
  if (same) return 'today';

  const tomorrow = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
  );
  const isTomorrow =
    day.getFullYear() === tomorrow.getFullYear() &&
    day.getMonth() === tomorrow.getMonth() &&
    day.getDate() === tomorrow.getDate();
  if (isTomorrow) return 'tomorrow';

  return `${DAY_NAMES[day.getDay()]}, ${MONTH_NAMES[day.getMonth()]} ${day.getDate()}`;
}

/** 6:00 am, from a 24 hour HH:MM. */
export function clockLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const hour = h as number;
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${`${m}`.padStart(2, '0')} ${suffix}`;
}
