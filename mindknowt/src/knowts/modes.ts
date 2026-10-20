import { isScanOnly } from './scanOnly';
import type { IconName } from '../components/Icon';
import type { KnowtMode } from '../db/types';

/**
 * How a Knowt stops, as a person chooses it.
 *
 * Three options over two columns:
 *
 *   Alarm Only     scan_only 0, mode `open`
 *   Scan Knowt     scan_only 1, no schedule
 *   Scan + Alarm   scan_only 0, mode `strict`
 *
 * Scan Knowt is read from `scan_only`, not from having no schedule. Those are
 * different facts, and reading the second as the first put four preset Knowts
 * on Daily that nobody had chosen. A Knowt with no schedule and `scan_only` 0
 * is a plain unscheduled Knowt: Alarm Only, waiting for a time.
 *
 * **The stored values did not change and there is no migration.** `strict` is
 * still `strict`. What changed is the label on it: it used to read "Scan Knowt"
 * and now reads "Scan + Alarm", because "Scan Knowt" has been taken over by the
 * no-alarm case. Every existing Knowt therefore keeps working untouched and
 * simply shows a different name for what it already was.
 *
 * That rename is why `MODE_CHOICES` and `modeLabel` were deleted rather than
 * adjusted. Both answered from the mode alone, which can no longer tell "Scan
 * Knowt" from "Scan + Alarm", and leaving them would have let a screen go on
 * rendering the old meaning. Anything that still reads them fails to compile.
 *
 * There used to be a third stored mode. Soft meant "has a tag but can be
 * dismissed", which is Alarm Only with a tag attached, so migration 6 collapsed
 * it. A row still holding the retired value reads as Alarm Only.
 */

/** The values a person can now choose. */
export type ModeChoice = Extract<KnowtMode, 'strict' | 'open'>;

/** Which of the three buttons a Knowt is on. */
export type StopChoice = 'alarm' | 'scan' | 'both';

export const STOP_CHOICES: {
  value: StopChoice;
  /**
   * The glyphs on the card, in order.
   *
   * A list rather than one, because Scan + Alarm is both things and showing
   * only one of them made the two scanning modes look identical at a glance.
   * It wears the alarm and the brand mark side by side, smaller, so the row
   * reads as alarm, mark, alarm plus mark.
   */
  icons: IconName[];
  /**
   * Deliberately close in length, so three of them sit in one row on a small
   * iPhone without one of them wrapping or shrinking on its own.
   */
  label: string;
  detail: string;
  /** What gets stored. Two of the three store the same thing. */
  mode: ModeChoice;
  /** Whether it has a schedule. False is the whole of what scan-only means. */
  rings: boolean;
  /**
   * Whether it cannot be chosen without a tag.
   *
   * Only Scan + Alarm. Scan Knowt is choosable with no tag on purpose: it
   * carries a manual "Mark done" and a way to attach one, so it works before
   * the tags arrive. Scan + Alarm cannot, because an alarm that only a tag
   * stops, with no tag, is an alarm nothing stops.
   */
  needsTag: boolean;
}[] = [
  {
    value: 'alarm',
    icons: ['alarm'],
    label: 'Alarm Only',
    detail:
      'Rings at the time you set. Dismiss it on screen when it goes off. No tag needed.',
    mode: 'open',
    rings: true,
    needsTag: false,
  },
  {
    value: 'scan',
    icons: ['knowtTag'],
    label: 'Scan Knowt',
    detail:
      'No alarm, no schedule. Press Scan Knowt to log when you tap its tag. Pin it to keep it at the top of your Knowts.',
    mode: 'strict',
    rings: false,
    needsTag: false,
  },
  {
    value: 'both',
    icons: ['alarm', 'knowtTag'],
    label: 'Scan + Alarm',
    detail:
      'Rings at the time you set and keeps ringing until you scan its tag. Nothing else stops it.',
    mode: 'strict',
    rings: true,
    needsTag: true,
  },
];

/**
 * What a chosen mode is still missing, or null when it is complete.
 *
 * Shown under the row rather than inside the option's own text, because a
 * requirement stated before it applies reads as a requirement of the whole
 * screen. The other two options are never incomplete: Alarm Only involves no
 * tag, and Scan Knowt works without one through the manual fallback and wants
 * no schedule at all.
 *
 * This replaced a flat "needs a tag attached first", which was written while
 * Scan + Alarm could not be chosen without one. It can now, so the note says
 * what is left rather than what is forbidden, and it names the schedule too,
 * because an alarm with no time is as incomplete as one with no tag.
 */
export function missingFor(
  value: StopChoice,
  state: { tagged: boolean; scheduled: boolean },
): string | null {
  if (value !== 'both') return null;
  if (!state.tagged && !state.scheduled) {
    return 'Scan + Alarm needs a Knowt Tag and a schedule. It will not ring until it has both.';
  }
  if (!state.tagged) {
    return 'Scan + Alarm needs a Knowt Tag. It will not ring until it has one.';
  }
  if (!state.scheduled) {
    return 'Scan + Alarm needs a schedule. It will not ring until it has one.';
  }
  return null;
}

export function stopChoice(value: StopChoice) {
  return STOP_CHOICES.find((choice) => choice.value === value) as
    (typeof STOP_CHOICES)[number];
}

/**
 * Which button a stored Knowt is on.
 *
 * `scan_only` is asked first and answers on its own. The mode cannot: a Scan
 * Knowt stores `strict` once a tag is attached and `open` before that, and
 * `strict` with a schedule is Scan + Alarm.
 */
export function stopChoiceOf(knowt: {
  mode: KnowtMode;
  scan_only?: number;
}): StopChoice {
  if (isScanOnly(knowt)) return 'scan';
  return requiresScan(knowt.mode) ? 'both' : 'alarm';
}

/**
 * Whether only a scan of this Knowt's own tag can complete it.
 *
 * The one question every completion path has to ask, so it lives here rather
 * than beside each of them. Both Scan Knowt and Scan + Alarm say yes, and both
 * store `strict`, which is why it asks `stopChoiceOf` and not the mode column:
 * what separates them is having no schedule, and neither can be finished by a
 * tap.
 *
 * The only exception in the app is the Override on the ringing alarm, which is
 * a hold rather than a tap, says in its own copy that it is recorded as an
 * override, and writes `method: 'override'` so the Log can tell.
 */
export function needsScan(knowt: {
  mode: KnowtMode;
  scan_only?: number;
}): boolean {
  return stopChoiceOf(knowt) !== 'alarm';
}

/** The label for a stored Knowt, which is what every chip and row shows. */
export function stopLabelOf(knowt: {
  mode: KnowtMode;
  scan_only?: number;
}): string {
  return stopChoice(stopChoiceOf(knowt)).label;
}

/** Whether finishing this knowt requires the tag. */
export function requiresScan(mode: KnowtMode): boolean {
  return mode === 'strict';
}

/** The stored mode a choice maps to. The retired value reads as Alarm Only. */
export function modeChoice(mode: KnowtMode): ModeChoice {
  return mode === 'strict' ? 'strict' : 'open';
}

/**
 * Whether scanning is offered at all. An Alarm Only knowt that happens to
 * carry a tag can still be scanned by choice; it just is not required.
 */
export function canScan(mode: KnowtMode, tagUid: string | null): boolean {
  return requiresScan(mode) || !!tagUid;
}
