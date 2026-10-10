/**
 * The live line on a Daily card: done, snoozed, ringing again, or nothing.
 *
 * Pure, and separate from the screen, because this is the thing that was
 * reported broken. A snoozed Knowt showed nothing at all on Daily, and a rule
 * that lives inside a component is a rule nobody can assert.
 *
 * It takes `now` rather than reading the clock, so the boundary where a snooze
 * stops being a snooze can be tested instead of waited for.
 */
import type { PendingAlarmRow } from '../db/types';

export type CardStatus = {
  /** What the row says. */
  text: string;
  /** Which glyph goes with it, by name in the shared icon set. */
  icon: 'check' | 'snooze' | 'ringing' | 'test';
};

/**
 * A pending alarm counts only while it is still ahead of now.
 *
 * `listPendingAlarms` already filters on the clock, but it is read once per
 * screen focus and the card has to stop saying "Snoozed until 1:25 pm" at
 * 1:25 pm, not at the next time someone opens the tab.
 */
function stillAhead(pending: PendingAlarmRow | null, now: number): boolean {
  return !!pending && pending.fires_at > now;
}

export function cardStatus(
  card: { completedAt: number | null; pending: PendingAlarmRow | null },
  now: number,
  clock: (at: number) => string,
): CardStatus | null {
  // Done wins over everything. A Knowt that was snoozed and then completed is
  // completed, and the snooze is history.
  if (card.completedAt !== null) {
    return { text: `Done at ${clock(card.completedAt)}`, icon: 'check' };
  }

  if (!stillAhead(card.pending, now)) return null;
  const pending = card.pending as PendingAlarmRow;

  switch (pending.kind) {
    case 'snooze':
      return { text: `Snoozed until ${clock(pending.fires_at)}`, icon: 'snooze' };
    case 'refire':
      return { text: `Rings again at ${clock(pending.fires_at)}`, icon: 'ringing' };
    case 'test':
      return { text: `Test alarm at ${clock(pending.fires_at)}`, icon: 'test' };
    default:
      // A scheduled alarm says nothing new: the card already shows its time.
      return null;
  }
}
