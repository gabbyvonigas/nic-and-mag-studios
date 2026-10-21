/**
 * What has already been done, and what that means for an alarm.
 *
 * An alarm is armed for an occurrence: a schedule on a calendar day. Once that
 * occurrence has been completed, the alarm for it is finished, whether it was
 * completed by scanning the tag or by tapping the knowt on Daily hours early.
 * Nothing here knew that, which is the bug this file exists for: the 9:00 am
 * alarm rang for something checked off at seven.
 *
 * Pure, and deliberately so. Which occurrence a completion covers decides
 * whether an alarm sounds, and that is not a judgment to leave untested on a
 * device.
 */
import { isDueOn, minutesOf, toISODate } from '../db/scheduling';
import type { EventRow, PendingAlarmRow, ScheduleRow } from '../db/types';

/**
 * Identifies one firing: a schedule, at a moment.
 *
 * It used to be a schedule on a day, which is one occurrence too coarse. A day
 * holds more than one firing, and finishing the 8:17 pm one marked the whole
 * day done: rescheduling the same schedule to 10:00 pm that evening armed
 * nothing, and the row went on reading "finished".
 */
export function occurrenceKey(scheduleId: string, at: Date): string {
  const minutes = `${`${at.getHours()}`.padStart(2, '0')}:${`${at.getMinutes()}`.padStart(2, '0')}`;
  return `${scheduleId}@${toISODate(at)}T${minutes}`;
}

/**
 * A schedule and a calendar day, which is what the key used to be.
 *
 * Two things still use it. A completion written before schema 18 cannot say
 * which firing it answered, so it keeps covering its whole day exactly as it
 * did: guessing a moment from `completed_at` would silence a real alarm or
 * raise one for something already done. And the resume gate asks a day-wide
 * question of its own, which is why it imports this rather than the moment.
 */
export function occurrenceDayKey(scheduleId: string, at: Date): string {
  return `${scheduleId}@${toISODate(at)}`;
}

/**
 * The day an event is about.
 *
 * `fired_at` wins when there is one, because that is when the occurrence
 * happened. An alarm that rings at 11:58 pm and is scanned at 12:01 am belongs
 * to the day it rang, not the day the scan landed on, and an override that
 * corrects the time three hours later still belongs to the firing.
 */
function dayOf(event: EventRow): Date | null {
  const at = event.fired_at ?? event.completed_at;
  return at === null ? null : new Date(at);
}

/**
 * The occurrences these events show as completed.
 *
 * Only events carrying a schedule id land here. A check-in with no schedule is
 * a person saying they did the thing, which is worth recording but does not
 * identify an occurrence, so it cannot be allowed to cancel a specific alarm.
 */
export function completedOccurrences(
  events: readonly EventRow[],
): ReadonlySet<string> {
  const done = new Set<string>();
  for (const event of events) {
    if (event.completed_at === null || !event.schedule_id) continue;
    // The firing it answered, when the row knows. Then it covers that one and
    // nothing else, so a later time the same day is still armed.
    //
    // A number, not merely "not null": a row read before schema 18 carries no
    // such property at all, and `undefined !== null` would have sent it down
    // this branch and keyed it off an invalid date.
    if (typeof event.occurrence_at === 'number') {
      done.add(occurrenceKey(event.schedule_id, new Date(event.occurrence_at)));
      continue;
    }
    const day = dayOf(event);
    if (day) done.add(occurrenceDayKey(event.schedule_id, day));
  }
  return done;
}

export function isOccurrenceDone(
  done: ReadonlySet<string>,
  scheduleId: string,
  at: Date,
): boolean {
  return (
    done.has(occurrenceKey(scheduleId, at)) ||
    done.has(occurrenceDayKey(scheduleId, at))
  );
}

/**
 * The completion that finished this schedule, or null.
 *
 * The most recent one naming it, which is the one an undo should take back: a
 * schedule that has been completed and rescheduled before has older rows that
 * answered firings nobody is looking at.
 *
 * Here rather than beside the sheet that asks the question, because that file
 * imports `Alert` and this is the part worth asserting.
 */
export function finishedBy(
  schedule: ScheduleRow,
  events: readonly EventRow[],
): EventRow | null {
  const mine = events.filter(
    (event) => event.schedule_id === schedule.id && event.completed_at !== null,
  );
  if (mine.length === 0) return null;
  return mine.reduce((latest, event) =>
    (event.completed_at ?? 0) > (latest.completed_at ?? 0) ? event : latest,
  );
}

/** The schedules that have come due today and not yet gone past, soonest first. */
function dueAndPassed(
  schedules: readonly ScheduleRow[],
  now: Date,
): ScheduleRow[] {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return schedules
    .filter((s) => isDueOn(s, now) && minutesOf(s.time) <= minutesNow)
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
}

/** The events that completed something on `now`'s calendar day. */
function completedToday(events: readonly EventRow[], now: Date): EventRow[] {
  const today = toISODate(now);
  return events.filter((event) => {
    if (event.completed_at === null) return false;
    const day = dayOf(event);
    return !!day && toISODate(day) === today;
  });
}

/**
 * Which of today's occurrences are still outstanding.
 *
 * A completion naming a schedule covers that schedule. A completion naming
 * none covers one outstanding occurrence, earliest first: someone who checks
 * in at noon on a knowt that rings at nine and at five has done the nine
 * o'clock one, and still has the five o'clock one ahead of them.
 */
