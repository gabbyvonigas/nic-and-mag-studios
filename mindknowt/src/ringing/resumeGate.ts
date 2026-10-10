/**
 * What to open when the app comes to the foreground with no launch payload.
 *
 * Tapping the alarm banner or the Dynamic Island runs no App Intent, so the
 * payload is nil and the app opens wherever it last was. There is no way to ask
 * AlarmKit what is ringing, so this works from what the app already knows: a
 * schedule whose time has just passed and that nothing has answered.
 *
 * It is a guess, so it is a conservative one. Deliberately narrow:
 *
 *   - Only inside a short window after the time. Fifteen minutes, because an
 *     alarm from this morning is history by lunchtime and jumping to it would
 *     be the app deciding what you are doing.
 *   - Only if the occurrence was never completed.
 *   - Only if nothing was snoozed or re-fired for that Knowt, since a snooze is
 *     an answer.
 *   - Only if no ringing session was ever opened for it, which is what pressing
 *     Stop on the Lock Screen leaves behind. Opening the app later should not
 *     drag you back to something you already dealt with.
 *   - At most once per occurrence, so navigating away and coming back does not
 *     pull you in again. That is the "never when I went there myself" rule:
 *     the app gets one attempt, and after that the screen is yours.
 *
 * Pure, so every one of those can be asserted.
 */
import { isDueOn, minutesOf } from '../db/scheduling';
import { occurrenceKey } from '../knowts/completions';
import type { EventRow, PendingAlarmRow, ScheduleRow } from '../db/types';

/** How long after a firing the app will still offer to open it. */
export const RESUME_WINDOW_MINUTES = 15;

export type ResumeTarget = {
  knowtId: string;
  scheduleId: string;
  /** When the alarm was due, local milliseconds. */
  firedAt: number;
  /** Identifies the occurrence, so it is only ever offered once. */
  key: string;
};

export function pickUnansweredFiring(args: {
  knowts: { id: string; schedules: ScheduleRow[] }[];
  /** Today's events, completed or merely started. */
  events: readonly EventRow[];
  /** Everything armed, used to spot a snooze or a re-fire. */
  pending: readonly PendingAlarmRow[];
  now: Date;
  /** Occurrences already offered this session. */
  offered?: ReadonlySet<string>;
  windowMinutes?: number;
}): ResumeTarget | null {
  const {
    knowts,
    events,
    pending,
    now,
    offered = new Set<string>(),
    windowMinutes = RESUME_WINDOW_MINUTES,
  } = args;

  const nowMs = now.getTime();
  const windowMs = windowMinutes * 60_000;
  const minutesNow = now.getHours() * 60 + now.getMinutes();

  // A Knowt with anything still armed ahead of now has been answered: a snooze
  // and a re-fire are both the person saying "later", which is an answer.
  const answered = new Set(
    pending
      .filter((row) => row.schedule_id === null && row.fires_at > nowMs)
      .map((row) => row.knowt_id),
  );

  // Any event against an occurrence means it was dealt with: completed, or
  // merely opened, which is what pressing Stop leaves behind.
  const touched = new Set<string>();
  for (const event of events) {
    if (!event.schedule_id) continue;
    const at = event.fired_at ?? event.completed_at;
    if (at === null) continue;
    touched.add(occurrenceKey(event.schedule_id, new Date(at)));
  }

  let best: ResumeTarget | null = null;

  for (const knowt of knowts) {
    if (answered.has(knowt.id)) continue;

    for (const schedule of knowt.schedules) {
      if (!schedule.enabled) continue;
      if (!isDueOn(schedule, now)) continue;

      const due = minutesOf(schedule.time);
      // Not yet, or too long ago.
      if (due > minutesNow) continue;
      const firedAt = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        Math.floor(due / 60),
        due % 60,
      ).getTime();
      if (nowMs - firedAt > windowMs) continue;

      const key = occurrenceKey(schedule.id, now);
      if (touched.has(key) || offered.has(key)) continue;

      // The most recent firing wins: if two came due inside the window, the one
      // still ringing is the later one.
      if (!best || firedAt > best.firedAt) {
        best = { knowtId: knowt.id, scheduleId: schedule.id, firedAt, key };
      }
    }
  }

  return best;
}
