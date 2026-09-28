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
  overrides: number;
  /** Completions plus misses, so a rate can be read per bucket. */
  total: number;
  /** Whether this bucket is the one containing today. */
  current: boolean;
};

export type PeriodCategoryTally = {
  categoryId: string | null;
  name: string;
  color: string;
  /** The glyph name stored on the category, for the badge on the row. */
  icon: string | null;
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
  /**
   * The busiest two hour window, as a start hour, or null when nothing has
   * been completed. Two hours rather than one because a single hour on a thin
   * month is whichever hour happened twice.
   */
  peakHour: number | null;
  /**
   * Mean minutes from an alarm ringing to it being finished, or null when
   * nothing rang. A check-in with no alarm behind it has no duration to
   * average, so it is left out rather than counted as zero.
   */
  averageMinutes: number | null;
};

/** The same numbers for the period before this one, for the change arrows. */
export type PeriodDelta = {
  /** Change in completions, as a fraction. Null when the last one was empty. */
  completions: number | null;
  rate: number | null;
  overrides: number | null;
};

const DAY_MS = 86_400_000;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
// Three letters rather than one initial. Single letters give S M T W T F S,
// where two pairs are indistinguishable, and the chart's whole job is telling
// you which day was the quiet one.
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
/**
 * The busiest two hour window. Read over starts rather than fixed blocks, so a
 * habit that straddles the top of an hour is not split across two bars.
 */
function peakHourOf(completions: EventRow[]): number | null {
  if (completions.length === 0) return null;

  const perHour = new Array<number>(24).fill(0);
  for (const event of completions) {
    perHour[new Date(event.completed_at as number).getHours()] += 1;
  }

  let bestHour = 0;
  let best = -1;
  for (let hour = 0; hour < 24; hour += 1) {
    const pair = perHour[hour]! + (perHour[(hour + 1) % 24] ?? 0);
    if (pair > best) {
      best = pair;
      bestHour = hour;
    }
  }
  return best > 0 ? bestHour : null;
}

/** Mean minutes between ringing and finishing, over events that did both. */
function averageMinutesOf(completions: EventRow[]): number | null {
  const answered = completions.filter(
    (event) => event.fired_at !== null && event.completed_at !== null,
  );
  if (answered.length === 0) return null;

  const total = answered.reduce(
    (sum, event) =>
      sum + ((event.completed_at as number) - (event.fired_at as number)),
    0,
  );
  return total / answered.length / 60_000;
}

/** Growth from one number to the next. Null when there is nothing to grow from. */
export function changeBetween(now: number, before: number): number | null {
  if (before === 0) return null;
  return (now - before) / before;
}

export function deltaBetween(
  now: PeriodSummary,
  before: PeriodSummary,
): PeriodDelta {
  return {
    completions: changeBetween(now.completions, before.completions),
    rate:
      now.rate === null || before.rate === null || before.rate === 0
        ? null
        : (now.rate - before.rate) / before.rate,
    overrides: changeBetween(now.overrides, before.overrides),
  };
}

/** Which number a sparkline is drawing. */
export type SparkMetric = 'completions' | 'rate' | 'overrides';

/**
 * A sparkline's heights, each 0 to 1.
 *
 * Scaled against the biggest value in the series rather than an absolute
 * ceiling, because the line is there to show the shape of the period, not to be
 * read off. A rate is already a fraction and is drawn as one, so a flat week at
 * 100 percent draws flat and high instead of being normalized into a straight
 * line at the top that a flat week at 20 percent would also draw.
 */
export function sparkFor(
  summary: PeriodSummary,
  metric: SparkMetric,
): number[] {
  if (metric === 'rate') {
    return summary.trend.map((bucket) =>
      bucket.total === 0 ? 0 : bucket.completions / bucket.total,
    );
  }

  const values = summary.trend.map((bucket) =>
    metric === 'overrides' ? bucket.overrides : bucket.completions,
  );
  const peak = Math.max(...values, 0);
  if (peak === 0) return values.map(() => 0);
  return values.map((value) => value / peak);
}

/** The period immediately before this one, of the same length. */
export function previousRange(range: PeriodRange): PeriodRange {
  return rangeFor(range.kind, shiftRange(range, -1));
}

function bucketsFor(range: PeriodRange, events: EventRow[], today: Date): TrendBucket[] {
  const done = events.filter(isCompletion);
  const todayStart = startOfDay(today).getTime();

  if (range.kind === 'day') {
    const blocks = [0, 4, 8, 12, 16, 20];
    return blocks.map((hour) => {
      const start = new Date(range.from);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
      const inBucket = (event: EventRow) => {
        const at = event.completed_at ?? event.fired_at;
        return at !== null && at >= start.getTime() && at < end.getTime();
      };
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      return {
        label: `${hour12}${hour < 12 ? 'a' : 'p'}`,
        completions: done.filter(inBucket).length,
        overrides: done.filter((e) => inBucket(e) && e.method === 'override')
          .length,
        total: events.filter(inBucket).length,
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
    const inBucket = (event: EventRow) => {
      const at = event.completed_at ?? event.fired_at;
      return at !== null && at >= start.getTime() && at < end.getTime();
    };
    return {
      label:
        range.kind === 'week'
          ? (SHORT_DAYS[start.getDay()] ?? '')
          : `${start.getDate()}`,
      completions: done.filter(inBucket).length,
      overrides: done.filter((e) => inBucket(e) && e.method === 'override').length,
      total: events.filter(inBucket).length,
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
        icon: category?.icon ?? null,
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
    peakHour: peakHourOf(completions),
    averageMinutes: averageMinutesOf(completions),
  };
}
