import {
  deletePendingAlarm,
  listScheduledAlarmRecords,
  recordPendingAlarm,
  touchPendingAlarm,
} from '../db/pendingAlarms';
import { completionWindowStart, listCompletionsSince } from '../db/events';
import { listKnowts } from '../db/knowts';
import { requiresScan } from '../knowts/modes';
import { completedOccurrences, isOccurrenceDone } from '../knowts/completions';
import { nextOccurrence, weeklyDaysFor } from '../db/scheduling';
import type { KnowtWithDetail, PendingAlarmRow, ScheduleRow } from '../db/types';
import { alarmScheduler } from './AlarmScheduler';

/**
 * Keeps AlarmKit in step with the schedules in the database.
 *
 * Until this existed, a knowt set for 8:00 am daily never rang: schedules were
 * stored and displayed, and only the manual test button ever armed anything.
 *
 * Two shapes of alarm come out of it:
 *
 *   - A weekly repeat (daily, weekdays, weekends, or named days) is handed to
 *     the system as one recurring alarm. It keeps ringing whether or not the
 *     app is ever opened again, which matters because the app has no
 *     background execution to re-arm anything with.
 *   - Everything else (an interval, a supply countdown, a one-off) is armed one
 *     occurrence at a time and re-armed by the next sync.
 *
 * Sync is the sole owner of `kind = 'scheduled'` records. It runs at launch and
 * after anything that changes a schedule, and is safe to run repeatedly: an
 * alarm whose signature still matches is left alone rather than torn down and
 * rebuilt, so a launch does not churn every alarm on the phone.
 *
 * It also runs after a completion, and reads what has been completed before
 * deciding what to arm. An occurrence that has been done is not armed again:
 * checking off the 9:00 am knowt at seven used to leave its own alarm standing,
 * and re-arming simply chose the same 9:00 am over again, because the time had
 * not passed yet.
 */

export type SyncResult = {
  /** Alarms newly armed. */
  armed: number;
  /** Alarms replaced because the schedule or knowt changed. */
  replaced: number;
  /** Alarms canceled because they should no longer exist. */
  cleared: number;
  /** Schedules that could not be armed. The rest still are. */
  failed: number;
};

const EMPTY: SyncResult = { armed: 0, replaced: 0, cleared: 0, failed: 0 };

type DesiredAlarm =
  | { mode: 'weekly'; hour: number; minute: number; weekdays: number[]; nextAt: Date }
  | { mode: 'once'; nextAt: Date };

function keyOf(knowtId: string, scheduleId: string): string {
  return `${knowtId}:${scheduleId}`;
}

/**
 * Everything that would make an armed alarm wrong if it changed: when it
 * rings, how often, and what it says. Compared as a string so an unchanged
 * schedule can be recognized without re-deriving the alarm.
 */
export function signatureOf(
  knowt: KnowtWithDetail,
  schedule: ScheduleRow,
  desired: DesiredAlarm,
): string {
  const parts = [
    knowt.name,
    schedule.time,
    schedule.repeat_type,
    schedule.days_of_week ?? '',
    schedule.interval_days ?? '',
    schedule.supply_days ?? '',
    schedule.lead_days ?? '',
    schedule.start_date ?? '',
    desired.mode,
    // A one-off alarm is only correct for the occurrence it was armed for, so
    // its time is part of what makes it stale. A weekly alarm is not: its next
    // firing moves every week without the alarm itself changing.
    desired.mode === 'once' ? String(desired.nextAt.getTime()) : '',
  ];
  return parts.join('|');
}

/**
 * What this schedule should have armed right now, or null for nothing.
 *
 * Exported for the same reason `signatureOf` is: whether a completed
 * occurrence gets armed again is decided here, and it is the difference
 * between an alarm that rings for something already done and one that does
 * not.
 */
export function desiredFor(
  schedule: ScheduleRow,
  now: Date,
  done: ReadonlySet<string>,
): DesiredAlarm | null {
  if (!schedule.enabled) return null;

  // Only a completion that named this schedule counts. A check-in with no
  // schedule is ambiguous about which occurrence it covers, and guessing wrong
  // here means an alarm that never rings, which is worse than one that rings
  // for something already done.
  const nextAt = nextOccurrence(schedule, now, (day) =>
    isOccurrenceDone(done, schedule.id, day),
  );
  if (!nextAt) return null;

  const weekdays = weeklyDaysFor(schedule);
  if (weekdays) {
    const [hour, minute] = schedule.time.split(':').map(Number);
    if (hour === undefined || minute === undefined) return null;
    return { mode: 'weekly', hour, minute, weekdays, nextAt };
  }

  return { mode: 'once', nextAt };
}

