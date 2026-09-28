/**
 * The seven day strip at the top of Daily, and moving between weeks.
 *
 * Kept pure and away from the database, because every bug this kind of code
 * has is a calendar bug: a week that straddles a month end, a week containing
 * a daylight saving change, a "go back one week" that lands on the same day it
 * started. Those are all assertable without a single knowt existing.
 *
 * Dates are built through the local `new Date(y, m, d)` constructor throughout,
 * never by adding milliseconds. Adding 7 * 86_400_000 across a clock change is
 * off by an hour, which is enough to move the date.
 */

/** Midnight local time on the day the given date falls in. */
export function midnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The Sunday that starts the calendar week containing `anchor`. */
export function startOfWeek(anchor: Date): Date {
  return new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate() - anchor.getDay(),
  );
}

/**
 * The seven days of the calendar week containing `anchor`, Sunday first.
 *
 * Sunday first, and paged a whole week at a time, so a weekday keeps its
 * column: the strip reads as a calendar rather than as a sliding window where
 * Wednesday moves every day.
 */
export function weekOf(anchor: Date): Date[] {
  const sunday = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, offset) =>
    new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + offset),
  );
}

/**
 * The same weekday, `delta` weeks away. Stepping the date by 7 per week rather
 * than the week's start by 7 keeps the selected column where it was.
 */
export function shiftWeeks(from: Date, delta: number): Date {
  return new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate() + delta * 7,
  );
}

/** Whole days from today to `date`, so yesterday is -1 and tomorrow is 1. */
export function offsetInDays(date: Date, now: Date): number {
  const a = midnight(date).getTime();
  const b = midnight(now).getTime();
  // Rounded, because a daylight saving change inside the span makes the
  // division land on 0.958 of a day rather than exactly one.
  return Math.round((a - b) / 86_400_000);
}
