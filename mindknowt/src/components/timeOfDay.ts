/**
 * Converting between the stored `HH:MM` and the `Date` the native picker takes.
 *
 * The picker deals in `Date` objects and the database deals in 24 hour
 * `HH:MM`, so every reading and every write crosses this boundary. It is its
 * own module, with no React in it, so the crossings can be asserted: am and pm,
 * midnight and noon, and the readings that are not times at all.
 *
 * The calendar part of the `Date` is a carrier and nothing more. Only the hour
 * and the minute are ever stored, which is what keeps a schedule a wall clock
 * time rather than an instant, so an 8:00 am alarm stays at 8:00 am across a
 * change of clocks.
 */

/** 24-hour HH:MM, the only format ever stored. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type TimeParts = { hour24: number; minute: number };

/**
 * Reads the stored form.
 *
 * Every caller passes a real time, so the fallback is a guard rather than a
 * path anyone takes. It has to be a guard that fails usefully though:
 * `Number('')` is 0, so a missing hour parsed the lazy way becomes midnight,
 * and a midnight alarm nobody asked for is exactly the kind of invented default
 * this project does not ship. Eight in the morning is the same fallback the old
 * wheel used.
 */
export function partsOf(value: string, fallbackHour = 8): TimeParts {
  const match = /^\s*(\d{1,2}):(\d{1,2})\s*$/.exec(value ?? '');
  const rawHour = match ? Number(match[1]) : Number.NaN;
  const rawMinute = match ? Number(match[2]) : Number.NaN;

  return {
    hour24: rawHour >= 0 && rawHour < 24 ? rawHour : fallbackHour,
    minute: rawMinute >= 0 && rawMinute < 60 ? rawMinute : 0,
  };
}

/** The `Date` the picker should open on. Today's date, at the stored time. */
export function dateFromTime(value: string, today = new Date()): Date {
  const { hour24, minute } = partsOf(value);
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    hour24,
    minute,
    0,
    0,
  );
}

/** Back to the stored form. Only the clock survives; the date is discarded. */
export function timeFromDate(date: Date): string {
  const hour = date.getHours();
  const minute = date.getMinutes();
  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
}

/** The twelve hour reading, for anything that has to say it in words. */
export function twelveHour(value: string): {
  hour12: number;
  minute: number;
  isPm: boolean;
} {
  const { hour24, minute } = partsOf(value);
  return {
    // 0 and 12 both read as 12: midnight and noon, the one case where the
    // obvious arithmetic is wrong.
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    isPm: hour24 >= 12,
  };
}
