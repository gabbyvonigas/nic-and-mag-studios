/**
 * Platform-agnostic alarm contract. Nothing above this layer imports
 * `expo-alarm-kit` or any other platform SDK, so adding Android (or swapping
 * the iOS module, which is young and pre-1.0) means adding an implementation
 * file rather than restructuring callers.
 */

/**
 * Shared container between the app and the AlarmKit dismiss intent. Must match
 * the `com.apple.security.application-groups` entitlement in app.json exactly,
 * or `configure()` fails and no alarm can be scheduled.
 */
export const APP_GROUP_ID = 'group.com.nicandmag.mindknowt';

export type AlarmAuthorization =
  /** Not read yet. Never render this as a factual permission state. */
  | 'unknown'
  | 'authorized'
  | 'denied'
  | 'notDetermined'
  | 'unavailable';

export type AlarmFailureReason =
  | 'unauthorized'
  | 'not-configured'
  | 'schedule-rejected'
  | 'unsupported'
  | 'unknown';

export class AlarmError extends Error {
  readonly reason: AlarmFailureReason;

  constructor(reason: AlarmFailureReason, message: string) {
    super(message);
    this.name = 'AlarmError';
    this.reason = reason;
  }
}

/** An alarm this app scheduled. */
export type ScheduledAlarm = {
  id: string;
  title: string;
  /** epoch ms */
  firesAt: number;
};

/**
 * Present when the app was opened by the alarm's Stop button. This is the
 * mechanism that will route to a Knowt's Ringing screen: `payload` carries the
 * knowt id across the launch.
 */
export type AlarmLaunch = {
  alarmId: string;
  payload: string | null;
};

/**
 * A weekly recurring alarm. Handing the recurrence to the system means a daily
 * knowt keeps ringing whether or not the app is ever opened again, instead of
 * depending on the app to re-arm the next one each time.
 */
export type WeeklyScheduleRequest = {
  title: string;
  /** 0 to 23, local wall clock. */
  hour: number;
  /** 0 to 59. */
  minute: number;
  /** Sunday = 1, matching the schema's days_of_week encoding. */
  weekdays: number[];
  /** Next time this will ring. Used only for the app's own record. */
  nextFiresAt: Date;
  payload?: string | null;
};

export type ScheduleRequest = {
  title: string;
  firesAt: Date;
  /** Round-tripped back through `consumeLaunch()` when the user taps Stop. */
  payload?: string;
};

export interface AlarmScheduler {
  /** Whether this platform can schedule system alarms. Must not throw. */
  isAvailable(): Promise<boolean>;

  /** Wire up shared storage. Must succeed before anything else is called. */
  configure(): Promise<void>;

  /** Prompts the first time it is called. */
  requestAuthorization(): Promise<AlarmAuthorization>;

  /** Rejects with `AlarmError` on any failure. */
  scheduleAt(request: ScheduleRequest): Promise<ScheduledAlarm>;

  /**
   * Schedules a weekly recurring alarm. `firesAt` on the result is the next
   * firing, not the only one.
   */
  scheduleWeekly(request: WeeklyScheduleRequest): Promise<ScheduledAlarm>;

  cancel(id: string): Promise<void>;

  /** Ids of alarms currently known to the platform. */
  listScheduled(): Promise<string[]>;

  /**
   * Returns non-null at most once per launch/dismiss. Reading it clears it, so
   * call it on mount and again whenever the app returns to the foreground.
   */
  consumeLaunch(): Promise<AlarmLaunch | null>;
}
