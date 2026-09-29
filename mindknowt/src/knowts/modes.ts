import type { KnowtMode } from '../db/types';

/**
 * The two ways a knowt can be finished.
 *
 * There used to be three. Soft meant "has a tag but can be dismissed", which
 * is Alarm Only with a tag attached, so migration 6 collapsed it. Every screen
 * reads its labels from here so the rename cannot drift between them, and so a
 * database row still holding the retired value is never rendered as a blank.
 */

/** The values a person can now choose. */
export type ModeChoice = Extract<KnowtMode, 'strict' | 'open'>;

export const MODE_CHOICES: {
  value: ModeChoice;
  label: string;
  detail: string;
}[] = [
  {
    value: 'strict',
    label: 'Scan Knowt',
    detail: 'Keeps ringing until you scan its tag.',
  },
  {
    value: 'open',
    label: 'Alarm Only',
    detail: 'Rings, and you can dismiss it without a tag.',
  },
];

/** Whether finishing this knowt requires the tag. Only Scan Knowt does. */
export function requiresScan(mode: KnowtMode): boolean {
  return mode === 'strict';
}

/** The choice a stored mode maps to. The retired value reads as Alarm Only. */
export function modeChoice(mode: KnowtMode): ModeChoice {
  return mode === 'strict' ? 'strict' : 'open';
}

export function modeLabel(mode: KnowtMode): string {
  return modeChoice(mode) === 'strict' ? 'Scan Knowt' : 'Alarm Only';
}

/**
 * Whether scanning is offered at all. An Alarm Only knowt that happens to
 * carry a tag can still be scanned by choice; it just is not required.
 */
export function canScan(mode: KnowtMode, tagUid: string | null): boolean {
  return requiresScan(mode) || !!tagUid;
}
