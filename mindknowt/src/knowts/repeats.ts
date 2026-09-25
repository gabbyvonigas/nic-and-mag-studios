import type { RepeatType, ScheduleRow } from '../db/types';

/**
 * The repeat choices a person picks from, and how each one maps onto the
 * columns the scheduler actually reads.
 *
 * The mapping lives here rather than in the screen because it has to work in
 * both directions: picking a preset writes the columns, and opening an
 * existing schedule has to recognize which preset it came from. Splitting
 * those across two files is how they drift.
 *
 * Several presets are the same repeat_type with different numbers. Monthly and
 * longer ride on 'interval' with months set, because repeat_type carries a
 * CHECK constraint SQLite cannot alter without rebuilding the table on every
 * device that already exists.
 */

export type RepeatPresetId =
  | 'daily'
  | 'every_other_day'
  | 'weekdays'
  | 'weekends'
  | 'weekly'
  | 'biweekly'
  | 'certain_days'
  | 'every_n_days'
  | 'monthly'
  | 'ninety_days'
  | 'six_months'
  | 'annually'
  | 'once';

export type RepeatPreset = {
  id: RepeatPresetId;
  label: string;
  /** Asks for one weekday. */
  needsDay?: boolean;
  /** Asks for a set of weekdays. */
  needsDays?: boolean;
  /** Asks for a number of days. */
  needsCount?: boolean;
};

/** Ordered by how often they fire, so the list reads as a scale. */
export const REPEAT_PRESETS: RepeatPreset[] = [
  { id: 'daily', label: 'Every day' },
  { id: 'every_other_day', label: 'Every other day' },
  { id: 'weekdays', label: 'Weekdays' },
  { id: 'weekends', label: 'Weekends' },
  { id: 'weekly', label: 'Weekly', needsDay: true },
  // Spelled out rather than "bi-weekly", which people read both ways.
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'certain_days', label: 'Certain days', needsDays: true },
  { id: 'every_n_days', label: 'Every few days', needsCount: true },
  { id: 'monthly', label: 'Monthly' },
  { id: 'ninety_days', label: 'Every 90 days' },
  { id: 'six_months', label: 'Every 6 months' },
  { id: 'annually', label: 'Annually' },
  { id: 'once', label: 'Just once' },
];

/** The columns a preset writes. */
export type RepeatShape = {
  repeatType: RepeatType;
  daysOfWeek: number[] | null;
  intervalDays: number | null;
  intervalMonths: number | null;
  /**
   * Whether this repeat counts from a date. Intervals and one-offs do, which
   * is what makes "today plus N days" mean today plus N days.
   */
  needsStartDate: boolean;
};

export function shapeFor(
  id: RepeatPresetId,
  options: { days?: number[]; count?: number } = {},
): RepeatShape {
  const days = options.days ?? [];
  const count = options.count ?? 2;

  const interval = (
    intervalDays: number | null,
    intervalMonths: number | null,
  ): RepeatShape => ({
    repeatType: 'interval',
    daysOfWeek: null,
    intervalDays,
    intervalMonths,
    needsStartDate: true,
  });

  const plain = (repeatType: RepeatType): RepeatShape => ({
    repeatType,
    daysOfWeek: null,
    intervalDays: null,
    intervalMonths: null,
    needsStartDate: repeatType === 'once',
  });

  switch (id) {
    case 'daily':
      return plain('daily');
    case 'weekdays':
      return plain('weekdays');
    case 'weekends':
      return plain('weekends');
    case 'once':
      return plain('once');

    case 'every_other_day':
      return interval(2, null);
    // Fourteen days from a start date lands on the same weekday every time,
    // so this needs no separate day choice.
    case 'biweekly':
      return interval(14, null);
    case 'every_n_days':
      return interval(Math.max(1, Math.round(count)), null);
    case 'ninety_days':
      return interval(90, null);

    case 'monthly':
      return interval(null, 1);
    case 'six_months':
      return interval(null, 6);
    case 'annually':
      return interval(null, 12);

    case 'weekly':
    case 'certain_days': {
      const chosen = [...new Set(days.filter((d) => d >= 1 && d <= 7))].sort(
        (a, b) => a - b,
      );
      return {
        repeatType: 'days_of_week',
        daysOfWeek: chosen,
        intervalDays: null,
        intervalMonths: null,
        needsStartDate: false,
      };
    }
  }
}

function parseDays(json: string | null): number[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

/**
 * Which preset an existing schedule came from, so reopening it selects the
 * right thing rather than resetting to the top of the list.
 *
 * An interval that matches no named preset falls back to "every few days",
 * which is true and editable, rather than pretending it is something it is not.
 */
export function presetFor(schedule: ScheduleRow): RepeatPresetId {
  switch (schedule.repeat_type) {
    case 'daily':
      return 'daily';
    case 'weekdays':
      return 'weekdays';
    case 'weekends':
      return 'weekends';
    case 'once':
      return 'once';
    case 'days_of_week':
      return parseDays(schedule.days_of_week).length === 1
        ? 'weekly'
        : 'certain_days';
    case 'interval': {
      const months = schedule.interval_months ?? 0;
      if (months === 1) return 'monthly';
      if (months === 6) return 'six_months';
      if (months === 12) return 'annually';
      if (months > 0) return 'every_n_days';

      const days = schedule.interval_days ?? 0;
      if (days === 2) return 'every_other_day';
      if (days === 14) return 'biweekly';
      if (days === 90) return 'ninety_days';
      return 'every_n_days';
    }
    default:
      // 'supply' has no picker entry yet. Showing it as a plain interval is
      // closer to the truth than showing it as daily.
      return 'every_n_days';
  }
}
