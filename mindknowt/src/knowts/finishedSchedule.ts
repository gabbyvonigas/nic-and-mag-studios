/**
 * A schedule with nothing ahead of it, and the two ways back.
 *
 * A row reading "Once, finished" was a dead end in practice. Tapping it on the
 * detail screen went to the Knowt's Edit screen rather than to the schedule, so
 * the editor was two taps away and neither tap said so, and even once the time
 * was changed the alarm stayed down: a completion marked its whole calendar
 * day done, so a new time later the same evening armed nothing and the row went
 * on reading "finished". The second half of that is fixed in
 * `completions.ts`; this is the first half.
 *
 * Two answers, because the person means one of two things. Either the schedule
 * was right and the day is behind them, which is Reschedule, or the completion
 * itself was wrong, which is Mark not done. Rescheduling leaves the Log alone:
 * the thing was done, and moving the next firing does not unmake that.
 *
 * Its own `.ts` module, like `deletePrompt.ts` and `tagConflict.ts`, so both
 * screens ask the same question in the same words and the words can be
 * asserted off-device.
 */
import { Alert } from 'react-native';

export type FinishedChoice = 'reschedule' | 'undo' | 'cancel';

/**
 * Asks what to do with a finished schedule.
 *
 * Three buttons, because a sheet a person cannot back out of is worse than one
 * more button. Cancel is the `cancel` style and also the dismiss, so a tap
 * outside changes nothing either.
 */
export function askFinishedSchedule(): Promise<FinishedChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      'This one is finished',
      'Change when it rings next, or put the completion back if it was not done.',
      [
        { text: 'Reschedule', onPress: () => resolve('reschedule') },
        { text: 'Mark not done', onPress: () => resolve('undo') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
}