async function cancelRecord(row: PendingAlarmRow): Promise<void> {
  try {
    await alarmScheduler.cancel(row.alarmkit_id);
  } catch {
    // Already fired, already canceled, or gone. The record goes either way:
    // one that cannot be canceled is not worth keeping.
  }
  await deletePendingAlarm(row.id);
}

async function arm(
  knowt: KnowtWithDetail,
  schedule: ScheduleRow,
  desired: DesiredAlarm,
): Promise<void> {
  const alarm =
    desired.mode === 'weekly'
      ? await alarmScheduler.scheduleWeekly({
          title: knowt.name,
          hour: desired.hour,
          minute: desired.minute,
          weekdays: desired.weekdays,
          nextFiresAt: desired.nextAt,
          payload: knowt.id,
          requiresScan: requiresScan(knowt.mode),
        })
      : await alarmScheduler.scheduleAt({
          title: knowt.name,
          firesAt: desired.nextAt,
          payload: knowt.id,
          requiresScan: requiresScan(knowt.mode),
        });

  await recordPendingAlarm({
    knowtId: knowt.id,
    scheduleId: schedule.id,
    alarmkitId: alarm.id,
    firesAt: alarm.firesAt,
    kind: 'scheduled',
    signature: signatureOf(knowt, schedule, desired),
  });
}

export async function syncScheduledAlarms(now = new Date()): Promise<SyncResult> {
  if (!(await alarmScheduler.isAvailable())) return EMPTY;

  const result: SyncResult = { ...EMPTY };

  const knowts = await listKnowts();
  const records = await listScheduledAlarmRecords();
  const done = completedOccurrences(
    await listCompletionsSince(completionWindowStart(now)),
  );

  const byKey = new Map<string, PendingAlarmRow>();
  for (const row of records) {
    if (!row.schedule_id) continue;
    const key = keyOf(row.knowt_id, row.schedule_id);
    const existing = byKey.get(key);
    if (existing) {
      // Two records for one schedule means a previous run was interrupted.
      // Keep one and clear the other rather than leaving a duplicate ringing.
      await cancelRecord(row);
      result.cleared += 1;
      continue;
    }
    byKey.set(key, row);
  }

  for (const knowt of knowts) {
    for (const schedule of knowt.schedules) {
      const key = keyOf(knowt.id, schedule.id);
      const existing = byKey.get(key);
      byKey.delete(key);

      const desired = desiredFor(schedule, now, done);

      if (!desired) {
        if (existing) {
          await cancelRecord(existing);
          result.cleared += 1;
        }
        continue;
      }

      const signature = signatureOf(knowt, schedule, desired);
      if (existing && existing.signature === signature) {
        // The alarm is right, but a recurring one's recorded time is not: its
        // signature leaves the next firing out, so the row was stamped once at
        // arm time and then sat in the past forever, invisible to every query
        // that asks what is still ahead. Correcting the record touches nothing
        // on the phone.
        if (existing.fires_at !== desired.nextAt.getTime()) {
          await touchPendingAlarm(existing.id, desired.nextAt.getTime());
        }
        continue;
      }

      try {
        if (existing) {
          await cancelRecord(existing);
        }
        await arm(knowt, schedule, desired);
        if (existing) result.replaced += 1;
        else result.armed += 1;
      } catch {
        // One schedule failing must not stop the rest being armed. The record
        // is already gone, so the next sync tries again rather than believing
        // an alarm exists that does not.
        result.failed += 1;
      }
    }
  }

  // Whatever is left belongs to a knowt that was archived or deleted, or a
  // schedule that no longer exists.
  for (const row of byKey.values()) {
    await cancelRecord(row);
    result.cleared += 1;
  }

  return result;
}

/**
 * Fire and forget version for call sites that changed a schedule and should
 * not fail because of it. Adding a knowt has already succeeded by the time
 * this runs; a sync failure costs the next alarm, which the following launch
 * will arm, and must not surface as the save having failed.
 */
export async function resyncAlarmsQuietly(): Promise<void> {
  try {
    await syncScheduledAlarms();
  } catch {
    // Deliberately swallowed. Launch runs sync again.
  }
}
