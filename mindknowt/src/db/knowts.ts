import { getDatabase } from './database';
import { newId } from './ids';
import { isDueOn, minutesOf, TIME_PATTERN, toISODate } from './scheduling';
import {
  PRIORITY_HIGH,
  PRIORITY_LOW,
  PRIORITY_NORMAL,
} from './types';
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

/** Raised when a category cannot be changed the way the caller asked. */
export class CategoryLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryLockedError';
  }
}

/**
 * Makes a category of the user's own. `key` stays null: keys identify the six
 * shipped categories so bundled starter-set content can reference them, and a
 * custom category is never referenced by content.
 */
export async function createCategory(input: {
  name: string;
  color: string;
  icon?: string;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error('A category needs a name.');

  const db = await getDatabase();
  const id = newId();
  const last = await db.getFirstAsync<{ top: number | null }>(
    'SELECT MAX(sort) AS top FROM categories',
  );

  await db.runAsync(
    `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
     VALUES (?, ?, NULL, ?, ?, 1, ?)`,
    id,
    name,
    input.color,
    input.icon ?? 'dot',
    (last?.top ?? 0) + 1,
  );
  return id;
}

/**
 * Edits a category. Shipped categories can be renamed but keep their colour:
 * the six swatches are the brand, and a migration that repaints them matches on
 * `is_custom = 0`, so a colour changed here would be silently overwritten by a
 * later version. Refusing is honest; letting it be reverted later is not.
 */
export async function updateCategory(
  id: string,
  fields: { name?: string; color?: string },
): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CategoryRow>(
    'SELECT * FROM categories WHERE id = ?',
    id,
  );
  if (!row) return;

  if (fields.color !== undefined && !row.is_custom) {
    throw new CategoryLockedError(
      'The built in categories keep their colours. Make your own to choose one.',
    );
  }

  const sets: string[] = [];
  const args: string[] = [];

  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) throw new Error('A category needs a name.');
    sets.push('name = ?');
    args.push(name);
  }
  if (fields.color !== undefined) {
    sets.push('color = ?');
    args.push(fields.color);
  }
  if (sets.length === 0) return;

  await db.runAsync(
    `UPDATE categories SET ${sets.join(', ')} WHERE id = ?`,
    ...args,
    id,
  );
}

/**
 * Deletes a category the user made. Knowts in it are not deleted: the schema
 * points at categories with ON DELETE SET NULL, so they simply become
 * uncategorized and keep everything else.
 */
export async function deleteCategory(id: string): Promise<void> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<CategoryRow>(
    'SELECT * FROM categories WHERE id = ?',
    id,
  );
  if (!row) return;
  if (!row.is_custom) {
    throw new CategoryLockedError('The built in categories cannot be deleted.');
  }
  await db.runAsync('DELETE FROM categories WHERE id = ?', id);
}

