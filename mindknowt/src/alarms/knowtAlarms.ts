import { alarmScheduler } from './AlarmScheduler';
import type { ScheduledAlarm } from './types';

/**
 * Schedules an alarm for a knowt. The knowt id travels as the dismiss payload,
 * which is what lets the Ringing screen know which knowt reopened the app —
 * AlarmKit hands back a payload, never a URL.
 */
export async function armKnowtAlarm(args: {
  knowtId: string;
  title: string;
  firesAt: Date;
}): Promise<ScheduledAlarm> {
  return alarmScheduler.scheduleAt({
    title: args.title,
    firesAt: args.firesAt,
    payload: args.knowtId,
  });
}

/** Re-arms after an abandoned ringing session. Spec section 2, step 5. */
export async function rearmKnowtAlarm(args: {
  knowtId: string;
  title: string;
  minutes: number;
}): Promise<ScheduledAlarm> {
  return armKnowtAlarm({
    knowtId: args.knowtId,
    title: args.title,
    firesAt: new Date(Date.now() + args.minutes * 60_000),
  });
}
