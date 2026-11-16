import { createUnsupportedScheduler } from './createUnsupportedScheduler';
import type { AlarmScheduler } from './types';

/**
 * TODO(android): AlarmKit is Apple-only. The Android equivalent is
 * AlarmManager.setAlarmClock plus a full-screen intent, which differs in ways
 * that matter here:
 *   - SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM permission is required, and on
 *     Android 14+ the user can revoke it.
 *   - There is no system alarm UI, so the ringing screen is ours to build and
 *     must be launched as a full-screen intent over the lock screen.
 *   - "Launch app on dismiss" is implicit, since our own activity is what
 *     shows in the first place.
 * Nothing outside this file needs to change.
 */
export const alarmScheduler: AlarmScheduler = createUnsupportedScheduler(
  'System alarms on Android are not implemented yet.',
);
