import { isScanOnly } from './scanOnly';
import type { KnowtMode, ScheduleRow } from '../db/types';

/**
 * How a Knowt stops, as a person chooses it.
 *
 * Three options, and they are not three stored values. Two of them share the
 * same `mode`, and what separates them is whether the Knowt has a schedule at
 * all:
 *
 *   Alarm Only     mode `open`,   has a schedule
 *   Scan Knowt     no schedule    (scan-only; the mode only decides the glyph)
 *   Scan + Alarm   mode `strict`, has a schedule
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
  /** A name in the shared icon set. No bell on the one that never rings. */
  icon: 'alarm' | 'scan';
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
    icon: 'alarm',
    label: 'Alarm Only',
    detail: 'Rings at a set time, and you can dismiss it on screen.',
    mode: 'open',
    rings: true,
    needsTag: false,
  },
  {
    value: 'scan',
    icon: 'scan',
    label: 'Scan Knowt',
    detail: 'No alarm and no schedule. Scan its tag whenever you pass it.',
    mode: 'strict',
    rings: false,
    needsTag: false,
  },
  {
    value: 'both',
    icon: 'scan',
    label: 'Scan + Alarm',
    detail: 'Rings at a set time, and keeps ringing until you scan its tag.',
    mode: 'strict',
    rings: true,
    needsTag: true,
  },
];

export function stopChoice(value: StopChoice) {
  return STOP_CHOICES.find((choice) => choice.value === value) as
    (typeof STOP_CHOICES)[number];
}

/**
 * Which button a stored Knowt is on.
 *
 * Scan-only is asked first, because it is the one the mode cannot answer: a
 * scan-only Knowt stores `strict` once a tag is attached and `open` before
 * that, and either way it has no schedule, which is what decides this.
 */
export function stopChoiceOf(knowt: {
  mode: KnowtMode;
  schedules: readonly ScheduleRow[];
}): StopChoice {
  if (isScanOnly(knowt)) return 'scan';
  return requiresScan(knowt.mode) ? 'both' : 'alarm';
}

/** The label for a stored Knowt, which is what every chip and row shows. */
export function stopLabelOf(knowt: {
  mode: KnowtMode;
  schedules: readonly ScheduleRow[];
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
