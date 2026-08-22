import type { ScheduleRow } from './types';

/** Sunday = 1, matching the spec's `days_of_week` encoding. */
export function weekdayOf(date: Date): number {
  return date.getDay() + 1;
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Whole days between an ISO date and a Date, compared by local calendar day.
 * Spec section 6: schedules are wall-clock local, never absolute, so DST
 * transitions must not shift a day boundary.
 */
function daysSince(startISO: string, date: Date): number {
  const [y, m, d] = startISO.split('-').map(Number);
  const start = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  const now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((now - start) / 86_400_000);
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

/** Whether a schedule produces an instance on the given local day. */
export function isDueOn(schedule: ScheduleRow, date: Date): boolean {
  if (!schedule.enabled) return false;

  const weekday = weekdayOf(date);

  switch (schedule.repeat_type) {
    case 'daily':
      return true;
    case 'weekdays':
      return weekday >= 2 && weekday <= 6;
    case 'weekends':
      return weekday === 1 || weekday === 7;
    case 'days_of_week':
      return parseDays(schedule.days_of_week).includes(weekday);
    case 'interval': {
      const every = schedule.interval_days ?? 0;
      if (!schedule.start_date || every <= 0) return false;
      const elapsed = daysSince(schedule.start_date, date);
      return elapsed >= 0 && elapsed % every === 0;
    }
    case 'supply': {
      // Counts backward from running out, not forward on a fixed interval.
      const supply = schedule.supply_days ?? 0;
      if (!schedule.start_date || supply <= 0) return false;
      const lead = schedule.lead_days ?? 0;
      return daysSince(schedule.start_date, date) === supply - lead;
    }
    case 'once':
      return !!schedule.start_date && daysSince(schedule.start_date, date) === 0;
    default:
      return false;
  }
}

/** "08:00" -> minutes past midnight, for ordering Today. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function describeRepeat(schedule: ScheduleRow): string {
  switch (schedule.repeat_type) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    case 'days_of_week': {
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const days = parseDays(schedule.days_of_week).map((d) => names[d - 1] ?? '');
      return days.length ? days.join(', ') : 'Some days';
    }
    case 'interval':
      return `Every ${schedule.interval_days ?? 0} days`;
    case 'supply':
      return `${schedule.supply_days ?? 0} day supply`;
    case 'once':
      return 'Once';
    default:
      return '';
  }
}