function outstanding(
  schedules: readonly ScheduleRow[],
  events: readonly EventRow[],
  now: Date,
): ScheduleRow[] {
  const due = dueAndPassed(schedules, now);
  if (due.length === 0) return [];

  const today = completedToday(events, now);
  const named = new Set(
    today.map((e) => e.schedule_id).filter((id): id is string => !!id),
  );
  let unnamed = today.filter((e) => !e.schedule_id).length;

  const open: ScheduleRow[] = [];
  for (const schedule of due) {
    if (named.has(schedule.id)) continue;
    if (unnamed > 0) {
      unnamed -= 1;
      continue;
    }
    open.push(schedule);
  }
  return open;
}

/**
 * The occurrence a check-in right now should be recorded against, or null when
 * there is none to name.
 *
 * Detail's "I just did this" recorded every completion with no schedule id, so
 * it never counted against the day: Daily went on showing the knowt as not
 * done, and the alarm armed for it went on ringing.
 */
export function openOccurrence(args: {
  schedules: readonly ScheduleRow[];
  events: readonly EventRow[];
  now?: Date;
}): ScheduleRow | null {
  const open = outstanding(args.schedules, args.events, args.now ?? new Date());
  return open[0] ?? null;
}

/** Today's occurrences whose time has not come yet, soonest first. */
function dueAhead(
  schedules: readonly ScheduleRow[],
  now: Date,
): ScheduleRow[] {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return schedules
    .filter((s) => isDueOn(s, now) && minutesOf(s.time) > minutesNow)
    .sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
}

/**
 * The occurrence a "mark done" right now covers, including one still ahead.
 *
 * `openOccurrence` answers for an occurrence that has already come due, which
 * is the right question for whether the day is behind. It is the wrong question
 * for standing an alarm down, and that was the bug: marking a knowt done before
 * its time left nothing to name, the completion went in with a null
 * `schedule_id`, and a completion that names no occurrence deliberately cancels
 * no alarm. So the 9:00 pm alarm rang for something marked done at three.
 *
 * Today only, and one occurrence. Marking done now says nothing about tomorrow,
 * so a recurring schedule keeps every firing after this one, and a knowt that
 * rings at nine and at five has the five o'clock one still ahead of it.
 */
export function checkInOccurrence(args: {
  schedules: readonly ScheduleRow[];
  events: readonly EventRow[];
  now?: Date;
}): ScheduleRow | null {
  const now = args.now ?? new Date();
  const open = openOccurrence({ ...args, now });
  if (open) return open;

  // Anything already named today is covered. An unnamed completion is not
  // counted here: it names nothing by definition, and `outstanding` has
  // already spent it against the occurrences that have come due.
  const covered = new Set(
    completedToday(args.events, now)
      .map((event) => event.schedule_id)
      .filter((id): id is string => !!id),
  );
  for (const schedule of dueAhead(args.schedules, now)) {
    if (!covered.has(schedule.id)) return schedule;
  }
  return null;
}

/**
 * The occurrence an alarm ringing right now is for.
 *
 * The latest one to have come due, which is not the same question
 * `openOccurrence` answers. A knowt that rings at nine and at five is ringing
 * for the five o'clock one at five, even if the nine was never answered;
 * someone pressing "I just did this" is answering the nine.
 *
 * AlarmKit hands back a payload and nothing else, so the firing arrives naming
 * only the knowt. Without this the scan that stopped the alarm was recorded
 * against no schedule at all, and Daily went on showing the knowt as not done
 * after the tag had been scanned.
 */
export function firingOccurrence(args: {
  schedules: readonly ScheduleRow[];
  events: readonly EventRow[];
  now?: Date;
}): ScheduleRow | null {
  const now = args.now ?? new Date();
  const open = outstanding(args.schedules, args.events, now);
  return open[open.length - 1] ?? null;
}

/**
 * Whether an alarm that has just fired for a knowt should open the Ringing
 * screen and demand a scan.
 *
 * This is the half of the fix that cannot be solved by canceling. A weekly
 * repeat is one recurring AlarmKit alarm built from a time and a set of
 * weekdays, with no start date and no way to skip a single occurrence, so
 * today's 9:00 am will sound whatever the app does. What the app can refuse to
 * do is stand in front of the person demanding they scan a tag for something
 * they already did.
 *
 * It fails open everywhere it is unsure. A missed alarm is the worst thing this
 * app can do, so an unrecognized firing rings.
 */
export function shouldPresentRinging(args: {
  schedules: readonly ScheduleRow[];
  events: readonly EventRow[];
  /** One-shots on record for this knowt: a re-fire, a snooze, a test ring. */
  oneShots?: readonly PendingAlarmRow[];
  now?: Date;
}): boolean {
  const now = args.now ?? new Date();

  // A re-fire, a snooze or a test ring is a firing that was asked for by name,
  // after the fact. This morning's completion is not an answer to it.
  const fired = (args.oneShots ?? []).some(
    (row) => row.fires_at <= now.getTime(),
  );
  if (fired) return true;

  // A snooze that has not come due is an answer, and the only way a snooze
  // taken on the Lock Screen reaches the app at all: the module sets the same
  // launch payload for Stop and for Snooze and gives no way to tell them apart,
  // so without this, opening the app after putting something off reopened the
  // ringing screen for it. A re-fire is deliberately not an answer here. The
  // app armed that one itself, nobody said "later", and the one thing it must
  // never do is suppress a ring the person did not ask it to.
  const deferred = (args.oneShots ?? []).some(
    (row) => row.kind === 'snooze' && row.fires_at > now.getTime(),
  );
  if (deferred) return false;

  const due = dueAndPassed(args.schedules, now);
  // Nothing has come due, so there is nothing that could already be done. An
  // alarm ringing anyway is one this app cannot account for, and it rings.
  if (due.length === 0) return true;

  return outstanding(args.schedules, args.events, now).length > 0;
}
