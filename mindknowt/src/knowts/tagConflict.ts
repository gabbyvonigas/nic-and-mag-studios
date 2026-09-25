import { Alert } from 'react-native';

/**
 * What to do when a scanned tag already belongs to something.
 *
 * This is an Alert rather than a banner on purpose. The banner version fired
 * correctly and was never seen: it rendered at the top of a long scrolling
 * form while the scan button sat at the bottom, so the scan looked like it had
 * silently succeeded and the conflict only surfaced much later somewhere else.
 * A conflict has to interrupt at the moment of the scan.
 *
 * Resolves true when the person wants the tag moved here.
 */
export function askToReassign(ownerName: string, toName: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'That tag is already in use',
      `It belongs to ${ownerName}. Tags can be reused, so you can move it to ${toName}. ${ownerName} becomes Alarm Only and stops needing a scan.`,
      [
        { text: 'Scan a different tag', style: 'cancel', onPress: () => resolve(false) },
        { text: `Move it to ${toName}`, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Confirms freeing a tag, which costs the knowt its Scan Knowt mode. */
export function askToUnassign(knowtName: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Free this tag?',
      `${knowtName} becomes Alarm Only and can be stopped without scanning. The tag itself can then be used for something else.`,
      [
        { text: 'Keep it', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Free the tag', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