/** How many live knowts sit in a category, so deleting it can say so first. */
export async function countKnowtsInCategory(id: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM knowts WHERE category_id = ? AND archived = 0 AND is_draft = 0',
    id,
  );
  return row?.n ?? 0;
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
    'SELECT * FROM knowts WHERE archived = 0 AND is_draft = 0 ORDER BY name',
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
  /** What the knowt becomes once a tag is attached. */
  suggestedMode?: KnowtMode | null;
  /** 0 low, 1 normal, 2 high. Normal when unset. */
  priority?: number;
  /** Started but not finished. Excluded from every list but Drafts. */
  isDraft?: boolean;
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
          link_url, suggested_mode, priority, refire_minutes, snooze_minutes,
          archived, is_draft, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 5, 5, 0, ?, ?)`,
      id,
      input.tagUid ?? null,
      input.mode ?? 'open',
      input.name,
      input.icon ?? 'dot',
      input.categoryId ?? null,
      input.locationNote ?? null,
      input.notes ?? null,
      input.suggestedMode ?? null,
      input.priority ?? PRIORITY_NORMAL,
      input.isDraft ? 1 : 0,
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

/** Raised when a UID already belongs to a different knowt. */
export class TagInUseError extends Error {
  readonly knowtName: string;
  constructor(knowtName: string) {
    super(`That tag is already ${knowtName}.`);
    this.name = 'TagInUseError';
    this.knowtName = knowtName;
  }
}

/** Raised when a mode is requested that the knowt cannot satisfy. */
export class ModeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModeUnavailableError';
  }
}

/**
 * Spec section 5.6: promoting an Open knowt by attaching a tag is a headline
 * path, not an edge case. The knowt keeps its name, notes, schedules and
 * history, and only gains a UID and a stricter mode.
 */
export async function attachTag(
  knowtId: string,
  tagUid: string,
  mode?: Extract<KnowtMode, 'strict'>,
): Promise<void> {
  const owner = await findKnowtByTagUid(tagUid);
  if (owner && owner.id !== knowtId) {
    throw new TagInUseError(owner.name);
  }

  // Attaching a tag is a promotion, so the result is Scan Knowt. With only two
  // modes left there is nothing else it could become: Alarm Only is what a
  // knowt already is before it has a tag. The set's suggestion no longer needs
  // consulting, because it can only have said the same thing.
  const target: KnowtMode = mode ?? 'strict';

  const db = await getDatabase();
  await db.runAsync(
    'UPDATE knowts SET tag_uid = ?, mode = ? WHERE id = ?',
    tagUid,
    target,
    knowtId,
  );
}

/** Scan Knowt requires a tag. Alarm Only does not. */
export async function setMode(knowtId: string, mode: KnowtMode): Promise<void> {
  const knowt = await getKnowt(knowtId);
  if (!knowt) return;

  if (mode !== 'open' && !knowt.tag_uid) {
    throw new ModeUnavailableError(
      'Scan Knowt needs a tag. Add a tag to this knowt first.',
    );
  }

  const db = await getDatabase();
  await db.runAsync('UPDATE knowts SET mode = ? WHERE id = ?', mode, knowtId);
}

export async function findCategoryByKey(
  key: string,
): Promise<CategoryRow | null> {
  const db = await getDatabase();
  return db.getFirstAsync<CategoryRow>(
    'SELECT * FROM categories WHERE key = ?',
    key,
  );
}

/** Knowts can carry several labelled schedules; `createKnowt` seeds only one. */
export async function addSchedule(
  knowtId: string,
  schedule: {
    label?: string | null;
    time: string;
    repeatType: RepeatType;
    daysOfWeek?: number[];
    intervalDays?: number;
    intervalMonths?: number;
    supplyDays?: number;
    leadDays?: number;
    startDate?: string;
  },
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO schedules
       (id, knowt_id, label, time, repeat_type, days_of_week, interval_days,
        interval_months, supply_days, lead_days, start_date, enabled, alarmkit_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)`,
    newId(),
    knowtId,
    schedule.label ?? null,
    schedule.time,
    schedule.repeatType,
    schedule.daysOfWeek ? JSON.stringify(schedule.daysOfWeek) : null,
    schedule.intervalDays ?? null,
    schedule.intervalMonths ?? null,
    schedule.supplyDays ?? null,
    schedule.leadDays ?? null,
    schedule.startDate ?? null,
  );
}

/**
 * Edits the fields a person can change after the fact. Only the keys present
 * are written, so a screen that edits one thing cannot blank the rest by
 * omission.
 *
 * The name is part of what an armed alarm says, so a caller that renames a
 * knowt has to re-sync afterwards or the alarm keeps the old title.
 */
