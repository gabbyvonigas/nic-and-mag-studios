import { getDatabase } from './database';
import { listCategories, listKnowts } from './knowts';
import {
  monthEnd,
  summarizeMonth,
  windowStart,
  type MonthSummary,
} from '../history/summary';
import type { EventRow } from './types';

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
