import type { ScheduleRow } from './types';

/** 24-hour HH:MM, the only time format schedules accept. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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

/**
 * "08:00" -> "8:00 am". Storage stays 24 hour because it is unambiguous and
 * sorts correctly; only the display changes.
 */
export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) {
    return hhmm;
  }
  const suffix = h < 12 ? 'am' : 'pm';
  // 0 and 12 both display as 12: midnight and noon.
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${`${m}`.padStart(2, '0')} ${suffix}`;
}

/**
 * Accepts what a person actually types: "8:00 am", "8pm", "8", "20:00".
 * Returns canonical "HH:MM", or null when it cannot be read confidently.
 * A time with no suffix is read as 24 hour, so "20:00" and "8:00" both work.
 */
export function parseTimeInput(raw: string): string | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, '');
  const match = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(text);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] === undefined ? 0 : Number(match[2]);
  const suffix = match[3];

  if (minute > 59) return null;

  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    if (suffix === 'am') hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
  } else if (hour > 23) {
    return null;
  }

  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
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
