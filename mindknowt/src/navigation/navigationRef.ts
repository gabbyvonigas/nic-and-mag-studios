import { createNavigationContainerRef } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * AlarmKit does not hand the app a URL — it relaunches the process and leaves a
 * payload behind, which `consumeLaunch()` reads. Routing from that payload is
 * therefore imperative rather than link-driven, so it needs a ref that works
 * outside the React tree.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToRinging(knowtId: string): boolean {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate('Ringing', { knowtId });
  return true;
}
