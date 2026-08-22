import { getDatabase } from './database';
import { newId } from './ids';
import { isDueOn, minutesOf, toISODate } from './scheduling';
import type {
  CategoryRow,
  EventMethod,
  EventRow,
  KnowtMode,
  KnowtRow,
  KnowtWithDetail,
  RepeatType,
  ScheduleRow,
} from './types';

export async function listCategories(): Promise<CategoryRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<CategoryRow>(
    'SELECT * FROM categories ORDER BY sort, name',
  );
}

async function attachDetail(rows: KnowtRow[]): Promise<KnowtWithDetail[]> {
  if (rows.length === 0) return [];
  const db = await getDatabase();
  const categories = await listCategories();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const schedules = await db.getAllAsync<ScheduleRow>(
    'SELECT * FROM schedules ORDER BY time',
  );

  return rows.map((knowt) => ({
    ...knowt,
    category: knowt.category_id ? (byId.get(knowt.category_id) ?? null) : null,
    schedules: schedules.filter((s) => s.knowt_id === knowt.id),
  }));
}

export async function listKnowts(): Promise<KnowtWithDetail[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<KnowtRow>(
    'SELECT * FROM knowts WHERE archived = 0 ORDER BY name',
  );
  return attachDetail(rows);
}

export async function getKnowt(id: string): Promise<KnowtWithDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<KnowtRow>(
    'SELECT * FROM knowts WHERE id = ?',
    id,
  );
  if (!row) return null;
  const [detail] = await attachDetail([row]);
  return detail ?? null;
}

export async function findKnowtByTagUid(
  tagUid: string,
): Promise<KnowtWithDetail | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<KnowtRow>(
    'SELECT * FROM knowts WHERE tag_uid = ?',
    tagUid,
  );
  if (!row) return null;
  const [detail] = await attachDetail([row]);
  return detail ?? null;
}

export type NewKnowt = {
  name: string;
  icon?: string;
  mode?: KnowtMode;
  tagUid?: string | null;
  categoryId?: string | null;
  locationNote?: string | null;
  notes?: string | null;
  schedule?: {
    label?: string | null;
    time: string;
    repeatType: RepeatType;
    daysOfWeek?: number[];
    intervalDays?: number;
    startDate?: string;
  };
};

export async function createKnowt(input: NewKnowt): Promise<string> {
  const db = await getDatabase();
  const id = newId();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO knowts
         (id, tag_uid, mode, name, icon, category_id, location_note, notes,
          link_url, refire_minutes, snooze_minutes, archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 5, 10, 0, ?)`,
      id,
      input.tagUid ?? null,
      input.mode ?? 'open',
      input.name,
      input.icon ?? 'dot',
      input.categoryId ?? null,
      input.locationNote ?? null,
      input.notes ?? null,
      Date.now(),
    );

    if (input.schedule) {
      const s = input.schedule;
      await db.runAsync(
        `INSERT INTO schedules
           (id, knowt_id, label, time, repeat_type, days_of_week, interval_days,
            supply_days, lead_days, start_date, enabled, alarmkit_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1, NULL)`,
        newId(),
        id,
        s.label ?? null,
        s.time,
        s.repeatType,
        s.daysOfWeek ? JSON.stringify(s.daysOfWeek) : null,
        s.intervalDays ?? null,
        s.startDate ?? null,
      );
    }
  });

  return id;
}

export async function updateNotes(id: string, notes: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE knowts SET notes = ? WHERE id = ?', notes, id);
}

export async function archiveKnowt(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE knowts SET archived = 1 WHERE id = ?', id);
}

export type TodayInstance = {
  knowt: KnowtWithDetail;
  schedule: ScheduleRow;
  completedAt: number | null;
};

/** Today's instances in time order, spec section 5.3. */
export async function listToday(now = new Date()): Promise<TodayInstance[]> {
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

  const instances: TodayInstance[] = [];
  for (const knowt of knowts) {
    for (const schedule of knowt.schedules) {
      if (!isDueOn(schedule, now)) continue;
      const done = completions.find((e) => e.schedule_id === schedule.id);
      instances.push({
        knowt,
        schedule,
        completedAt: done?.completed_at ?? null,
      });
    }
  }

  return instances.sort(
    (a, b) => minutesOf(a.schedule.time) - minutesOf(b.schedule.time),
  );
}

/**
 * Writes a history row. `scheduleId` is null for a spontaneous check-in with no
 * alarm pending — spec section 3 treats that as a valid "I just did this".
 */
export async function logCompletion(args: {
  knowtId: string;
  scheduleId?: string | null;
  method: EventMethod;
  note?: string | null;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO events
       (id, knowt_id, schedule_id, fired_at, completed_at, method, note, snooze_count)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 0)`,
    newId(),
    args.knowtId,
    args.scheduleId ?? null,
    Date.now(),
    args.method,
    args.note ?? null,
  );
}

export async function listEvents(knowtId: string, limit = 30): Promise<EventRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<EventRow>(
    `SELECT * FROM events WHERE knowt_id = ?
      ORDER BY COALESCE(completed_at, fired_at) DESC LIMIT ?`,
    knowtId,
    limit,
  );
}

export async function todayCompletionCount(): Promise<number> {
  const db = await getDatabase();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM events WHERE completed_at >= ?',
    start.getTime(),
  );
  return row?.n ?? 0;
}

export { toISODate };