export async function updateKnowt(
  id: string,
  fields: {
    name?: string;
    categoryId?: string | null;
    locationNote?: string | null;
    notes?: string | null;
    /** 0 low, 1 normal, 2 high. */
    priority?: number;
  },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) throw new Error('A knowt needs a name.');
    sets.push('name = ?');
    args.push(name);
  }
  if (fields.categoryId !== undefined) {
    sets.push('category_id = ?');
    args.push(fields.categoryId);
  }
  if (fields.locationNote !== undefined) {
    sets.push('location_note = ?');
    args.push(fields.locationNote);
  }
  if (fields.notes !== undefined) {
    sets.push('notes = ?');
    args.push(fields.notes);
  }
  if (fields.priority !== undefined) {
    // Clamped rather than trusted: a value outside the three levels would sort
    // in a way nothing in the interface can explain.
    sets.push('priority = ?');
    args.push(Math.max(PRIORITY_LOW, Math.min(PRIORITY_HIGH, Math.round(fields.priority))));
  }

  if (sets.length === 0) return;

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE knowts SET ${sets.join(', ')} WHERE id = ?`,
    ...args,
    id,
  );
}

export async function getSchedule(id: string): Promise<ScheduleRow | null> {
  const db = await getDatabase();
  return db.getFirstAsync<ScheduleRow>(
    'SELECT * FROM schedules WHERE id = ?',
    id,
  );
}

/** Edits one schedule. Callers must re-sync: the armed alarm is now stale. */
export async function updateSchedule(
  id: string,
  fields: {
    label?: string | null;
    time?: string;
    repeatType?: RepeatType;
    daysOfWeek?: number[] | null;
    intervalDays?: number | null;
    intervalMonths?: number | null;
    startDate?: string | null;
    enabled?: boolean;
  },
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if (fields.label !== undefined) {
    sets.push('label = ?');
    args.push(fields.label);
  }
  if (fields.time !== undefined) {
    if (!TIME_PATTERN.test(fields.time)) {
      throw new Error(`Not a 24 hour time: ${fields.time}`);
    }
    sets.push('time = ?');
    args.push(fields.time);
  }
  if (fields.repeatType !== undefined) {
    sets.push('repeat_type = ?');
    args.push(fields.repeatType);
  }
  if (fields.daysOfWeek !== undefined) {
    sets.push('days_of_week = ?');
    args.push(fields.daysOfWeek ? JSON.stringify(fields.daysOfWeek) : null);
  }
  if (fields.intervalDays !== undefined) {
    sets.push('interval_days = ?');
    args.push(fields.intervalDays);
  }
  if (fields.intervalMonths !== undefined) {
    sets.push('interval_months = ?');
    args.push(fields.intervalMonths);
  }
  if (fields.startDate !== undefined) {
    sets.push('start_date = ?');
    args.push(fields.startDate);
  }
  if (fields.enabled !== undefined) {
    sets.push('enabled = ?');
    args.push(fields.enabled ? 1 : 0);
  }

  if (sets.length === 0) return;

  const db = await getDatabase();
  await db.runAsync(
    `UPDATE schedules SET ${sets.join(', ')} WHERE id = ?`,
    ...args,
    id,
  );
}

/**
 * Removes a schedule. Its history is kept: events reference schedules with
 * ON DELETE SET NULL, so past completions survive as unattached records rather
 * than vanishing along with the schedule.
 */
export async function deleteSchedule(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM schedules WHERE id = ?', id);
}

export async function updateNotes(id: string, notes: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE knowts SET notes = ? WHERE id = ?', notes, id);
}

/**
 * Knowts that were started and never finished.
 *
 * Backing out of the add flow used to throw the work away. A draft is a real
 * knowt row carrying `is_draft = 1`, which keeps every existing query honest:
 * it is excluded from the board, from Knowts, from category counts and from
 * alarm sync by the same clause that excludes archived ones, so a half-written
 * knowt can never ring.
 */
export async function listDrafts(): Promise<KnowtWithDetail[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<KnowtRow>(
    'SELECT * FROM knowts WHERE is_draft = 1 AND archived = 0 ORDER BY created_at DESC',
  );
  return attachDetail(rows);
}

export async function listArchived(): Promise<KnowtWithDetail[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<KnowtRow>(
    'SELECT * FROM knowts WHERE archived = 1 ORDER BY name',
  );
  return attachDetail(rows);
}

/** Promotes a draft into a real knowt. Nothing else about it changes. */
export async function finishDraft(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE knowts SET is_draft = 0 WHERE id = ?', id);
}

export async function restoreKnowt(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE knowts SET archived = 0 WHERE id = ?', id);
}

export async function deleteKnowt(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM knowts WHERE id = ?', id);
}

export async function archiveKnowt(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE knowts SET archived = 1 WHERE id = ?', id);
}

/**
 * Writes a history row. `scheduleId` is null for a spontaneous check-in with no
 * alarm pending. Spec section 3 treats that as a valid "I just did this".
 */
export async function logCompletion(args: {
  knowtId: string;
  scheduleId?: string | null;
  method: EventMethod;
  note?: string | null;
  /**
   * When it was actually done, if that is not now.
   *
   * An override is someone saying they did the thing but were not at the tag.
   * Recording that at the moment they pressed the button puts a lie in the log:
   * the pills were taken at eight and the phone was answered at eleven. The
   * history is only worth keeping if it can be corrected.
   */
  completedAt?: number;
}): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO events
       (id, knowt_id, schedule_id, fired_at, completed_at, method, note, snooze_count)
     VALUES (?, ?, ?, NULL, ?, ?, ?, 0)`,
    newId(),
    args.knowtId,
    args.scheduleId ?? null,
    args.completedAt ?? Date.now(),
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
