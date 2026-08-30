import { getAppMeta, getDatabase, setAppMeta } from './database';
import { newId } from './ids';
import { listKnowts } from './knowts';
import { isDueOn, minutesOf, toISODate } from './scheduling';
import type { EventMethod, EventRow } from './types';

const MISSED_SWEEP_KEY = 'last_missed_sweep';

/** Bound on how far back a sweep will look, so a long gap cannot stall launch. */
const MAX_LOOKBACK_DAYS = 14;

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Opens a ringing session. The event exists from the moment the alarm fires,
 * not from the moment it is completed, so an alarm that is snoozed or
 * abandoned still leaves a record.
 */
export async function startRinging(
  knowtId: string,
  scheduleId: string | null = null,
): Promise<string> {
  const db = await getDatabase();
  const id = newId();
  await db.runAsync(
    `INSERT INTO events
       (id, knowt_id, schedule_id, fired_at, completed_at, method, note, snooze_count)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL, 0)`,
    id,
    knowtId,
    scheduleId,
    Date.now(),
  );
  return id;
}

export async function completeRinging(
  eventId: string,
  method: EventMethod,
  note?: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE events
        SET completed_at = ?, method = ?, note = COALESCE(?, note)
      WHERE id = ?`,
    Date.now(),
    method,
    note ?? null,
    eventId,
  );
}

export async function addSnooze(eventId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'UPDATE events SET snooze_count = snooze_count + 1 WHERE id = ?',
    eventId,
  );
}

export async function setEventNote(
  eventId: string,
  note: string | null,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE events SET note = ? WHERE id = ?', note, eventId);
}

export async function getEvent(eventId: string): Promise<EventRow | null> {
  const db = await getDatabase();
  return db.getFirstAsync<EventRow>('SELECT * FROM events WHERE id = ?', eventId);
}

/**
 * Spec section 6 wants `missed` written at end of day. The app has no
 * background execution, so instead this runs at launch and back-fills any past
 * due instance that was never completed. The data is correct; only the moment
 * it is written differs. `last_missed_sweep` keeps it from writing duplicates.
 */
export async function sweepMissed(now = new Date()): Promise<number> {
  const db = await getDatabase();
  const knowts = await listKnowts();
  if (knowts.length === 0) return 0;

  const today = startOfDay(now);
  const earliest = addDays(today, -MAX_LOOKBACK_DAYS);

  const lastSwept = await getAppMeta(MISSED_SWEEP_KEY);
  let cursor = earliest;
  if (lastSwept) {
    const [y, m, d] = lastSwept.split('-').map(Number);
    const resume = addDays(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1), 1);
    if (resume > cursor) cursor = resume;
  }

  let written = 0;

  for (let day = cursor; day < today; day = addDays(day, 1)) {
    const dayStart = day.getTime();
    const dayEnd = dayStart + DAY_MS;

    const existing = await db.getAllAsync<EventRow>(
      `SELECT * FROM events
        WHERE COALESCE(completed_at, fired_at) >= ?
          AND COALESCE(completed_at, fired_at) < ?`,
      dayStart,
      dayEnd,
    );

    for (const knowt of knowts) {
      for (const schedule of knowt.schedules) {
        if (!isDueOn(schedule, day)) continue;
        if (existing.some((e) => e.schedule_id === schedule.id)) continue;

        await db.runAsync(
          `INSERT INTO events
             (id, knowt_id, schedule_id, fired_at, completed_at, method, note, snooze_count)
           VALUES (?, ?, ?, ?, NULL, 'missed', NULL, 0)`,
          newId(),
          knowt.id,
          schedule.id,
          dayStart + minutesOf(schedule.time) * 60_000,
        );
        written += 1;
      }
    }
  }

  if (today > cursor) {
    await setAppMeta(MISSED_SWEEP_KEY, toISODate(addDays(today, -1)));
  }

  return written;
}
