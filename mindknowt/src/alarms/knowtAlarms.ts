import {
  clearAllPendingAlarms,
  listPendingForKnowt,
  prunePastAlarms,
  recordPendingAlarm,
  takePendingForKnowt,
} from '../db/pendingAlarms';
import type { PendingAlarmKind, PendingAlarmRow } from '../db/types';
import { alarmScheduler } from './AlarmScheduler';
import type { ScheduledAlarm } from './types';

/**
 * Schedules an alarm for a knowt and records it as pending. The knowt id
 * travels as the dismiss payload, which is what lets the Ringing screen know
 * which knowt reopened the app. AlarmKit hands back a payload, never a URL.
 *
 * Arming replaces any alarm already pending for the same knowt and schedule.
 * Without that, every press of the test ring button armed another alarm that
 * nothing could see or cancel, and they fired on top of each other.
 */
export async function armKnowtAlarm(args: {
  knowtId: string;
  scheduleId?: string | null;
  title: string;
  firesAt: Date;
  kind: PendingAlarmKind;
}): Promise<ScheduledAlarm> {
  await cancelKnowtAlarms(args.knowtId, { scheduleId: args.scheduleId ?? null });

  const alarm = await alarmScheduler.scheduleAt({
    title: args.title,
    firesAt: args.firesAt,
    payload: args.knowtId,
  });

  // Recording must not be able to lose the alarm itself, which is already
  // armed at this point. A failure here costs visibility, not the reminder.
  try {
    await recordPendingAlarm({
      knowtId: args.knowtId,
      scheduleId: args.scheduleId ?? null,
      alarmkitId: alarm.id,
      firesAt: alarm.firesAt,
      kind: args.kind,
    });
  } catch {
    // Left unrecorded on purpose; the alarm still rings.
  }

  return alarm;
}

/** Re-arms after an abandoned ringing session. Spec section 2, step 5. */
export async function rearmKnowtAlarm(args: {
  knowtId: string;
  title: string;
  minutes: number;
  kind: Extract<PendingAlarmKind, 'refire' | 'snooze'>;
}): Promise<ScheduledAlarm> {
  return armKnowtAlarm({
    knowtId: args.knowtId,
    scheduleId: null,
    title: args.title,
    firesAt: new Date(Date.now() + args.minutes * 60_000),
    kind: args.kind,
  });
}

/**
 * Cancels pending alarms for a knowt with AlarmKit and forgets them.
 *
 * Both parts of the filter matter. Omitting everything cancels every alarm the
 * knowt has, including its recurring one, so a caller that only wants to clear
 * a fired one-shot must say so.
 */
export async function cancelKnowtAlarms(
  knowtId: string,
  filter: { scheduleId?: string | null; kinds?: PendingAlarmKind[] } = {},
): Promise<number> {
  const rows = await takePendingForKnowt(knowtId, filter);
  let cancelled = 0;
  for (const row of rows) {
    try {
      await alarmScheduler.cancel(row.alarmkit_id);
      cancelled += 1;
    } catch {
      // Already fired, already cancelled, or gone. The row is removed either
      // way, because a pending record that cannot be cancelled is just noise.
    }
  }
  return cancelled;
}

/** What is armed for a knowt right now, soonest first. */
export async function pendingForKnowt(knowtId: string): Promise<PendingAlarmRow[]> {
  return listPendingForKnowt(knowtId);
}

/** Housekeeping at launch: an alarm whose time has passed is not pending. */
export async function pruneFiredAlarms(): Promise<number> {
  return prunePastAlarms();
}

/**
 * Cancels every alarm this app has with AlarmKit, whether or not the app knows
 * why it exists, and forgets all pending records.
 *
 * This is a recovery tool. Alarms armed before the pending table existed are
 * invisible to `cancelKnowtAlarms`, so they can keep ringing with nothing in
 * the app able to point at them. AlarmKit can still list its own ids, which is
 * the only handle left on them.
 *
 * `clearAllAlarms` in the native module is not used here: its sibling
 * `removeAlarm` documents that it drops the App Group record without
 * cancelling the alarm, and a cancel that does not cancel is worse than none.
 */
export async function cancelAllAlarms(): Promise<number> {
  const ids = await alarmScheduler.listScheduled();
  let cancelled = 0;
  for (const id of ids) {
    try {
      await alarmScheduler.cancel(id);
      cancelled += 1;
    } catch {
      // Already gone. Keep going: one stuck id must not strand the rest.
    }
  }
  try {
    await clearAllPendingAlarms();
  } catch {
    // The alarms are cancelled, which is the part that matters.
  }
  return cancelled;
}

/**
 * The kinds that fire once and are then finished. A completion clears these
 * and leaves a recurring alarm in place, because tomorrow's 8:00 am is not
 * cancelled by doing today's.
 */
export const ONE_SHOT_KINDS: PendingAlarmKind[] = ['refire', 'snooze', 'test'];

/** Clears anything armed for a knowt that only had this one firing to do. */
export async function cancelKnowtOneShots(knowtId: string): Promise<number> {
  return cancelKnowtAlarms(knowtId, { kinds: ONE_SHOT_KINDS });
}
