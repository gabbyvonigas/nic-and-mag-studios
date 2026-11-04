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
 *
 * The schedule is resolved before navigating, because the payload does not
 * carry one. Without it the screen could not say which occurrence was ringing,
 * and the scan that stopped the alarm was recorded against no schedule, so
 * Daily went on showing the knowt as not done.
 */
export function navigateToRinging(
  knowtId: string,
  scheduleId: string | null = null,
): boolean {
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
      { name: 'Ringing', params: { knowtId, scheduleId: scheduleId ?? undefined } },
    ],
  });
  return true;
}

/**
 * Closes the ringing screen and lands on Daily.
 *
 * A reset rather than a `navigate` back to `Tabs`, and for the same reason
 * `navigateToRinging` is one: the way out must not depend on what is
 * underneath. The screen is opened with a reset to `[Tabs, Ringing]`, so
 * leaving is a reset to `[Tabs]` with Daily selected, and anything that ever
 * reaches the screen another way still lands somewhere known instead of on
 * whatever happened to be below it.
 *
 * Returns false only when the navigator is not mounted, which is the caller's
 * cue to fall back to its own navigation object.
 */
export function leaveRinging(): boolean {
  if (!navigationRef.isReady()) return false;
  navigationRef.reset({
    index: 0,
    routes: [{ name: 'Tabs', params: { screen: 'Daily' } }],
  });
  return true;
}
