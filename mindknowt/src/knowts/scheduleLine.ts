/**
 * The second line of a schedule row: how often, and when next.
 *
 * The rows on the detail screen and on Edit showed the time and the word
 * "Once", which answers "how often" and leaves out the one thing a person
 * reading a list of schedules wants: which day. Opening the editor to find out
 * is three taps for a date the row had room for.
 *
 * Its own `.ts` module for the usual reason: the off-device runner cannot load
 * a `.tsx`, and which date this returns is worth asserting rather than
 * eyeballing on a screen.
 */
import { describeRepeat, nextOccurrence } from '../db/scheduling';
import { isOccurrenceDone } from './completions';
import { dayLabel } from './occurrences';
import type { ScheduleRow } from '../db/types';

/** "Today" and "Tomorrow" lead the date part, so they are capitalized. */
function dateWord(day: Date, today: Date): string {
  const label = dayLabel(day, today);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * How often and when next, in one line.
 *
 * A one-off names its day outright, because for it "how often" and "when" are
 * the same fact: "Once, Today". Anything that repeats says which firing comes
 * next, which is not always the next day the pattern allows: "Every day, next
 * Tomorrow" after tonight has been done.
 *
 * `done` is the set from `completedOccurrences`, so a day that has been
 * completed or skipped is passed over here exactly as the reconciler passes
 * over it. Without it the row would name a firing that will not happen.
 */
export function scheduleLine(
  schedule: ScheduleRow,
  now: Date = new Date(),
  done: ReadonlySet<string> = new Set(),
): string {
  const repeat = describeRepeat(schedule);

  // A paused schedule has no next firing to name, and saying one would be a
  // promise it is switched off from keeping.
  if (!schedule.enabled) return `${repeat}, paused`;

  const next = nextOccurrence(schedule, now, (day) =>
    isOccurrenceDone(done, schedule.id, day),
  );
  if (!next) return `${repeat}, finished`;

  const when = dateWord(next, now);
  return schedule.repeat_type === 'once'
    ? `${repeat}, ${when}`
    : `${repeat}, next ${when}`;
}
