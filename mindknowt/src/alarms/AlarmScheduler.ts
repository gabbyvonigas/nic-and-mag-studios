import { createUnsupportedScheduler } from './createUnsupportedScheduler';
import type { AlarmScheduler } from './types';

/**
 * Fallback for any platform without an `AlarmScheduler.<platform>.ts` sibling.
 * Metro prefers the platform file on iOS, so this is never bundled there — but
 * it is what TypeScript resolves `./AlarmScheduler` to, which keeps every
 * implementation typed against one shape.
 */
export const alarmScheduler: AlarmScheduler = createUnsupportedScheduler(
  'System alarms are not implemented on this platform.',
);
