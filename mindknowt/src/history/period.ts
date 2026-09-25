/**
 * Month, week and day, as one shape.
 *
 * `summarizeMonth` stays where it is and keeps doing the month-shaped work
 * (follow-through, what gets put off, the weekday spread). This is the part
 * that has to answer the same three questions over any span: how much got
 * done, how much of it, and what it was overridden.
 *
 * Pure, and takes its events already loaded, so the buckets can be asserted
 * without a database.
 */
import type { CategoryRow, EventRow, KnowtWithDetail } from '../db/types';

export type PeriodKind = 'month' | 'week' | 'day';

export type PeriodRange = {
  kind: PeriodKind;
  from: Date;
  /** Exclusive. */
  to: Date;
  label: string;
};

export type TrendBucket = {
  /** Short label under the bar. */
  label: string;
  completions: number;
  /** Whether this bucket is the one containing today. */
  current: boolean;
};

export type PeriodCategoryTally = {
  categoryId: string | null;
  name: string;
  color: string;
  completions: number;
};

export type PeriodSummary = {
  range: PeriodRange;
  completions: number;
  missed: number;
  /** Completions over completions plus misses. Null when neither happened. */
  rate: number | null;
  overrides: number;
  byCategory: PeriodCategoryTally[];
  trend: TrendBucket[];
};

const DAY_MS = 86_400_000;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Weeks run Sunday to Saturday, matching the schedule encoding. */
function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - day.getDay());
}

export function rangeFor(kind: PeriodKind, anchor: Date): PeriodRange {
  if (kind === 'day') {
    const from = startOfDay(anchor);
    return {
      kind,
      from,
      to: new Date(from.getTime() + DAY_MS),
      label: `${MONTHS[from.getMonth()]} ${from.getDate()}`,
    };
  }

  if (kind === 'week') {
    const from = startOfWeek(anchor);
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
    const last = new Date(to.getTime() - DAY_MS);
    const sameMonth = from.getMonth() === last.getMonth();
    return {
      kind,
      from,
      to,
      label: sameMonth
        ? `${MONTHS[from.getMonth()]} ${from.getDate()} to ${last.getDate()}`
        : `${MONTHS[from.getMonth()]} ${from.getDate()} to ${MONTHS[last.getMonth()]} ${last.getDate()}`,
    };
  }

  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  return {
    kind,
    from,
    to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1),
    label: `${MONTHS[from.getMonth()]} ${from.getFullYear()}`,
  };
}

/** Steps a whole period, which is what the arrows either side of the toggle do. */
export function shiftRange(range: PeriodRange, delta: number): Date {
  const { from, kind } = range;
  if (kind === 'day') {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + delta);
  }
  if (kind === 'week') {
    return new Date(from.getFullYear(), from.getMonth(), from.getDate() + delta * 7);
  }
  return new Date(from.getFullYear(), from.getMonth() + delta, 1);
}

function isCompletion(event: EventRow): boolean {
  return event.completed_at !== null;
}

/**
 * The buckets under the trend chart.
 *
 * A day is read in four hour blocks, because a bar per hour on a phone is
 * twenty four slivers nobody can read. A week is days, a month is days.
 */
function bucketsFor(range: PeriodRange, events: EventRow[], today: Date): TrendBucket[] {
  const done = events.filter(isCompletion);
  const todayStart = startOfDay(today).getTime();

  if (range.kind === 'day') {
    const blocks = [0, 4, 8, 12, 16, 20];
    return blocks.map((hour) => {
      const start = new Date(range.from);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
      const count = done.filter((event) => {
        const at = event.completed_at as number;
        return at >= start.getTime() && at < end.getTime();
      }).length;
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      return {
        label: `${hour12}${hour < 12 ? 'a' : 'p'}`,
        completions: count,
        current:
          today.getTime() >= start.getTime() && today.getTime() < end.getTime(),
      };
    });
  }

  const days = Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS);
  return Array.from({ length: days }, (_, index) => {
    const start = new Date(
      range.from.getFullYear(),
      range.from.getMonth(),
      range.from.getDate() + index,
    );
    const end = new Date(start.getTime() + DAY_MS);
    const count = done.filter((event) => {
      const at = event.completed_at as number;
      return at >= start.getTime() && at < end.getTime();
    }).length;
    return {
      label:
        range.kind === 'week'
          ? (SHORT_DAYS[start.getDay()] ?? '')
          : `${start.getDate()}`,
      completions: count,
      current: start.getTime() === todayStart,
    };
  });
}

export function summarizePeriod(input: {
  range: PeriodRange;
  knowts: KnowtWithDetail[];
  categories: CategoryRow[];
  /** Every event whose completed_at or fired_at falls inside the range. */
  events: EventRow[];
  today: Date;
}): PeriodSummary {
  const { range, knowts, categories, events, today } = input;

  const inRange = events.filter((event) => {
    const at = event.completed_at ?? event.fired_at;
    return at !== null && at >= range.from.getTime() && at < range.to.getTime();
  });

  const completions = inRange.filter(isCompletion);
  const missed = inRange.length - completions.length;
  const overrides = completions.filter((event) => event.method === 'override').length;

  const categoryOf = new Map<string, string | null>();
  for (const knowt of knowts) categoryOf.set(knowt.id, knowt.category?.id ?? null);

  const tallies = new Map<string, PeriodCategoryTally>();
  for (const event of completions) {
    const categoryId = categoryOf.get(event.knowt_id) ?? null;
    const category = categories.find((row) => row.id === categoryId) ?? null;
    const key = categoryId ?? 'none';
    const existing = tallies.get(key);
    if (existing) {
      existing.completions += 1;
    } else {
      tallies.set(key, {
        categoryId,
        name: category?.name ?? 'Everything else',
        color: category?.color ?? '#8A93A0',
        completions: 1,
      });
    }
  }

  return {
    range,
    completions: completions.length,
    missed,
    rate:
      inRange.length === 0 ? null : completions.length / inRange.length,
    overrides,
    byCategory: [...tallies.values()].sort(
      (a, b) => b.completions - a.completions,
    ),
    trend: bucketsFor(range, inRange, today),
  };
}
