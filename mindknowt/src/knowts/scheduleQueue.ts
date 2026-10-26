/**
 * Taking several new Knowts through the schedule screen, one at a time.
 *
 * Adding a preset used to drop you on the Knowts list with nothing to show for
 * it, because the Knowts were created as drafts and the list hides drafts. They
 * are real Knowts now, and this is the run that asks for a time for each one
 * straight afterwards.
 *
 * One at a time with a counter, rather than a single screen holding three time
 * pickers: the time is the one decision this app refuses to guess, and three of
 * them stacked on one screen is where people start picking anything to get
 * past it. The counter is there so the run has a visible end.
 *
 * Pure, so every exit from the run can be asserted: finishing it, skipping an
 * item, and backing out of it.
 */

export type QueueStep = {
  knowtId: string;
  /** Still to go after this one. */
  queue: string[];
  step: { index: number; total: number };
};

/**
 * Where the run starts, or null when there is nothing to schedule.
 *
 * One Knowt is still a run of one. It just never shows a counter, because
 * "1 of 1" is noise.
 */
export function startQueue(knowtIds: readonly string[]): QueueStep | null {
  const [first, ...rest] = knowtIds;
  if (!first) return null;
  return {
    knowtId: first,
    queue: rest,
    step: { index: 1, total: knowtIds.length },
  };
}

/**
 * The next screen in the run, or null when it is over.
 *
 * Called the same way whether the time was saved or skipped: both move on, and
 * skipping simply leaves the Knowt without a schedule, which is a state the app
 * already shows.
 */
export function advanceQueue(params: {
  queue?: readonly string[];
  step?: { index: number; total: number };
}): QueueStep | null {
  const queue = params.queue ?? [];
  const [next, ...rest] = queue;
  if (!next) return null;

  const total = params.step?.total ?? queue.length + 1;
  const index = (params.step?.index ?? 1) + 1;
  return { knowtId: next, queue: rest, step: { index, total } };
}

/** Whether to draw the counter at all. A run of one does not need one. */
export function showStepCounter(step?: { index: number; total: number }): boolean {
  return !!step && step.total > 1;
}

/** "2 of 3". */
export function stepLabel(step: { index: number; total: number }): string {
  return `${step.index} of ${step.total}`;
}
