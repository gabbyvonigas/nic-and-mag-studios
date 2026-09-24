import {
  cancelAlarm,
  configure as configureAlarmKit,
  generateUUID,
  getAllAlarms,
  getLaunchPayload,
  requestAuthorization as requestAlarmAuthorization,
  scheduleAlarm,
  scheduleRepeatingAlarm,
} from 'expo-alarm-kit';

import { theme } from '../theme';
import {
  AlarmError,
  APP_GROUP_ID,
  type AlarmAuthorization,
  type AlarmLaunch,
  type AlarmScheduler,
  type ScheduleRequest,
  type ScheduledAlarm,
  type WeeklyScheduleRequest,
} from './types';

/**
 * `launchAppOnDismiss` is the whole point of using AlarmKit here rather than a
 * local notification: the Stop button on the Lock Screen opens MindKnowt
 * instead of silently clearing the alarm, which is what makes "it won't turn
 * off until you're there" enforceable.
 */
const LAUNCH_APP_ON_DISMISS = true;

/**
 * How the alarm looks on the Lock Screen.
 *
 * AlarmKit draws that banner; this app hands it text and colours, not a layout.
 * What can be set is the tint, the two button labels and their text colours.
 * Without a tint the module defaults to `Color.blue`, which is where the blue
 * came from: it was never chosen.
 *
 * The Stop label is the only place the banner can say a scan is needed, since
 * the button's SF Symbol is hardcoded in the module and the metadata type it
 * builds is empty, so no custom Live Activity view can be attached. See
 * design-notes.md for what that costs and what would lift it.
 */
function brand(requiresScan?: boolean) {
  return {
    tintColor: theme.color.highlight,
    // Near-black on lime. White on lime is the one combination that fails:
    // 1.19 against it, which is the same reason nothing in the app puts white
    // on the neon either.
    stopButtonColor: theme.color.onHighlight,
    snoozeButtonColor: theme.color.onHighlight,
    stopButtonLabel: requiresScan ? 'Scan to stop' : 'Done',
    snoozeButtonLabel: 'Snooze',
  };
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const name = err.constructor?.name || err.name || 'Error';
    return err.message ? `${name}: ${err.message}` : name;
  }
  return String(err);
}

export const alarmScheduler: AlarmScheduler = {
  async isAvailable() {
    // The native module only builds on iOS 26.1+, so its presence is the check.
    try {
      return typeof generateUUID() === 'string';
    } catch {
      return false;
    }
  },

  async configure() {
    let ok = false;
    try {
      ok = configureAlarmKit(APP_GROUP_ID);
    } catch (err) {
      throw new AlarmError('not-configured', describe(err));
    }
    if (!ok) {
      throw new AlarmError(
        'not-configured',
        `Could not open App Group ${APP_GROUP_ID}. Check the ` +
          'com.apple.security.application-groups entitlement matches.',
      );
    }
  },

  async requestAuthorization() {
    try {
      return (await requestAlarmAuthorization()) as AlarmAuthorization;
    } catch (err) {
      throw new AlarmError('unknown', describe(err));
    }
  },

  async scheduleAt({ title, firesAt, payload, requiresScan }: ScheduleRequest) {
    const id = generateUUID();
    let accepted = false;

    try {
      accepted = await scheduleAlarm({
        id,
        epochSeconds: Math.floor(firesAt.getTime() / 1000),
        title,
        launchAppOnDismiss: LAUNCH_APP_ON_DISMISS,
        dismissPayload: payload ?? undefined,
        ...brand(requiresScan),
      });
    } catch (err) {
      throw new AlarmError('schedule-rejected', describe(err));
    }

    if (!accepted) {
      throw new AlarmError(
        'schedule-rejected',
        'AlarmKit refused the alarm. Permission is the usual cause.',
      );
    }

    return { id, title, firesAt: firesAt.getTime() } satisfies ScheduledAlarm;
  },

  async scheduleWeekly({
    title,
    hour,
    minute,
    weekdays,
    nextFiresAt,
    payload,
    requiresScan,
  }: WeeklyScheduleRequest) {
    const id = generateUUID();
    let accepted = false;

    try {
      accepted = await scheduleRepeatingAlarm({
        id,
        hour,
        minute,
        // AlarmKit uses Sunday = 1, the same encoding as the schema, so the
        // days pass through unchanged. Verified against the module's types.
        weekdays,
        title,
        launchAppOnDismiss: LAUNCH_APP_ON_DISMISS,
        dismissPayload: payload ?? undefined,
        ...brand(requiresScan),
      });
    } catch (err) {
      throw new AlarmError('schedule-rejected', describe(err));
    }

    if (!accepted) {
      throw new AlarmError(
        'schedule-rejected',
        'AlarmKit refused the repeating alarm. Permission is the usual cause.',
      );
    }

    return {
      id,
      title,
      firesAt: nextFiresAt.getTime(),
    } satisfies ScheduledAlarm;
  },

  async cancel(id: string) {
    try {
      await cancelAlarm(id);
    } catch (err) {
      throw new AlarmError('unknown', describe(err));
    }
  },

  async listScheduled() {
    try {
      return getAllAlarms();
    } catch {
      return [];
    }
  },

  async consumeLaunch(): Promise<AlarmLaunch | null> {
    try {
      const launch = getLaunchPayload();
      return launch
        ? { alarmId: launch.alarmId, payload: launch.payload }
        : null;
    } catch {
      return null;
    }
  },
};
