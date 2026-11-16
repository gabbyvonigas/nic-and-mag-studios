/**
 * The Log's numbers, for any span: one day, one week, one month.
 *
 * The Log used to compute its cards two different ways. The tiles, the method
 * row and the "went by" line came from `summarizeMonth`, which is month shaped
 * down to its argument list, and they were rendered only when the toggle said
 * Month. The trend panel came from `summarizePeriod`, which already knew about
 * ranges. So Day and Week showed a different, smaller screen, and the two sets
 * of numbers had no reason to agree.
 *
 * This is the one that every card reads now. It takes a range and nothing else
 * about the calendar, so the same function answers all three views and a test
 * can hold it to one fixture across all of them.
 *
 * Pure. No database, no clock except the one handed in.
 */
import type {
  CategoryRow,
  EventMethod,
  EventRow,
  KnowtWithDetail,
} from '../db/types';

const DAY_MS = 86_400_000;

export type CompletedItem = {
  eventId: string;
  knowtId: string;
  knowtName: string;
  /** The category the Knowt is in now, for its color. Null when it has none. */
  category: CategoryRow | null;
  completedAt: number;
  method: EventMethod;
  snoozeCount: number;
  note: string | null;
};

export type CompletedDay = {
  /** Local YYYY-MM-DD, which is what the list keys and groups on. */
  iso: string;
  /** Midnight local, for the heading. */
  date: Date;
  items: CompletedItem[];
};

/** Shaped to match `SnoozeEntry`, so one panel renders either summary. */
export type SnoozeTally = {
  knowtId: string;
  name: string;
  category: CategoryRow | null;
  snoozes: number;
};

export type RangeSummary = {
  from: number;
  to: number;
  completions: number;
  missed: number;
  /** Completions over completions plus misses. Null when neither happened. */
  rate: number | null;
  byMethod: { scan: number; tap: number; override: number };
  /** Days in the range with at least one completion. */
  activeDays: number;
  /** Days of the range that have actually happened, so a rate is honest. */
  daysElapsed: number;
  daysInRange: number;
  snoozes: number;
  /** Median minutes from the alarm ringing to it being finished. */
  medianResponseMinutes: number | null;
  mostSnoozed: SnoozeTally[];
  /** Every completion in the range, newest first, grouped by day. */
  days: CompletedDay[];
  /** The same completions, flat and newest first. */
  completedItems: CompletedItem[];
};

function startOfDay(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

function toISODate(at: Date): string {
  const y = at.getFullYear();
  const m = `${at.getMonth() + 1}`.padStart(2, '0');
  const d = `${at.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The moment an event is filed under. A miss has no completion to go by. */
function eventAt(event: EventRow): number | null {
  return event.completed_at ?? event.fired_at;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : Math.round((((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2));
}

export function summarizeRange(input: {
  range: { from: Date; to: Date };
  knowts: KnowtWithDetail[];
  categories: CategoryRow[];
  /** Every event whose moment falls inside the range. */
  events: EventRow[];
  today: Date;
}): RangeSummary {
  const { range, knowts, categories, events, today } = input;
  const from = range.from.getTime();
  const to = range.to.getTime();

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const knowtById = new Map(knowts.map((k) => [k.id, k]));

  // Filtered here rather than trusted from the caller, so the same function
  // behaves whether it is handed a tight query or a whole table.
  const inRange = events.filter((event) => {
    const at = eventAt(event);
    return at !== null && at >= from && at < to;
  });

  const completedEvents = inRange.filter(
    (event) => event.completed_at !== null && event.method !== 'missed',
  );
  const missed = inRange.filter((event) => event.method === 'missed').length;

  const byMethod = { scan: 0, tap: 0, override: 0 };
  for (const event of completedEvents) {
    if (event.method === 'scan') byMethod.scan += 1;
    else if (event.method === 'override') byMethod.override += 1;
    else byMethod.tap += 1;
  }

  const items: CompletedItem[] = completedEvents
    .map((event) => {
      const knowt = knowtById.get(event.knowt_id) ?? null;
      const categoryId = knowt?.category_id ?? null;
      return {
        eventId: event.id,
        knowtId: event.knowt_id,
        // A Knowt deleted outright takes its name with it, but the completion
        // is still real, so it is shown rather than dropped.
        knowtName: knowt?.name ?? 'Deleted Knowt',
        category: categoryId ? (categoryById.get(categoryId) ?? null) : null,
        completedAt: event.completed_at as number,
        method: (event.method ?? 'tap') as EventMethod,
        snoozeCount: event.snooze_count,
        note: event.note,
      };
    })
    .sort((a, b) => b.completedAt - a.completedAt);

  const dayMap = new Map<string, CompletedDay>();
  for (const item of items) {
    const date = startOfDay(new Date(item.completedAt));
    const iso = toISODate(date);
    const day = dayMap.get(iso);
    if (day) day.items.push(item);
    else dayMap.set(iso, { iso, date, items: [item] });
  }
  const days = [...dayMap.values()].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );

  const snoozes = inRange.reduce((sum, event) => sum + event.snooze_count, 0);

  const bySnoozes = new Map<string, SnoozeTally>();
  for (const event of inRange) {
    if (event.snooze_count <= 0) continue;
    const held = bySnoozes.get(event.knowt_id);
    if (held) held.snoozes += event.snooze_count;
    else {
      const knowt = knowtById.get(event.knowt_id) ?? null;
      const categoryId = knowt?.category_id ?? null;
      bySnoozes.set(event.knowt_id, {
        knowtId: event.knowt_id,
        name: knowt?.name ?? 'Deleted Knowt',
        category: categoryId ? (categoryById.get(categoryId) ?? null) : null,
        snoozes: event.snooze_count,
      });
    }
  }

  const responses = completedEvents
    .filter(
      (event) =>
        event.fired_at !== null &&
        (event.completed_at as number) >= event.fired_at,
    )
    .map((event) =>
      Math.round(((event.completed_at as number) - (event.fired_at as number)) / 60_000),
    );

  // Whole days, from the range's own edges rather than a calendar assumption,
  // so a week is 7 and a day is 1 without either being special cased.
  const daysInRange = Math.max(
    1,
    Math.round((startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / DAY_MS),
  );

  const todayStart = startOfDay(today).getTime();
  const rangeStart = startOfDay(range.from).getTime();
  const elapsed =
    todayStart < rangeStart
      ? 0
      : Math.min(
          daysInRange,
          Math.round((todayStart - rangeStart) / DAY_MS) + 1,
        );

  return {
    from,
    to,
    completions: completedEvents.length,
    missed,
    rate:
      completedEvents.length + missed === 0
        ? null
        : completedEvents.length / (completedEvents.length + missed),
    byMethod,
    activeDays: dayMap.size,
    daysElapsed: elapsed,
    daysInRange,
    snoozes,
    medianResponseMinutes: median(responses),
    mostSnoozed: [...bySnoozes.values()].sort((a, b) => b.snoozes - a.snoozes),
    days,
    completedItems: items,
  };
}
