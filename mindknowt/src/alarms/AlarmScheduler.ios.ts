import {
  cancelAlarm,
  configure as configureAlarmKit,
  generateUUID,
  getAllAlarms,
  getLaunchPayload,
  requestAuthorization as requestAlarmAuthorization,
  scheduleAlarm,
  scheduleRepeatingAlarm,
  getSnoozes,
  clearSnooze as clearNativeSnooze,
} from 'expo-alarm-kit';

import { bannerTitle, snoozeLabel, stopLabel } from './banner';
import { describeError as describe } from './settle';
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
 * AlarmKit draws that banner; this app hands it text and colors, not a layout.
 * What can be set is the title, the tint, the two button labels and their text
 * colors. Without a tint the module defaults to `Color.blue`, which is where
 * the blue came from: it was never chosen.
 *
 * The Stop label is the only place the banner can say a scan is needed, since
 * the button's SF Symbol is hardcoded in the module and the metadata type it
 * builds is empty, so no custom Live Activity view can be attached. See
 * design-notes.md for what that costs and what would lift it.
 *
 * `doSnoozeIntent` is the one that was wrong rather than merely unset. The
 * module reads it as `false` by default and then passes `secondaryIntent: nil`,
 * so the snooze button ran no App Intent of ours at all: AlarmKit restarted its
 * own countdown and the patch that writes a snooze record into App Group
 * storage never executed. Turning it on is what makes a Lock Screen snooze
 * something the app can see on its next launch, which is what keeps it on Daily
 * instead of reopening a ringing screen for something already answered.
 *
 * `launchAppOnSnooze` stays off. Snoozing must not open the app.
 */
function brand(args: { requiresScan?: boolean; snoozeMinutes?: number }) {
  return {
    tintColor: theme.color.highlight,
    // Near-black on lime. White on lime is the one combination that fails:
    // 1.19 against it, which is the same reason nothing in the app puts white
    // on the neon either.
    stopButtonColor: theme.color.onHighlight,
    snoozeButtonColor: theme.color.onHighlight,
    stopButtonLabel: stopLabel(args.requiresScan),
    snoozeButtonLabel: snoozeLabel(args.snoozeMinutes ?? Number.NaN),
    doSnoozeIntent: true,
    // Seconds. The label above states this number, so they are set together or
    // the button lies about how long it defers for.
    ...(args.snoozeMinutes && args.snoozeMinutes >= 1
      ? { snoozeDuration: Math.round(args.snoozeMinutes) * 60 }
      : {}),
  };
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

  async scheduleAt({
    title,
    firesAt,
    payload,
    requiresScan,
    snoozeMinutes,
    timeLabel,
    soundName,
  }: ScheduleRequest) {
    const id = generateUUID();
    let accepted = false;

    try {
      accepted = await scheduleAlarm({
        id,
        epochSeconds: Math.floor(firesAt.getTime() / 1000),
        title: bannerTitle(title, timeLabel),
        launchAppOnDismiss: LAUNCH_APP_ON_DISMISS,
        dismissPayload: payload ?? undefined,
        // The same Knowt id on both buttons. The snooze intent writes it into
        // App Group storage, which is how a Lock Screen snooze names the Knowt
        // it belongs to by the time the app next opens.
        snoozePayload: payload ?? undefined,
        // Passed straight through to AlertSound.named(), which looks the name
        // up in the main bundle. The extension has to be in it.
        soundName: soundName ?? undefined,
        ...brand({ requiresScan, snoozeMinutes }),
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
    snoozeMinutes,
    timeLabel,
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
        title: bannerTitle(title, timeLabel),
        launchAppOnDismiss: LAUNCH_APP_ON_DISMISS,
        dismissPayload: payload ?? undefined,
        snoozePayload: payload ?? undefined,
        ...brand({ requiresScan, snoozeMinutes }),
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

  /**
   * Snoozes taken on the Lock Screen.
   *
   * The native side records these in App Group storage when the snooze intent
   * runs, because that intent does not launch the app and the launch payload is
   * a static that dies with the process. Epoch seconds there, milliseconds here.
   */
  async listSnoozes() {
    try {
      return getSnoozes().map((row) => ({
        alarmkitId: row.alarmId,
        endsAt: Math.round(row.endsAt * 1000),
        payload: row.payload ?? null,
      }));
    } catch {
      // An older build has no such function. Nothing is snoozed as far as this
      // app can tell, which is exactly what it knew before.
      return [];
    }
  },

  async clearSnooze(alarmkitId: string) {
    try {
      clearNativeSnooze(alarmkitId);
    } catch {
      // Same as above: nothing to forget on a build without it.
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
