import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * AlarmKit does not hand the app a URL. It relaunches the process and leaves a
 * payload behind, which `consumeLaunch()` reads. Routing from that payload is
 * therefore imperative rather than link-driven, so it needs a ref that works
 * outside the React tree.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Opens the ringing screen, and guarantees it is the only thing above the tabs.
 *
 * `navigate` put it on top of whatever was already there, which is how screens
 * ended up drawn over each other: an alarm can fire while a modal is open, or
 * while a second alarm's screen is already showing, and a full screen modal
 * presented over another modal shows both. Resetting the stack means the
 * transition from the notification is always tabs to ringing, once.
 *
 * Re-entering for the same knowt is ignored, so a foreground transition while
 * the screen is already up does not rebuild it underneath the person.
 */
export function navigateToRinging(knowtId: string): boolean {
  if (!navigationRef.isReady()) return false;

  const current = navigationRef.getCurrentRoute();
  if (
    current?.name === 'Ringing' &&
    (current.params as { knowtId?: string } | undefined)?.knowtId === knowtId
  ) {
    return true;
  }

  navigationRef.reset({
    index: 1,
    routes: [
      { name: 'Tabs' },
      { name: 'Ringing', params: { knowtId } },
    ],
  });
  return true;
}
