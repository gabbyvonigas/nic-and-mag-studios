/**
 * Where a swiped row settles, and how wide the action behind it is.
 *
 * Pure, so the thresholds can be asserted without a gesture. The rule the
 * component turns on: a half hearted swipe must never leave a row in a state
 * nobody asked for.
 */

export const ACTION_WIDTH = 96;

/** Past halfway it settles open, otherwise it springs shut. */
const OPEN_AT = ACTION_WIDTH / 2;

/** How far the row may be dragged, given where it started. */
export function dragTo(startOpen: boolean, dx: number): number {
  const base = startOpen ? -ACTION_WIDTH : 0;
  // Left only, and no further than the button is wide. Without the clamp a
  // hard swipe drags the row clean off the screen.
  return Math.min(0, Math.max(-ACTION_WIDTH, base + dx));
}

/** Where it lands once the finger lifts. */
export function settleTo(startOpen: boolean, dx: number): number {
  const base = startOpen ? -ACTION_WIDTH : 0;
  return base + dx < -OPEN_AT ? -ACTION_WIDTH : 0;
}

/**
 * Whether a gesture is a row swipe or the list scrolling through it.
 *
 * Biased toward the list: a drag has to be clearly horizontal before the row
 * takes it, because a row that grabs an ambiguous gesture makes the whole
 * screen feel like it is fighting the finger.
 */
export function isHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5;
}
