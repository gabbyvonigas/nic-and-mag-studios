/**
 * Scan Knowt: no alarm, no schedule, scanned whenever you pass its tag.
 *
 * **It is a stored choice, not a shape.** This used to be derived, "a Knowt
 * with no schedule is scan-only", and that was wrong in the one way that
 * mattered: a Knowt applied from a preset has no schedule until someone gives
 * it a time, so four preset Knowts were being treated as standing scan items
 * nobody had asked for. Having no schedule and having chosen to have no alarm
 * are different facts, and only the second one is this.
 *
 * `knowts.scan_only` carries it, added at schema 17 with a default of 0, so
 * every existing Knowt stays a plain unscheduled Knowt on upgrade.
 *
 * A plain unscheduled Knowt is therefore its own ordinary state: it lives on
 * the Knowts tab reading "No schedule", it is not on Daily, it is not counted,
 * and giving it a time is all it is waiting for.
 */
import type { EventRow } from '../db/types';

/**
 * Whether this Knowt was set to Scan Knowt.
 *
 * Unknown counts as no. The readers differ in what a wrong answer costs: a
 * wrong yes quietly drops real completions out of Peak time and puts a Knowt
 * somewhere the person did not put it, where a wrong no leaves everything as
 * it already was.
 */
export function isScanOnly(knowt: { scan_only?: number }): boolean {
  return knowt.scan_only === 1;
}

/** What the Knowts list says in place of a next time. */
export const SCAN_ONLY_META = 'Scan only';

/** What it says once today's scan has landed. Resets with the day. */
export const SCANNED_TODAY = 'Done today';

/**
 * The completions a clock-based statistic is allowed to read.
 *
 * Peak time, Avg complete time and the time-of-day insight are all about when
 * an alarm was answered. A Scan Knowt has no alarm, so a scan of one at a
 * quarter past three is evidence about when someone walked past the fridge, not
 * about when they answer reminders. Left in, a few standing items would drag
 * Peak time toward whenever they happen to get scanned.
 *
 * Avg complete time would already have excluded them, because it needs both
 * `fired_at` and `completed_at` and a scan of one of these has no `fired_at`.
 * Filtering here as well makes that correct by construction rather than by a
 * coincidence a later change could undo.
 */
export function timedCompletions(
  events: readonly EventRow[],
  knowts: readonly { id: string; scan_only?: number }[],
): EventRow[] {
  const scanOnly = new Set(
    knowts.filter(isScanOnly).map((knowt) => knowt.id),
  );
  return events.filter((event) => !scanOnly.has(event.knowt_id));
}
