/**
 * Marking something done, including the alarm armed for it.
 *
 * `logCompletion` writes a history row and nothing else. Daily's tap and
 * Detail's check-in both called it directly, so a knowt checked off in the
 * morning kept every alarm it had: the reported bug was a 9:00 am alarm ringing
 * for an item already checked, and a snooze taken earlier would have gone off
 * too. The ringing screen has always done this part; these two paths never did.
 */
import { cancelKnowtOneShots } from '../alarms/knowtAlarms';
import { resyncAlarmsQuietly } from '../alarms/scheduleSync';
import { logCompletion } from '../db/knowts';
import type { EventMethod } from '../db/types';

export async function completeOccurrence(args: {
  knowtId: string;
  /**
   * The occurrence this completes. Naming it is what lets the alarm armed for
   * it be stood down, so a caller that knows the schedule must pass it.
   */
  scheduleId?: string | null;
  method: EventMethod;
  note?: string | null;
  completedAt?: number;
}): Promise<void> {
  await logCompletion(args);

  // A re-fire, a snooze or a leftover test ring for this knowt has nothing left
  // to say. The recurring alarm is deliberately untouched: canceling it would
  // mean doing today's 8:00 am stopped tomorrow's.
  try {
    await cancelKnowtOneShots(args.knowtId);
  } catch {
    // The completion is recorded, which is the part that must not be lost.
  }

  // Sync reads completions, so this stands down the alarm armed for the
  // occurrence just finished and arms the one after it.
  await resyncAlarmsQuietly();
}
