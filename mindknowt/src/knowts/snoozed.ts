/**
 * What is snoozed right now, for the section under Daily's week strip.
 *
 * A snoozed knowt vanishes from the list until it rings again, which left no
 * way to see that it had been snoozed at all, or how long was left. This is the
 * state behind that section.
 *
 * "Right now" is the whole idea, so this is keyed on the clock rather than on
 * the day being viewed. A countdown shown against a day in the past or the
 * future would be counting down to something that has nothing to do with the
 * day on screen.
 *
 * Pure, and takes its rows already loaded, so the countdown boundaries can be
 * asserted without a database or a device clock.
 */
import { durationLabel } from '../history/periodLabels';
import type { KnowtWithDetail, PendingAlarmRow } from '../db/types';

export type SnoozedEntry = {
  knowt: KnowtWithDetail;
  /** When it rings again. */
  firesAt: number;
  /** Minutes from now until then. Fractional, so the label can round once. */
  minutesLeft: number;
};

/**
 * The knowts currently sitting under a snooze, soonest first.
 *
 * A snooze that has already come due is not snoozed any more, whether or not
 * anything has picked it up yet, so `fires_at` in the past drops out. Only the
 * soonest alarm per knowt is kept: two snoozes on one knowt is one snoozed
 * knowt, and listing it twice would read as two things to do.
 */
export function buildSnoozed({
  alarms,
  knowts,
  now,
}: {
  alarms: PendingAlarmRow[];
  knowts: KnowtWithDetail[];
  now: number;
}): SnoozedEntry[] {
  const byId = new Map(knowts.map((knowt) => [knowt.id, knowt]));
  const soonest = new Map<string, number>();

  for (const alarm of alarms) {
    if (alarm.kind !== 'snooze') continue;
    if (alarm.fires_at <= now) continue;
    if (!byId.has(alarm.knowt_id)) continue;

    const held = soonest.get(alarm.knowt_id);
    if (held === undefined || alarm.fires_at < held) {
      soonest.set(alarm.knowt_id, alarm.fires_at);
    }
  }

  return [...soonest.entries()]
    .map(([knowtId, firesAt]) => ({
      knowt: byId.get(knowtId) as KnowtWithDetail,
      firesAt,
      minutesLeft: (firesAt - now) / 60_000,
    }))
    .sort((a, b) => a.firesAt - b.firesAt);
}

/**
 * The time remaining, as the row says it.
 *
 * Phrased as when it comes back rather than how long it was put off for. The
 * number the person wants is the one they are waiting on, and "snoozed for 30
 * minutes" is a fact about the past.
 */
export function snoozeCountdown(minutesLeft: number): string {
  if (minutesLeft <= 0) return 'Ringing now';
  const label = durationLabel(minutesLeft);
  if (label === 'Under a minute') return 'Back in under a minute';
  return `Back in ${label}`;
}

/**
 * Whether the section appears at all.
 *
 * It is absent, not empty, when nothing is snoozed: a heading over no rows is
 * a worse answer than no heading. It is also absent on any day but today,
 * because the countdown is against the clock, not against the day on screen.
 *
 * A snooze taken late at night can come due after midnight. That knowt is still
 * snoozed right now, so it belongs in today's section even though it fires
 * tomorrow. Keying on the clock rather than on the firing date is what makes
 * that fall out correctly.
 */
export function showSnoozed({
  count,
  stance,
}: {
  count: number;
  stance: 'past' | 'today' | 'future';
}): boolean {
  return stance === 'today' && count > 0;
}
