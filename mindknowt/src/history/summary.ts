import { isDueOn } from '../db/scheduling';
import type { CategoryRow, EventRow, KnowtWithDetail } from '../db/types';

/**
 * Month aggregation over the events table. No new data model: every number
 * here is derived from rows the app already writes when something is completed
 * or missed.
 *
 * Pure on purpose, so the arithmetic can be exercised off device. The database
 * loader in `src/db/history.ts` is the only part that touches SQLite.
 */

export type CategoryTally = {
  /** Null for the group holding knowts with no category. */
  category: CategoryRow | null;
  completions: number;
  /** 0 to 1, of the month's completions. Zero when the month is empty. */
  share: number;
};

export type StreakEntry = {
  knowtId: string;
  name: string;
  category: CategoryRow | null;
  /**
   * Consecutive due days completed, counting back from the most recent due day
   * that has passed. Only meaningful for the month containing today.
   */
  current: number;
  /** Longest unbroken run of due days completed that touches this month. */
  best: number;
};

/** A knowt that keeps getting put off, and by how much. */
export type SnoozeEntry = {
  knowtId: string;
  name: string;
  category: CategoryRow | null;
  snoozes: number;
};

/** A knowt that went by without being done, and how often. */
export type MissEntry = {
  knowtId: string;
  name: string;
  category: CategoryRow | null;
  misses: number;
};

export type MonthSummary = {
  year: number;
  /** 0 to 11, matching Date. */
  month: number;
  completions: number;
  missed: number;
  /** Completions over completions plus misses. Null when neither happened. */
  rate: number | null;
  byCategory: CategoryTally[];
  byMethod: { scan: number; tap: number; override: number };
  /** Days in the month with at least one completion. */
  activeDays: number;
  /** Days of the month that have actually happened, so a rate is honest. */
  daysElapsed: number;
  daysInMonth: number;
  /** Whether this is the month containing today. */
  isCurrentMonth: boolean;
  streaks: StreakEntry[];

  /** Every snooze pressed this month, across everything. */
  snoozes: number;
  /**
   * What gets put off most, busiest first.
   *
   * The actionable number in here. A knowt snoozed every day does not have a
   * discipline problem, it has a wrong time, and nothing else in the app says
   * so.
   */
  mostSnoozed: SnoozeEntry[];
  /**
   * Median minutes from the alarm ringing to it being finished. Null when
   * nothing rang: a spontaneous check-in never had a ring to answer.
   */
  medianResponseMinutes: number | null;
  /** Completions per weekday, Sunday first, so a weekend collapse shows. */
  byWeekday: number[];
  /** What was missed, with names rather than just a count. */
  /**
   * Which knowts went by most often. Still computed and still tested, but
   * nothing renders it: the "Went by" list was removed from the Log because a
   * standing list of failures is not what that screen is for.
   */
  missedKnowts: MissEntry[];
};

const DAY_MS = 86_400_000;

/** How far before the month to look, so a run entering it is not cut short. */
export const STREAK_LOOKBACK_DAYS = 120;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function monthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

export function monthEnd(year: number, month: number): Date {
  return new Date(year, month + 1, 1);
}

/** The earliest instant the loader has to fetch for this month's summary. */
export function windowStart(year: number, month: number): Date {
  return addDays(monthStart(year, month), -STREAK_LOOKBACK_DAYS);
}

