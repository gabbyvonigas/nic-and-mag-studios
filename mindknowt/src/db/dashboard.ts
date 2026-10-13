import { getDatabase } from './database';
import { listKnowts } from './knowts';
import { listPendingAlarms } from './pendingAlarms';
import { isDueOn, minutesOf, nextOccurrence, toISODate } from './scheduling';
import { buildSnoozed, type SnoozedEntry } from '../knowts/snoozed';

export type { SnoozedEntry };
import { weekOf } from '../knowts/weekStrip';
import { categoryShades } from '../theme/categoryColors';
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
 * What belongs on the dashboard for a day.
 *
 * One thing qualifies: a schedule due that day. One card per schedule, so a
 * knowt that rings at eight and again at six is two separate things to do.
 *
 * Nothing else, and this has now been got wrong twice in the same direction.
 * Open-mode knowts were once included whether or not they were due, on the
 * reasoning that a habit with no tag should stay tappable all day. Then Scan
 * Knowts were given a card every day under their own heading. Both filled
 * Daily with things that were never going to ring, which is the one thing
 * Daily is for, and the second also caught four preset Knowts that merely had
 * no time set yet.
 *
 * So Daily is the day's timetable and nothing else. A Scan Knowt lives on the
 * Knowts tab, which is the full inventory, and is scanned from there.
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

/** One day in the date strip. */
export type DayMark = {
  date: Date;
  /** Local YYYY-MM-DD, which is what the strip keys and compares on. */
  iso: string;
  /** How many knowts are due that day. */
  count: number;
  /** Up to three category colors, for the dots under the day. */
  colors: string[];
};

/**
 * The calendar week containing a day, with what is due on each of its days.
 *
 * Daily is one day at a time, and the strip is how the others are reached:
 * arrows move a whole week, so a weekday never changes column underneath you.
 */
export async function listWeekMarks(anchor = new Date()): Promise<DayMark[]> {
  const knowts = await listKnowts();
  const marks: DayMark[] = [];

  // The calendar week containing the anchor, Sunday first. The date math is in
  // `weekStrip` so it can be tested against month ends and clock changes.
  for (const date of weekOf(anchor)) {
    let count = 0;
    const colors: string[] = [];
    for (const knowt of knowts) {
      // The same test the board uses, so the dots and the cards can never
      // disagree: a strip saying three over a board showing four is worse than
      // either number on its own.
      const due = knowt.schedules.filter((schedule) =>
        isDueOn(schedule, date),
      ).length;
      if (due === 0) continue;
      count += due;
      const color = categoryShades(knowt.category).color;
      if (!colors.includes(color)) colors.push(color);
    }

    marks.push({ date, iso: toISODate(date), count, colors: colors.slice(0, 3) });
  }

  return marks;
}

/** One knowt coming up, with when it next fires. */
/**
 * What is snoozed at this moment, for the section under Daily's week strip.
 *
 * Reads every pending snooze rather than the ones for a given day: a snooze
 * taken at 11:55pm comes due tomorrow but is snoozed right now, and right now
 * is the only thing that section is about.
 */
export async function listSnoozed(now = new Date()): Promise<SnoozedEntry[]> {
  // Every pending alarm, narrowed to snoozes by `buildSnoozed`, which is
  // where that rule is tested.
  const [alarms, knowts] = await Promise.all([
    listPendingAlarms(now.getTime()),
    listKnowts(),
  ]);
  return buildSnoozed({ alarms, knowts, now: now.getTime() });
}

export type UpcomingEntry = {
  knowt: KnowtWithDetail;
  schedule: ScheduleRow;
  at: Date;
};

/**
 * What is next, from tomorrow onward and with no horizon.
 *
 * Shown on Daily only once the day is finished, so the screen has something to
 * say other than that there is nothing to do. One row per knowt, because this
 * is a glance: a knowt firing three times on Thursday is still one thing to
 * expect.
 */
export async function listUpcoming(
  now = new Date(),
  limit = 8,
): Promise<UpcomingEntry[]> {
  const knowts = await listKnowts();
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );

  const entries: UpcomingEntry[] = [];
  for (const knowt of knowts) {
    let soonest: UpcomingEntry | null = null;
    for (const schedule of knowt.schedules) {
      const at = nextOccurrence(schedule, tomorrow);
      if (!at) continue;
      if (!soonest || at < soonest.at) soonest = { knowt, schedule, at };
    }
    if (soonest) entries.push(soonest);
  }

  return entries
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, limit);
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
