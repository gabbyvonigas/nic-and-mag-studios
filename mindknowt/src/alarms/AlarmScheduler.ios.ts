import {
  cancelAlarm,
  configure as configureAlarmKit,
  generateUUID,
  getAllAlarms,
  getLaunchPayload,
  requestAuthorization as requestAlarmAuthorization,
  scheduleAlarm,
} from 'expo-alarm-kit';

import {
  AlarmError,
  APP_GROUP_ID,
  type AlarmAuthorization,
  type AlarmLaunch,
  type AlarmScheduler,
  type ScheduleRequest,
  type ScheduledAlarm,
} from './types';

/**
 * `launchAppOnDismiss` is the whole point of using AlarmKit here rather than a
 * local notification: the Stop button on the Lock Screen opens MindKnowt
 * instead of silently clearing the alarm, which is what makes "it won't turn
 * off until you're there" enforceable.
 */
const LAUNCH_APP_ON_DISMISS = true;

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

  async scheduleAt({ title, firesAt, payload }: ScheduleRequest) {
    const id = generateUUID();
    let accepted = false;

    try {
      accepted = await scheduleAlarm({
        id,
        epochSeconds: Math.floor(firesAt.getTime() / 1000),
        title,
        launchAppOnDismiss: LAUNCH_APP_ON_DISMISS,
        dismissPayload: payload ?? undefined,
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