function dayKey(knowtId: string, day: Date): string {
  return `${knowtId}:${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

function isCompletion(event: EventRow): boolean {
  return event.completed_at !== null && event.method !== 'missed';
}

/** Whether a knowt had anything expected of it on a given day. */
function dueOnDay(knowt: KnowtWithDetail, day: Date): boolean {
  return knowt.schedules.some((schedule) => isDueOn(schedule, day));
}

/**
 * Runs of consecutive due days completed, for one knowt.
 *
 * Only days the knowt was actually due count. A weekday knowt is not broken by
 * the weekend, which is the whole reason this walks due days rather than
 * calendar days.
 *
 * `best` counts only runs that touch the month being shown, so a long streak
 * from two months ago does not get reported as this month's achievement.
 * `current` is the run still open when the walk ends.
 */
function runsFor(
  knowt: KnowtWithDetail,
  completionDays: Set<string>,
  from: Date,
  to: Date,
  monthFrom: Date,
  monthTo: Date,
  /** Today, when the walk reaches it. An unfinished today is not a failure. */
  openDay: Date | null,
): { current: number; best: number } {
  let length = 0;
  let touchesMonth = false;
  let best = 0;

  const closeRun = () => {
    if (touchesMonth) best = Math.max(best, length);
    length = 0;
    touchesMonth = false;
  };

  for (let day = startOfDay(from); day <= to; day = addDays(day, 1)) {
    if (!dueOnDay(knowt, day)) continue;

    const key = dayKey(knowt.id, day);
    if (!completionDays.has(key)) {
      // Today is still in progress. Counting it as a miss would end a live
      // streak every morning and restore it every evening.
      if (openDay && day.getTime() === openDay.getTime()) continue;
      closeRun();
      continue;
    }

    length += 1;
    if (day >= monthFrom && day < monthTo) touchesMonth = true;
  }

  // The run still open at the end is the current streak, and it also counts
  // towards best, so close it before reporting.
  const current = length;
  closeRun();

  return { current, best };
}

export function summarizeMonth(input: {
  year: number;
  month: number;
  knowts: KnowtWithDetail[];
  categories: CategoryRow[];
  /** Every event from `windowStart` to the end of the month. */
  events: EventRow[];
  today: Date;
}): MonthSummary {
  const { year, month, knowts, categories, events, today } = input;

  const from = monthStart(year, month);
  const to = monthEnd(year, month);
  const daysInMonth = Math.round((to.getTime() - from.getTime()) / DAY_MS);

  const todayStart = startOfDay(today);
  const isCurrentMonth =
    today.getFullYear() === year && today.getMonth() === month;
  const daysElapsed = isCurrentMonth
    ? today.getDate()
    : todayStart >= to
      ? daysInMonth
      : 0;

  const inMonth = events.filter((e) => {
    const at = e.completed_at ?? e.fired_at;
    return at !== null && at >= from.getTime() && at < to.getTime();
  });

  const completions = inMonth.filter(isCompletion);
  const missed = inMonth.filter((e) => e.method === 'missed');

  const byMethod = { scan: 0, tap: 0, override: 0 };
  for (const event of completions) {
    if (event.method === 'scan') byMethod.scan += 1;
    else if (event.method === 'tap') byMethod.tap += 1;
    else if (event.method === 'override') byMethod.override += 1;
  }

  const knowtById = new Map(knowts.map((k) => [k.id, k]));

  const tallies = new Map<string, CategoryTally>();
  for (const event of completions) {
    const knowt = knowtById.get(event.knowt_id);
    const category = knowt?.category ?? null;
    const key = category?.id ?? '';
    const existing = tallies.get(key);
    if (existing) existing.completions += 1;
    else tallies.set(key, { category, completions: 1, share: 0 });
  }
  for (const tally of tallies.values()) {
    tally.share = completions.length === 0 ? 0 : tally.completions / completions.length;
  }

  const order = new Map(categories.map((c, i) => [c.id, i]));
  const byCategory = [...tallies.values()].sort((a, b) => {
    if (a.completions !== b.completions) return b.completions - a.completions;
    if (!a.category) return 1;
    if (!b.category) return -1;
    return (order.get(a.category.id) ?? 0) - (order.get(b.category.id) ?? 0);
  });

  const activeDays = new Set(
    completions.map((e) => {
      const at = new Date(e.completed_at as number);
      return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
    }),
  ).size;

  // Streaks look at the whole window, not just the month, so a run that began
  // in the previous month is not reported as starting on the 1st.
  const completionDays = new Set<string>();
  for (const event of events) {
    if (!isCompletion(event)) continue;
    completionDays.add(
      dayKey(event.knowt_id, new Date(event.completed_at as number)),
    );
  }

  // The walk covers today so a completion today extends the streak, and
  // `openDay` stops an unfinished today from ending it.
  const walkTo = isCurrentMonth ? todayStart : addDays(to, -1);
  const openDay = isCurrentMonth ? todayStart : null;

  const streaks: StreakEntry[] = [];
  for (const knowt of knowts) {
    if (knowt.schedules.length === 0) continue;
    const { current, best } = runsFor(
      knowt,
      completionDays,
      windowStart(year, month),
      walkTo,
      from,
      to,
      openDay,
    );
    if (best < 2 && current < 2) continue;
    streaks.push({
      knowtId: knowt.id,
      name: knowt.name,
      category: knowt.category,
      current: isCurrentMonth ? current : 0,
      best,
    });
  }

  streaks.sort((a, b) => {
    const aKey = Math.max(a.current, a.best);
    const bKey = Math.max(b.current, b.best);
    if (aKey !== bKey) return bKey - aKey;
    return a.name.localeCompare(b.name);
  });

  // Snoozes count across every event in the month, not only completed ones:
  // an alarm snoozed four times and then ignored is the clearest case of all.
  let snoozes = 0;
  const snoozeByKnowt = new Map<string, number>();
  for (const event of inMonth) {
    if (event.snooze_count <= 0) continue;
    snoozes += event.snooze_count;
    snoozeByKnowt.set(
      event.knowt_id,
      (snoozeByKnowt.get(event.knowt_id) ?? 0) + event.snooze_count,
    );
  }

  const mostSnoozed: SnoozeEntry[] = [...snoozeByKnowt.entries()]
    .map(([knowtId, count]) => {
      const knowt = knowtById.get(knowtId);
      return {
        knowtId,
        name: knowt?.name ?? 'Deleted knowt',
        category: knowt?.category ?? null,
        snoozes: count,
      };
    })
    .sort((a, b) => b.snoozes - a.snoozes || a.name.localeCompare(b.name));

  // Only completions that answered a ring have a response time. A check-in
  // with no fired_at would otherwise report as instant and drag the median
  // towards zero.
  const responses = completions
    .filter((e) => e.fired_at !== null && (e.completed_at as number) >= e.fired_at)
    .map((e) => ((e.completed_at as number) - (e.fired_at as number)) / 60_000)
    .sort((a, b) => a - b);

  const medianResponseMinutes =
    responses.length === 0
      ? null
      : responses.length % 2 === 1
        ? (responses[(responses.length - 1) / 2] as number)
        : ((responses[responses.length / 2 - 1] as number) +
            (responses[responses.length / 2] as number)) /
          2;

  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const event of completions) {
    byWeekday[new Date(event.completed_at as number).getDay()] += 1;
  }

  const missByKnowt = new Map<string, number>();
  for (const event of missed) {
    missByKnowt.set(event.knowt_id, (missByKnowt.get(event.knowt_id) ?? 0) + 1);
  }
  const missedKnowts: MissEntry[] = [...missByKnowt.entries()]
    .map(([knowtId, count]) => {
      const knowt = knowtById.get(knowtId);
      return {
        knowtId,
        name: knowt?.name ?? 'Deleted knowt',
        category: knowt?.category ?? null,
        misses: count,
      };
    })
    .sort((a, b) => b.misses - a.misses || a.name.localeCompare(b.name));

  const rated = completions.length + missed.length;

  return {
    year,
    month,
    completions: completions.length,
    missed: missed.length,
    rate: rated === 0 ? null : completions.length / rated,
    byCategory,
    byMethod,
    activeDays,
    daysElapsed,
    daysInMonth,
    isCurrentMonth,
    streaks,
    snoozes,
    mostSnoozed,
    medianResponseMinutes,
    byWeekday,
    missedKnowts,
  };
}
