import { getDatabase } from './database';
import { listKnowts } from './knowts';
import { listPendingAlarms } from './pendingAlarms';
import { isDueOn, minutesOf, nextOccurrence } from './scheduling';
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
  /**
   * The schedule that put this on today's board. Nullable because completions
   * and pending alarms can both be schedule-less; nothing reaches the board
   * without one.
   */
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
  /**
   * Every card for today in one list, in time order across categories. The
   * home screen leads with this: today is a single sequence of things, not six
   * separate ones.
   */
  today: DashboardCard[];
  total: number;
  done: number;
};

/**
 * A category and everything in it, with whatever is coming up next.
 *
 * This is the browse layer, not a view of today. It covers every live knowt in
 * the category whether or not it is due, which is why it carries its own
 * next-occurrence rather than reusing the dashboard cards.
 */
export type CategoryGroup = {
  category: CategoryRow | null;
  knowts: KnowtWithDetail[];
  /** The soonest thing due in this category, or null if nothing is scheduled. */
  next: { knowt: KnowtWithDetail; at: Date } | null;
};

/** Key for the group holding knowts with no category. Cannot collide with an id. */
const UNCATEGORIZED = 'uncategorized:none';

/**
 * What belongs on the dashboard today.
 *
 * One thing qualifies: a schedule due today. Nothing else, whatever its mode.
 *
 * Open-mode knowts used to be included whether or not they were due, on the
 * reasoning that a habit with no tag should stay tappable all day. In practice
 * that put things on Daily that were never going to ring, which is the one
 * thing Daily is supposed to tell you. The full inventory is Knowts.
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
    today: [...cards].sort(compareCards),
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

/** The soonest moment any of a knowt's schedules next fires. */
function soonestFor(knowt: KnowtWithDetail, now: Date): Date | null {
  let soonest: Date | null = null;
  for (const schedule of knowt.schedules) {
    const at = nextOccurrence(schedule, now);
    if (at && (!soonest || at < soonest)) soonest = at;
  }
  return soonest;
}

/**
 * Every category with its knowts, for the collapsible groups on Knowts.
 *
 * Categories with nothing in them are left out: an empty row that can never
 * expand is a dead end. Uncategorized knowts group together and sort last,
 * the same as everywhere else.
 */
export async function listCategoryGroups(
  now = new Date(),
): Promise<CategoryGroup[]> {
  const knowts = await listKnowts();
  const groups = new Map<string, CategoryGroup>();

  for (const knowt of knowts) {
    const category = knowt.category;
    const key = category?.id ?? UNCATEGORIZED;
    const group = groups.get(key);
    if (group) group.knowts.push(knowt);
    else groups.set(key, { category, knowts: [knowt], next: null });
  }

  for (const group of groups.values()) {
    for (const knowt of group.knowts) {
      const at = soonestFor(knowt, now);
      if (at && (!group.next || at < group.next.at)) group.next = { knowt, at };
    }

    // Highest priority first, then by name. What is next is shown separately
    // on the collapsed row, so the list itself sorts by what matters.
    group.knowts.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.name.localeCompare(b.name);
    });
  }

  return [...groups.values()].sort((a, b) => {
    if (!a.category) return 1;
    if (!b.category) return -1;
    if (a.category.sort !== b.category.sort) {
      return a.category.sort - b.category.sort;
    }
    return a.category.name.localeCompare(b.category.name);
  });
}
