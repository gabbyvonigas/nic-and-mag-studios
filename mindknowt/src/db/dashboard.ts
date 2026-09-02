import { getDatabase } from './database';
import { listKnowts } from './knowts';
import { listPendingAlarms } from './pendingAlarms';
import { isDueOn, minutesOf } from './scheduling';
import type {
  CategoryRow,
  EventRow,
  KnowtWithDetail,
  PendingAlarmRow,
  ScheduleRow,
} from './types';

/**
 * One tile on the dashboard. A knowt with two schedules due today produces two
 * cards, because they are two separate things to do.
 */
export type DashboardCard = {
  knowt: KnowtWithDetail;
  /** The schedule that put this on today's board, or null for an untimed one. */
  schedule: ScheduleRow | null;
  completedAt: number | null;
  /** Completions today. Only above one for a knowt with a daily target. */
  completions: number;
  /** What is armed for this right now, if anything. */
  pending: PendingAlarmRow | null;
};

export type DashboardSection = {
  /** Null for knowts with no category, which sort last. */
  category: CategoryRow | null;
  cards: DashboardCard[];
};

export type Dashboard = {
  sections: DashboardSection[];
  total: number;
  done: number;
};

/** Key for the group holding knowts with no category. Cannot collide with an id. */
const UNCATEGORIZED = 'uncategorized:none';

/**
 * What belongs on the dashboard today.
 *
 * Two things qualify: anything with a schedule due today, and every Open-mode
 * knowt whether or not it is due. Open knowts are the habit-shaped ones with no
 * tag to scan, so they stay tappable all day. Everything else lives in Knowts,
 * which is the full inventory; repeating that inventory here would make the
 * dashboard a second copy of it rather than a picture of today.
 */
export async function listDashboard(now = new Date()): Promise<Dashboard> {
  const knowts = await listKnowts();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);

  const db = await getDatabase();
  const completions = await db.getAllAsync<EventRow>(
    `SELECT * FROM events
      WHERE completed_at IS NOT NULL AND completed_at >= ? AND completed_at < ?`,
    dayStart.getTime(),
    dayEnd.getTime(),
  );
  const pending = await listPendingAlarms(now.getTime());

  const cards: DashboardCard[] = [];

  for (const knowt of knowts) {
    const dueToday = knowt.schedules.filter((s) => isDueOn(s, now));
    const mine = completions.filter((e) => e.knowt_id === knowt.id);

    for (const schedule of dueToday) {
      const done = mine.find((e) => e.schedule_id === schedule.id);
      cards.push({
        knowt,
        schedule,
        completedAt: done?.completed_at ?? null,
        completions: mine.length,
        pending: pendingFor(pending, knowt.id, schedule.id),
      });
    }

    // An Open knowt with nothing due still belongs here. One with a schedule
    // due today already has its card above, so this must not add a second.
    if (knowt.mode === 'open' && dueToday.length === 0) {
      const done = mine.find((e) => e.schedule_id === null);
      cards.push({
        knowt,
        schedule: null,
        completedAt: done?.completed_at ?? null,
        completions: mine.length,
        pending: pendingFor(pending, knowt.id, null),
      });
    }
  }

  return groupByCategory(cards);
}

/**
 * The alarm to show on a card. A one-shot wins: a snooze or a re-fire is more
 * urgent news than the standing schedule, and it is the thing the person had no
 * way of seeing before.
 */
function pendingFor(
  rows: PendingAlarmRow[],
  knowtId: string,
  scheduleId: string | null,
): PendingAlarmRow | null {
  const mine = rows.filter((r) => r.knowt_id === knowtId);
  if (mine.length === 0) return null;

  const soonest = (list: PendingAlarmRow[]) =>
    list.reduce((a, b) => (a.fires_at <= b.fires_at ? a : b));

  const oneShots = mine.filter((r) => r.schedule_id === null);
  if (oneShots.length > 0) return soonest(oneShots);

  if (scheduleId) {
    return mine.find((r) => r.schedule_id === scheduleId) ?? null;
  }
  return soonest(mine);
}

function groupByCategory(cards: DashboardCard[]): Dashboard {
  const sections = new Map<string, DashboardSection>();

  for (const card of cards) {
    const category = card.knowt.category;
    const key = category?.id ?? UNCATEGORIZED;
    const section = sections.get(key);
    if (section) section.cards.push(card);
    else sections.set(key, { category, cards: [card] });
  }

  const ordered = [...sections.values()].sort((a, b) => {
    // Knowts with no category sort last, whatever the shipped order is.
    if (!a.category) return 1;
    if (!b.category) return -1;
    if (a.category.sort !== b.category.sort) {
      return a.category.sort - b.category.sort;
    }
    return a.category.name.localeCompare(b.category.name);
  });

  for (const section of ordered) {
    section.cards.sort(compareCards);
  }

  return {
    sections: ordered,
    total: cards.length,
    done: cards.filter((c) => c.completedAt !== null).length,
  };
}

/** Timed things first, in time order. Untimed ones after, by name. */
function compareCards(a: DashboardCard, b: DashboardCard): number {
  if (a.schedule && b.schedule) {
    const diff = minutesOf(a.schedule.time) - minutesOf(b.schedule.time);
    if (diff !== 0) return diff;
    return a.knowt.name.localeCompare(b.knowt.name);
  }
  if (a.schedule) return -1;
  if (b.schedule) return 1;
  return a.knowt.name.localeCompare(b.knowt.name);
}

export type { KnowtWithDetail };
