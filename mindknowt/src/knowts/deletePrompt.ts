import { Alert } from 'react-native';

/**
 * Confirms a delete, and says plainly that it is not the end of the line.
 *
 * Delete and Archive are different promises. Archive pauses something and
 * keeps it whole. Delete is for something you are finished with, and it still
 * lands somewhere you can reach, so the wording has to say that up front
 * rather than implying the work is gone.
 */
export function askToDelete(knowtName: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Delete ${knowtName}?`,
      'It moves to Deleted, where you can put it back or remove it for good.',
      [
        { text: 'Keep it', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Shown after a delete that freed a tag, in words about the tag, not the row. */
export function sayTagFreed(): void {
  Alert.alert(
    'Tag freed',
    'It is ready to use on another knowt. Scan it while setting one up.',
    [{ text: 'Got it' }],
  );
}

/** The one that really is permanent, so it says so. */
export function askToPurge(knowtName: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      `Remove ${knowtName} for good?`,
      'This cannot be undone. Its history goes with it.',
      [
        { text: 'Keep it', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Remove for good',
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
