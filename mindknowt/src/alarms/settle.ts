/**
 * Awaits work that must not be able to strand its caller.
 *
 * Both halves of this matter, and both of them are why the Ringing screen
 * stayed up after Done. A rejection is returned rather than thrown, so a
 * caller cannot forget to catch one. And a promise that never settles is given
 * up on, because `await` on one is indistinguishable from a hang: the
 * completion was already written, the alarm bookkeeping that runs after it sat
 * on an unresolved native promise, and the line that closed the screen was
 * behind it with nothing left to report.
 *
 * The timeout is not a retry and not a repair. It is a promise that the caller
 * gets an answer, so the screen can always move on and say what failed.
 */
export type Settled<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown; timedOut: boolean };

/**
 * Long enough that a slow device is not called a failure, short enough that a
 * person holding a ringing phone is not left looking at it.
 */
export const ALARM_CALL_TIMEOUT_MS = 8_000;

export async function settled<T>(
  work: Promise<T>,
  timeoutMs: number = ALARM_CALL_TIMEOUT_MS,
): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const expiry = new Promise<Settled<T>>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          ok: false,
          timedOut: true,
          error: new Error(`Timed out after ${timeoutMs}ms.`),
        }),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([
      work.then(
        (value): Settled<T> => ({ ok: true, value }),
        (error): Settled<T> => ({ ok: false, error, timedOut: false }),
      ),
      expiry,
    ]);
  } finally {
    // Cleared whichever side won, or the timer holds the process open and a
    // test run never exits.
    if (timer) clearTimeout(timer);
  }
}

/** The error's class and message, never the bare string `"Error"`. */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.constructor?.name || err.name || 'Error';
    return err.message ? `${name}: ${err.message}` : name;
  }
  return String(err);
}
