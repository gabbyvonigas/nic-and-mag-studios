import { getDatabase } from './database';
import { listCategories, listKnowts } from './knowts';
import {
  monthEnd,
  monthStart,
  summarizeMonth,
  windowStart,
  type MonthSummary,
} from '../history/summary';
import {
  summarizePeriod,
  type PeriodRange,
  type PeriodSummary,
} from '../history/period';
import type { CategoryRow, EventMethod, EventRow } from './types';

/**
 * Loads one month's summary. The only part of the Log that touches SQLite; the
 * arithmetic lives in `src/history/summary.ts` so it can be tested off device.
 *
 * The query reaches back before the month because a streak running into it
 * started earlier, and cutting the window at the 1st would report it as
 * beginning there.
 */
export async function loadMonthSummary(
  year: number,
  month: number,
  today = new Date(),
): Promise<MonthSummary> {
  const db = await getDatabase();
  const from = windowStart(year, month).getTime();
  const to = monthEnd(year, month).getTime();

  const events = await db.getAllAsync<EventRow>(
    `SELECT * FROM events
      WHERE COALESCE(completed_at, fired_at) >= ?
        AND COALESCE(completed_at, fired_at) < ?`,
    from,
    to,
  );

  const [knowts, categories] = await Promise.all([
    listKnowts(),
    listCategories(),
  ]);

  return summarizeMonth({ year, month, knowts, categories, events, today });
}

/**
 * One completion, with everything recorded about it.
 *
 * Two of these fields have been written since the beginning and read back
 * nowhere: the note you can add on the Ringing screen, and how many times it
 * was snoozed first. Log is where they finally surface.
 */
export type LoggedCompletion = {
  eventId: string;
  knowtId: string;
  knowtName: string;
  completedAt: number;
  method: EventMethod;
  snoozeCount: number;
  note: string | null;
  /** Minutes from the alarm ringing to it being finished, when it rang. */
  minutesToComplete: number | null;
};

export type LogCategoryGroup = {
  category: CategoryRow | null;
  completions: LoggedCompletion[];
};

export type MonthLog = {
  groups: LogCategoryGroup[];
  total: number;
};

/** Key for the group holding knowts with no category. */
const LOG_UNCATEGORIZED = 'uncategorized:none';

/**
 * Every completion in a month, grouped by the category of the knowt it
 * belongs to, newest first inside each group.
 *
 * Archived knowts are still joined, because a completion that happened did
 * happen; hiding history when a knowt is archived would quietly rewrite the
 * month.
 */
export async function loadMonthLog(
  year: number,
  month: number,
): Promise<MonthLog> {
  const db = await getDatabase();
  const from = monthStart(year, month).getTime();
  const to = monthEnd(year, month).getTime();

  const rows = await db.getAllAsync<
    EventRow & { knowt_name: string | null; category_id: string | null }
  >(
    `SELECT e.*, k.name AS knowt_name, k.category_id AS category_id
       FROM events e
       LEFT JOIN knowts k ON k.id = e.knowt_id
      WHERE e.completed_at IS NOT NULL
        AND e.completed_at >= ? AND e.completed_at < ?
        AND (e.method IS NULL OR e.method != 'missed')
      ORDER BY e.completed_at DESC`,
    from,
    to,
  );

  const categories = await listCategories();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map<string, LogCategoryGroup>();

  for (const row of rows) {
    const category = row.category_id ? (byId.get(row.category_id) ?? null) : null;
    const key = category?.id ?? LOG_UNCATEGORIZED;

    const completion: LoggedCompletion = {
      eventId: row.id,
      knowtId: row.knowt_id,
      // A knowt deleted outright takes its name with it, but the completion
      // is still real, so it is shown rather than dropped.
      knowtName: row.knowt_name ?? 'Deleted knowt',
      completedAt: row.completed_at as number,
      method: (row.method ?? 'tap') as EventMethod,
      snoozeCount: row.snooze_count,
      note: row.note,
      minutesToComplete:
        row.fired_at !== null && (row.completed_at as number) >= row.fired_at
          ? Math.round(((row.completed_at as number) - row.fired_at) / 60_000)
          : null,
    };

    const group = groups.get(key);
    if (group) group.completions.push(completion);
    else groups.set(key, { category, completions: [completion] });
  }

  const ordered = [...groups.values()].sort((a, b) => {
    if (a.completions.length !== b.completions.length) {
      return b.completions.length - a.completions.length;
    }
    if (!a.category) return 1;
    if (!b.category) return -1;
    return a.category.sort - b.category.sort;
  });

  return { groups: ordered, total: rows.length };
}

/**
 * Removes a completion, which puts its knowt back on Daily.
 *
 * This is the undo for a mis-tapped check. Completing is what makes an item
 * leave Daily, so the way back has to live where the item went.
 */
export async function undoCompletion(eventId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM events WHERE id = ?', eventId);
}

/**
 * One period's numbers, for any of the three spans the Log offers.
 *
 * Only the range changes; the arithmetic is in `src/history/period.ts` so it
 * can be tested without a database, the same as the month summary.
 */
export async function loadPeriodSummary(
  range: PeriodRange,
  today = new Date(),
): Promise<PeriodSummary> {
  const db = await getDatabase();

  const events = await db.getAllAsync<EventRow>(
    `SELECT * FROM events
      WHERE COALESCE(completed_at, fired_at) >= ?
        AND COALESCE(completed_at, fired_at) < ?`,
    range.from.getTime(),
    range.to.getTime(),
  );

  const [knowts, categories] = await Promise.all([
    listKnowts(),
    listCategories(),
  ]);

  return summarizePeriod({ range, knowts, categories, events, today });
}
