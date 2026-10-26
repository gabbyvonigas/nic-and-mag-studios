/**
 * Whether answering the alarm should close the ringing screen.
 *
 * Its own file because this one decision is what the screen got wrong. The
 * Ringing screen is a full screen modal with `gestureEnabled: false`, so a
 * handler deciding not to leave is a dead end with no way off it, and that is
 * exactly what Done did: it completed the Knowt and left the screen standing.
 *
 * The cause was sequencing. `leave()` was the last statement after an unbroken
 * chain of awaits that ran through the alarm module, every one of them after
 * the completion had already been written. A rejected native call skipped the
 * line that closed the screen, and the call sites discard the rejection with
 * `void`, so nothing threw, nothing logged and nothing on screen changed. A
 * native promise that never settled did the same and looked like a hang.
 *
 * So there are exactly two ways not to leave, and both of them are the action
 * saying so: a wrong tag, or a snooze AlarmKit refused. Those have already put
 * a message on the screen. Everything else leaves, including a throw, because
 * being trapped here is a worse failure than an action whose bookkeeping went
 * wrong.
 */
export async function shouldLeaveAfter(
  run: () => Promise<boolean | void>,
): Promise<boolean> {
  try {
    return (await run()) !== false;
  } catch {
    return true;
  }
}
