/**
 * The text on the Lock Screen banner.
 *
 * AlarmKit draws that banner and `AlarmPresentation.Alert` takes exactly one
 * string for it: `Alert(title:stopButton:secondaryButton:secondaryButtonBehavior:)`.
 * There is no subtitle and no body, so anything beyond the Knowt's name has to
 * share that one line with it.
 *
 * Which is why the name comes first and the time comes last. The system
 * truncates the tail, so a long name costs the time rather than the other way
 * around, and the name is the thing the person needs to read.
 *
 * Pure on purpose: this is the only part of the banner that can be checked
 * without a device.
 */

/** Separator rather than a dash, because a dash in a name would read as one. */
const JOIN = ' · ';

export function bannerTitle(name: string, timeLabel?: string | null): string {
  const task = name.trim();
  const when = timeLabel?.trim();
  if (!task) return when ?? '';
  if (!when) return task;
  return `${task}${JOIN}${when}`;
}

/**
 * What the snooze button says.
 *
 * AlarmKit takes a label on the secondary button as well as an SF Symbol, so
 * the zzz glyph does not have to carry the meaning on its own. The number is
 * the same one handed to the countdown, so the button cannot promise a length
 * the system is not going to use.
 */
export function snoozeLabel(minutes: number): string {
  const safe =
    Number.isFinite(minutes) && minutes >= 1 ? Math.round(minutes) : null;
  return safe === null ? 'Snooze' : `Snooze ${safe} min`;
}

/**
 * What the stop button says. The only place the banner can state that a tag is
 * needed, because the button's SF Symbol is `stop.circle` in the module's own
 * source and is not passed from JavaScript.
 */
export function stopLabel(requiresScan?: boolean): string {
  return requiresScan ? 'Scan to stop' : 'Done';
}

/** The default the module falls back to when no length is handed over. */
export const MODULE_DEFAULT_SNOOZE_MINUTES = 9;
