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
import {
  formatTime,
  isDueOn,
  minutesOf,
  nextOccurrence,
  weekdayOf,
  weeklyDaysFor,
} from '../db/scheduling';
import type { KnowtWithDetail, PendingAlarmRow, ScheduleRow } from '../db/types';
import { alarmScheduler } from './AlarmScheduler';
import { settled } from './settle';

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
    // Both of these are on the banner, so an alarm armed before either changed
    // is stale even though its time has not moved. The mode decides whether the
    // Stop button says "Scan to stop" or "Done", and the snooze length is both
    // the Snooze button's label and the countdown it starts.
    knowt.mode,
    String(knowt.snooze_minutes),
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
    // The days actually handed to the system, which are not always the days the
    // schedule stores: today comes out of the set when today is already done.
    // Leaving this out meant the reduced alarm looked identical to the full one
    // and sync left the old alarm in place, still set to ring.
    desired.mode === 'weekly' ? desired.weekdays.join(',') : '',
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

    // AlarmKit works out every firing of a recurrence itself, from a time and a
    // set of weekdays, with no start date and no exclusion list. Handing it a
    // week with today left out is the only way to make it skip today, and
    // skipping today is the only way a knowt checked off at seven does not
    // sound at nine.
    //
    // Nothing is stored to undo this. The day is left out only while the
    // conditions below hold, so the first sync after the time has passed asks
    // the same question, gets a different answer, and puts the day back.
    const armed = skipsToday(schedule, now, done)
      ? weekdays.filter((day) => day !== weekdayOf(now))
      : weekdays;

    if (armed.length > 0) {
      return { mode: 'weekly', hour, minute, weekdays: armed, nextAt };
    }
    // A schedule that rings on a single weekday has nothing left to recur on
    // once that day comes out. Falling through arms the next occurrence on its
    // own, and the recurrence comes back with the next sync.
  }

  return { mode: 'once', nextAt };
}

/**
 * Whether today has to come out of a recurrence.
 *
 * Only when today's occurrence is done and its time has not come yet. Once the
 * time passes there is nothing left to suppress: the recurrence's next firing
 * is tomorrow's either way, and taking the day out would cost next week's.
 */
function skipsToday(
  schedule: ScheduleRow,
  now: Date,
  done: ReadonlySet<string>,
): boolean {
  if (!isDueOn(schedule, now)) return false;
  if (!isOccurrenceDone(done, schedule.id, now)) return false;
  return minutesOf(schedule.time) > now.getHours() * 60 + now.getMinutes();
}

async function cancelRecord(row: PendingAlarmRow): Promise<void> {
  // Already fired, already canceled, gone, or wedged. The record goes either
  // way: one that cannot be canceled is not worth keeping. Bounded, because a
  // sync that never returns is a sync that holds up everything behind it.
  await settled(alarmScheduler.cancel(row.alarmkit_id));
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
          snoozeMinutes: knowt.snooze_minutes,
          timeLabel: formatTime(schedule.time),
        })
      : await alarmScheduler.scheduleAt({
          title: knowt.name,
          firesAt: desired.nextAt,
          payload: knowt.id,
          requiresScan: requiresScan(knowt.mode),
          snoozeMinutes: knowt.snooze_minutes,
          timeLabel: formatTime(schedule.time),
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
