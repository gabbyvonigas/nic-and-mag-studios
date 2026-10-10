/**
 * Logging a Scan Knowt by scanning its tag.
 *
 * Its own module because it is started from two places, the Knowt's detail
 * screen and its row on the Knowts list, so a tag on the fridge can be scanned
 * without opening anything. One path means the completion is written the same
 * way from both.
 *
 * **This is not the ringing screen's job.** The scan used to be done by
 * opening `Ringing` for the Knowt, which is the screen for an alarm that is
 * actually going off: it says RINGING, it pulses, and it is a full screen modal
 * with no way out but a handler. A Scan Knowt never rings, so that screen had
 * to be given a whole second personality to not lie, and it still appeared
 * where a person expected the Knowt's own screen. The scan belongs on the
 * screens that already exist.
 *
 * Never throws. The caller gets a message to show or nothing at all, the same
 * contract every other scan in the app has.
 */
import { completeOccurrence } from './completeOccurrence';
import { nfcFailureMessage, nfcReader } from '../nfc';
import { describeError, settled } from '../alarms';

export type ScanOutcome =
  /** The tag was read and the completion is written. */
  | { kind: 'done' }
  /** Nothing happened and nothing needs saying: the sheet was dismissed. */
  | { kind: 'canceled' }
  | { kind: 'failed'; message: string };

export async function scanKnowtTag(knowt: {
  id: string;
  name: string;
  tag_uid: string | null;
}): Promise<ScanOutcome> {
  if (!knowt.tag_uid) {
    return {
      kind: 'failed',
      message:
        'This Knowt has no tag yet, so there is nothing to scan. Attach one first.',
    };
  }

  try {
    // The expected UID goes down into the reader so a mismatch is rejected
    // inside the platform's own sheet, while the phone is still against the
    // wrong tag. Never accept any-tag-will-do.
    await nfcReader.scanTag({
      prompt: `Hold your iPhone to the ${knowt.name} tag.`,
      expectRawUid: knowt.tag_uid,
      expectLabel: knowt.name,
    });
  } catch (err) {
    const failure = nfcFailureMessage(err);
    return failure ? { kind: 'failed', message: failure.text } : { kind: 'canceled' };
  }

  /**
   * No schedule id, because there is no occurrence to name. That is also what
   * makes the daily reset work: the completion lands with a null schedule and
   * is read back from the day's own window.
   *
   * `completeOccurrence` rather than `logCompletion`, so a leftover test alarm
   * is stood down and sync runs, which is the rule for every completion path.
   */
  const written = await settled(
    completeOccurrence({ knowtId: knowt.id, scheduleId: null, method: 'scan' }),
  );
  if (!written.ok) {
    return {
      kind: 'failed',
      message: `The tag was read but it could not be recorded. ${describeError(written.error)}`,
    };
  }
  return { kind: 'done' };
}
