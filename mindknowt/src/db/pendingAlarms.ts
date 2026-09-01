import { getDatabase } from './database';
import { newId } from './ids';
import type { PendingAlarmKind, PendingAlarmRow } from './types';

/**
 * The app's record of alarms handed to AlarmKit that have not fired yet.
 *
 * AlarmKit cannot be asked "what is armed for this knowt", so without this
 * table the app is blind: nothing can show that a knowt is snoozed, and nothing
 * can cancel an alarm that is no longer wanted. That blindness is what let
 * repeated test rings stack up and fire on top of each other.
 *
 * Rows are removed when the alarm is cancelled, and pruned once its time has
 * passed, since a fired alarm is no longer pending. The record is deliberately
 * best-effort: it can drift if AlarmKit drops an alarm on its own, so nothing
 * here is treated as proof that an alarm will ring.
 */
export async function recordPendingAlarm(args: {
  knowtId: string;
  scheduleId?: string | null;
  alarmkitId: string;
  firesAt: number;
  kind: PendingAlarmKind;
}): Promise<string> {
  const db = await getDatabase();
  const id = newId();
  await db.runAsync(
    `INSERT INTO pending_alarms
       (id, knowt_id, schedule_id, alarmkit_id, fires_at, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    args.knowtId,
    args.scheduleId ?? null,
    args.alarmkitId,
    args.firesAt,
    args.kind,
    Date.now(),
  );
  return id;
}

/** Drops rows whose time has passed. They rang, so they are no longer pending. */
export async function prunePastAlarms(now = Date.now()): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'DELETE FROM pending_alarms WHERE fires_at <= ?',
    now,
  );
  return result.changes;
}

/** Every alarm still in the future, soonest first. */
export async function listPendingAlarms(
  now = Date.now(),
): Promise<PendingAlarmRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<PendingAlarmRow>(
    'SELECT * FROM pending_alarms WHERE fires_at > ? ORDER BY fires_at',
    now,
  );
}

export async function listPendingForKnowt(
  knowtId: string,
  now = Date.now(),
): Promise<PendingAlarmRow[]> {
  const db = await getDatabase();
  return db.getAllAsync<PendingAlarmRow>(
    'SELECT * FROM pending_alarms WHERE knowt_id = ? AND fires_at > ? ORDER BY fires_at',
    knowtId,
    now,
  );
}

/**
 * Removes the rows for a knowt and hands them back so the caller can cancel
 * each one with AlarmKit. Deleting and returning in one step keeps the table
 * from listing an alarm the caller is about to tear down.
 *
 * `scheduleId` is matched exactly, `undefined` meaning every schedule. Passing
 * `null` matches only the alarms that belong to no schedule, which is what a
 * test ring, a re-fire and a snooze all are.
 */
export async function takePendingForKnowt(
  knowtId: string,
  scheduleId?: string | null,
): Promise<PendingAlarmRow[]> {
  const db = await getDatabase();

  const where =
    scheduleId === undefined
      ? 'knowt_id = ?'
      : scheduleId === null
        ? 'knowt_id = ? AND schedule_id IS NULL'
        : 'knowt_id = ? AND schedule_id = ?';
  const args =
    scheduleId === undefined || scheduleId === null
      ? [knowtId]
      : [knowtId, scheduleId];

  const rows = await db.getAllAsync<PendingAlarmRow>(
    `SELECT * FROM pending_alarms WHERE ${where}`,
    ...args,
  );
  if (rows.length > 0) {
    await db.runAsync(`DELETE FROM pending_alarms WHERE ${where}`, ...args);
  }
  return rows;
}

/** Forgets every pending record. Pairs with a cancel-everything recovery. */
export async function clearAllPendingAlarms(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM pending_alarms');
}
