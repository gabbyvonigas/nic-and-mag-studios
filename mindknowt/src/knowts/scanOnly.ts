/**
 * Knowts that never ring: a tag on the fridge, scanned whenever you pass it.
 *
 * **There is no column for this and there is no migration.** A scan-only Knowt
 * is one with no schedule rows, which is already exactly what the data says,
 * so every existing Knowt keeps its meaning and nothing has to be rewritten on
 * upgrade. Draft and archived are separate flags, so neither is confused with
 * this.
 *
 * Having no schedule was already a saveable state. What it did not have was a
 * life: `listDashboard` emits one card per schedule due today, so a Knowt with
 * none produced none and never appeared on Daily at all. That was deliberate
 * once, on the reasoning that Daily should only show what is going to ring. A
 * standing item you scan when you pass it is the case that reasoning did not
 * cover.
 *
 * Pure, and the single definition, so the dashboard, the Log and the editors
 * cannot disagree about what counts.
 */
import type { EventRow, ScheduleRow } from '../db/types';

/**
 * Never rings, so it is always available.
 *
 * Zero schedules, not "no schedule due today" and not "every schedule paused".
 * A paused schedule is a timed Knowt someone switched off and can switch back
 * on; treating it as scan-only would silently move it to a different part of
 * Daily and change what it means.
 */
export function isScanOnly(knowt: {
  schedules: readonly ScheduleRow[];
}): boolean {
  // Unknown counts as timed. The two readers that matter differ in what a
  // wrong answer costs: a wrong "scan-only" quietly drops real completions out
  // of Peak time and the time-of-day insight, where a wrong "timed" leaves
  // both exactly as they were before any of this existed. So this leans the
  // harmless way, the same as every other gate in the app.
  return Array.isArray(knowt.schedules) && knowt.schedules.length === 0;
}

/** Where a time would go on the card. */
export const SCAN_ONLY_META = 'Scan only';

/** The heading over them on Daily. */
export const ANYTIME_HEADING = 'Anytime today';

/**
 * Daily in two parts: what has a time, then what does not.
 *
 * Timed Knowts stay in time order and keep the top of the list, because a
 * standing item has no deadline and should not push one down the screen. The
 * cards arrive already sorted, with untimed ones last, so this only has to
 * cut the list rather than reorder it.
 */
export function splitByTiming<T extends { schedule: ScheduleRow | null }>(
  cards: readonly T[],
): { timed: T[]; anytime: T[] } {
  const timed: T[] = [];
  const anytime: T[] = [];
  for (const card of cards) {
    if (card.schedule) timed.push(card);
    else anytime.push(card);
  }
  return { timed, anytime };
}

/**
 * The completions a clock-based statistic is allowed to read.
 *
 * Peak time and Avg complete time are both about when an alarm was answered.
 * A scan-only Knowt has no alarm, so a scan of one at a quarter past three is
 * not evidence about when this person responds to reminders; it is evidence
 * about when they walked past the fridge. Left in, a few standing items would
 * drag Peak time toward whenever they happen to get scanned.
 *
 * Avg complete time would already have excluded them, because it needs both
 * `fired_at` and `completed_at` and a scan-only completion has no `fired_at`.
 * Filtering here as well makes that correct by construction rather than by a
 * coincidence that a later change could undo.
 */
export function timedCompletions(
  events: readonly EventRow[],
  knowts: readonly { id: string; schedules: readonly ScheduleRow[] }[],
): EventRow[] {
  const scanOnly = new Set(
    knowts.filter(isScanOnly).map((knowt) => knowt.id),
  );
  return events.filter((event) => !scanOnly.has(event.knowt_id));
}
