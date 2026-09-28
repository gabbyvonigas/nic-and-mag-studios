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
  /** Completions plus misses, so the row can show a rate rather than a count. */
  total: number;
};

export type PeriodSummary = {
  range: PeriodRange;
  completions: number;
  missed: number;
  /** Completions over completions plus misses. Null when neither happened. */
  rate: number | null;
  overrides: number;
  byCategory: PeriodCategoryTally[];
  /** Chronological, for the sparklines. One bucket per day, or per 4 hours. */
  trend: TrendBucket[];
  /** Seven bars, Monday first, for the Completed chart. */
  byWeekday: TrendBucket[];
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

/**
 * The change against the period before, for the arrows on the stat tiles.
 *
 * Null means there is nothing worth comparing to, and a null is not drawn at
 * all: no arrow, no number, no words. A tile that says "No period before this"
 * is a debug string wearing a UI, and a tile that says "+550%" because the
 * previous month held two completions is worse, because it looks like a fact.
 */
export type PeriodDelta = {
  /** Change in completions, as a fraction: 0.2 is a fifth more. */
  completions: number | null;
  /**
   * Change in the completion rate, in points. 50% to 80% is 0.3, not 0.6. A
   * rate is already a percentage and compounding one against another is how a
   * tile ends up claiming 376%.
   */
  rate: number | null;
  overrides: number | null;
};

/**
 * How much the previous period has to hold before a change off it means
 * anything.
 *
 * The same reasoning as `MIN_COMPLETIONS` in the insights engine: a percentage
 * taken off a sample of two is not a small signal, it is noise with a decimal
 * point. Someone who installed the app last month would be told their week was
 * up 550%, which is arithmetic rather than information.
 */
export const MIN_PREVIOUS = 5;

/** Monday first, as the Log chart reads. Three letters: S M T W T F S has two
 * pairs nobody can tell apart. */
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

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
  const beforeOccurrences = before.completions + before.missed;

  return {
    completions:
      before.completions < MIN_PREVIOUS
        ? null
        : changeBetween(now.completions, before.completions),
    // In points, and only once the previous period had enough occurrences for
    // its rate to be a rate rather than one good morning.
    rate:
      beforeOccurrences < MIN_PREVIOUS || now.rate === null || before.rate === null
        ? null
        : now.rate - before.rate,
    overrides:
      before.overrides < MIN_PREVIOUS
        ? null
        : changeBetween(now.overrides, before.overrides),
  };
}

/** Which number a sparkline is drawing. */
export type SparkMetric = 'completions' | 'rate' | 'overrides';

/**
 * A sparkline's heights, each 0 to 1.
 *
 * Read off `trend`, which is chronological, because a sparkline is the shape
 * of the period over time. The bar chart below it is the weekday aggregate,
 * which is a different question.
 *
 * Scaled against the biggest value in the series rather than an absolute
 * ceiling, because the line shows shape rather than being read off. A rate is
 * already a fraction and is drawn as one, so a flat week at 100 percent draws
 * flat and high instead of being normalized into the same straight line a flat
 * week at 20 percent would draw.
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

/**
 * The stretch of the previous period to compare this one against.
 *
 * Like for like. A month that is 23 days old is compared against the first 23
 * days of the month before it, not against all 31, because comparing a period
 * in progress against a finished one reports a collapse every single period
 * right up until its last day. A period that has already finished is compared
 * against the whole of the one before it, since there is nothing to truncate.
 */
export function previousWindow(range: PeriodRange, now: Date): PeriodRange {
  const full = rangeFor(range.kind, shiftRange(range, -1));
  const inProgress = now >= range.from && now < range.to;
  if (!inProgress) return full;

  const elapsed = now.getTime() - range.from.getTime();
  // Clamped, because February is shorter than January and the elapsed span of
  // a long month can run past the end of a short one.
  const to = Math.min(full.from.getTime() + elapsed, full.to.getTime());
  return { ...full, to: new Date(to) };
}

/**
 * Completions per weekday across the whole period, Monday first.
 *
 * This is the Log's "Completed" chart. It used to be one bar per day of the
 * month, labeled with the date, which at a month's width rendered as
 * "1 6 1. 1. 2": thirty-one bars too thin to read and five numbers clipped in
 * half. Aggregating by weekday answers a question worth asking instead, which
 * is which days actually get things done, and it fits in seven bars.
 */
export function weekdayTotals(
  range: PeriodRange,
  events: EventRow[],
  today: Date,
): TrendBucket[] {
  const inRange = events.filter((event) => {
    const at = event.completed_at ?? event.fired_at;
    return at !== null && at >= range.from.getTime() && at < range.to.getTime();
  });

  // getDay is Sunday 0; this axis is Monday first.
  const slotOf = (date: Date) => (date.getDay() + 6) % 7;
  const todaySlot = slotOf(today);
  const showsToday = today >= range.from && today < range.to;

  return WEEKDAY_LABELS.map((label, slot) => {
    const mine = inRange.filter(
      (event) =>
        slotOf(new Date((event.completed_at ?? event.fired_at) as number)) === slot,
    );
    const done = mine.filter(isCompletion);
    return {
      label,
      completions: done.length,
      overrides: done.filter((event) => event.method === 'override').length,
      total: mine.length,
      current: showsToday && slot === todaySlot,
    };
  });
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
  // Every event, not just the completions: a category's rate needs the misses
  // as well, and a category that was never once done still has a row to show.
  for (const event of inRange) {
    const categoryId = categoryOf.get(event.knowt_id) ?? null;
    const category = categories.find((row) => row.id === categoryId) ?? null;
    const key = categoryId ?? 'none';
    const existing = tallies.get(key);
    const done = isCompletion(event);
    if (existing) {
      existing.total += 1;
      if (done) existing.completions += 1;
    } else {
      tallies.set(key, {
        categoryId,
        name: category?.name ?? 'Everything else',
        color: category?.color ?? '#8A93A0',
        icon: category?.icon ?? null,
        completions: done ? 1 : 0,
        total: 1,
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
    byWeekday: weekdayTotals(range, inRange, today),
    peakHour: peakHourOf(completions),
    averageMinutes: averageMinutesOf(completions),
  };
}
