/**
 * Which swiped row is open, so only ever one is.
 *
 * A list where two rows sit open at once reads as broken, and a row that stays
 * open after you have moved on to another is in the way. Module state rather
 * than context: there is one list on screen at a time, the rows do not need to
 * re-render when a sibling opens, and threading a provider through for this
 * would be more machinery than the rule is worth.
 *
 * Pure and exported so the rule can be asserted without a gesture.
 */

type Closer = () => void;

let openRow: Closer | null = null;

/** Opens one row, closing whichever was open before. */
export function claimOpen(closer: Closer): void {
  if (openRow && openRow !== closer) openRow();
  openRow = closer;
}

/** Gives up the claim, if this row still holds it. */
export function releaseOpen(closer: Closer): void {
  if (openRow === closer) openRow = null;
}

/** Closes whatever is open. For leaving a screen. */
export function closeAnyOpen(): void {
  const current = openRow;
  openRow = null;
  current?.();
}

/** Whether anything is open at all. */
export function hasOpenRow(): boolean {
  return openRow !== null;
}
