/**
 * What a firing means, asked of the database.
 *
 * Two questions, because AlarmKit hands the app a knowt id and nothing else:
 * whether the firing still needs answering, and which occurrence it is for.
 * Both rules live in `knowts/completions.ts` and are pure. This is only the
 * part that has to read rows, kept separate so the rules can be asserted
 * without a device.
 */
import { listOneShotsForKnowt } from '../db/pendingAlarms';
import { completionWindowStart, listCompletionsSince } from '../db/events';
import { getKnowt } from '../db/knowts';
import { firingOccurrence, shouldPresentRinging } from '../knowts/completions';

export type RingingTarget = {
  /** Whether to open the Ringing screen at all. */
  present: boolean;
  /**
   * The occurrence being answered, where one can be named. Null is a real
   * answer: a test ring on a knowt with nothing due is not any occurrence.
   */
  scheduleId: string | null;
};

/**
 * What to do about an alarm that just fired for this knowt.
 *
 * A weekly repeat is one recurring AlarmKit alarm with no start date, so a
 * single occurrence cannot be skipped and today's 9:00 am rings whether or not
 * it was checked off at seven. The app cannot stop the sound. It can stop
 * demanding a tag scan for something already done.
 *
 * Everything it cannot answer, it answers yes to. A ring that should have been
 * suppressed is a nuisance; one that should have been shown and was not is the
 * app failing at its only job.
 */
export async function resolveRinging(
  knowtId: string,
  now = new Date(),
): Promise<RingingTarget> {
  try {
    const knowt = await getKnowt(knowtId);
    if (!knowt) return { present: true, scheduleId: null };

    const [completions, oneShots] = await Promise.all([
      listCompletionsSince(completionWindowStart(now)),
      listOneShotsForKnowt(knowtId),
    ]);
    const events = completions.filter((event) => event.knowt_id === knowtId);

    const present = shouldPresentRinging({
      schedules: knowt.schedules,
      events,
      oneShots,
      now,
    });
    if (!present) return { present: false, scheduleId: null };

    const firing = firingOccurrence({ schedules: knowt.schedules, events, now });
    return { present: true, scheduleId: firing?.id ?? null };
  } catch {
    return { present: true, scheduleId: null };
  }
}
