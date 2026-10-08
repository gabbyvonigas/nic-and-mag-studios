/**
 * Takes in snoozes the app did not perform.
 *
 * AlarmKit handles a Lock Screen snooze itself, through
 * `secondaryButtonBehavior: .countdown`, and the app is never launched. The
 * patched module writes the snooze into App Group storage when its intent runs;
 * this reads those records, records them the way an in-app snooze is recorded,
 * and clears them. Without it, Daily had no way of knowing a Knowt had been
 * put off from the Lock Screen, which is exactly what was reported.
 */
import { alarmScheduler } from './AlarmScheduler';
import {
  findPendingByAlarmkitId,
  recordPendingAlarm,
} from '../db/pendingAlarms';
import { getKnowt } from '../db/knowts';

/** How many were newly recorded. */
export async function importExternalSnoozes(now = Date.now()): Promise<number> {
  let snoozes: Awaited<ReturnType<typeof alarmScheduler.listSnoozes>>;
  try {
    snoozes = await alarmScheduler.listSnoozes();
  } catch {
    // An older build without the patch. Nothing to take in.
    return 0;
  }

  let taken = 0;

  for (const snooze of snoozes) {
    // A snooze whose time has already passed is not a snooze any more. Clear it
    // rather than recording something that is already over.
    if (snooze.endsAt <= now) {
      await alarmScheduler.clearSnooze(snooze.alarmkitId);
      continue;
    }

    // The payload is the Knowt id. Without one there is nothing to attach it to.
    const knowtId = snooze.payload;
    if (!knowtId) {
      await alarmScheduler.clearSnooze(snooze.alarmkitId);
      continue;
    }

    // A Knowt deleted since the alarm was set leaves a record pointing nowhere.
    const knowt = await getKnowt(knowtId);
    if (!knowt) {
      await alarmScheduler.clearSnooze(snooze.alarmkitId);
      continue;
    }

    // Recording is keyed on the AlarmKit id, so an import that runs twice
    // because a clear failed does not produce two snoozes for one press.
    const existing = await findPendingByAlarmkitId(snooze.alarmkitId);
    if (!existing) {
      await recordPendingAlarm({
        knowtId,
        scheduleId: null,
        alarmkitId: snooze.alarmkitId,
        firesAt: snooze.endsAt,
        kind: 'snooze',
      });
      taken += 1;
    }

    await alarmScheduler.clearSnooze(snooze.alarmkitId);
  }

  return taken;
}

/** Fire and forget, for launch. A failure here must not stop the app starting. */
export async function importSnoozesQuietly(): Promise<void> {
  try {
    await importExternalSnoozes();
  } catch {
    // Deliberately swallowed.
  }
}
