import { getAppMeta, getDatabase, setAppMeta } from './database';
import { listKnowts } from './knowts';
import { toISODate } from './scheduling';
import { pickInsight, type Insight, type InsightEvent } from '../history/insights';
import type { EventRow } from './types';

/**
 * The stored pick, and the day it was made.
 *
 * Refreshed once a day rather than on every render. Two reasons: the rules
 * walk months of events and there is no sense redoing that when a tab is
 * tapped, and a line that changes while someone is reading it reads as noise
 * rather than as a finding.
 */
const PICKED_ON = 'insight_picked_on';
const PAYLOAD = 'insight_payload';

/** How far back the rules look. Long enough for a weekday claim to be earned. */
const LOOKBACK_DAYS = 120;

async function loadEvents(now: Date): Promise<InsightEvent[]> {
  const db = await getDatabase();
  const from = now.getTime() - LOOKBACK_DAYS * 86_400_000;

  const rows = await db.getAllAsync<EventRow>(
    `SELECT * FROM events
      WHERE COALESCE(completed_at, fired_at) >= ?
      ORDER BY COALESCE(completed_at, fired_at) DESC`,
    from,
  );

  const knowts = await listKnowts();
  const byId = new Map(knowts.map((knowt) => [knowt.id, knowt]));

  const events: InsightEvent[] = [];
  for (const row of rows) {
    const knowt = byId.get(row.knowt_id);
    // A knowt that has since been deleted takes its events out of the picture
    // with it. Saying something about a thing nobody can open is not useful.
    if (!knowt) continue;
    events.push({
      knowtId: knowt.id,
      knowtName: knowt.name,
      hasTag: knowt.tag_uid !== null,
      completedAt: row.completed_at,
      method: (row.method as InsightEvent['method']) ?? null,
    });
  }
  return events;
}

/**
 * The insight to show, recomputed at most once a day.
 *
 * Returns null freely. Early on there is nothing honest to say, and silence is
 * the correct output rather than a placeholder.
 */
export async function loadInsight(now = new Date()): Promise<Insight | null> {
  const today = toISODate(now);
  const pickedOn = await getAppMeta(PICKED_ON);

  if (pickedOn === today) {
    const stored = await getAppMeta(PAYLOAD);
    if (stored === null || stored === '') return null;
    try {
      return JSON.parse(stored) as Insight;
    } catch {
      // A payload that will not parse is a payload from an older shape. Fall
      // through and recompute rather than failing the whole screen over it.
    }
  }

  const insight = pickInsight(await loadEvents(now), now);
  await setAppMeta(PAYLOAD, insight ? JSON.stringify(insight) : '');
  await setAppMeta(PICKED_ON, today);
  return insight;
}

/** Used by Dev, so the day's pick can be forced without waiting for tomorrow. */
export async function clearInsightCache(): Promise<void> {
  await setAppMeta(PICKED_ON, '');
}
