/**
 * What Daily says about how a day is going.
 *
 * The rule the product turns on: yesterday happened, here's today. There are
 * no streaks, and nothing here is allowed to read as a scold. A day with
 * nothing done yet is not a failure, it is a day with nothing done yet, and a
 * day in the past is finished and says so plainly rather than being graded.
 *
 * Pure, so the copy can be asserted off device. That matters more here than
 * anywhere else in the app: a tone rule nobody checks is a tone rule that
 * drifts one commit at a time.
 */

export type DayStance = 'past' | 'today' | 'future';

export function stanceFor(offsetDays: number): DayStance {
  if (offsetDays < 0) return 'past';
  if (offsetDays > 0) return 'future';
  return 'today';
}

/** The "3 of 5 knowts complete" line, or its equivalent when there are none. */
export function progressCount(done: number, total: number): string {
  if (total === 0) return 'Nothing scheduled';
  return `${done} of ${total} Knowt${total === 1 ? '' : 's'} complete`;
}

/**
 * The line under it. Adapts to the state of the day rather than saying the
 * same thing regardless, and never implies the person is behind.
 */
export function progressLine(
  done: number,
  total: number,
  stance: DayStance = 'today',
): string {
  if (total === 0) {
    if (stance === 'past') return 'A clear day.';
    if (stance === 'future') return 'Nothing on this one yet.';
    return 'Nothing on today. Add something if you want to.';
  }

  if (stance === 'future') {
    return `${total} waiting on this day.`;
  }

  if (stance === 'past') {
    if (done === total) return 'All of it got done.';
    if (done === 0) return 'None of these got picked up.';
    return `${done} of them got done.`;
  }

  if (done === 0) return 'Ready when you are.';
  if (done === total) return "That's everything for today.";
  if (done === 1) return 'One down.';
  return 'Going well.';
}

/**
 * Whether Daily should show what is coming next.
 *
 * Only on today: a day in the past is finished and a day in the future is not
 * the day you are on, so in both cases "next" would mean something different
 * from what the section shows. A day with nothing scheduled gets the invitation
 * to add one instead, because showing tomorrow to someone who has nothing today
 * buries the only useful control.
 *
 * It used to also require today to be clear, which is what made the section
 * look deleted: on any day with something still to do it never rendered. The
 * section is faded and collapsed, so it costs a line and reads as reference
 * rather than as work, and it sits below the day's list for the same reason.
 */
export function showUpcoming({
  total,
  stance,
  upcomingCount,
}: {
  total: number;
  stance: DayStance;
  upcomingCount: number;
}): boolean {
  if (stance !== 'today') return false;
  if (total === 0) return false;
  return upcomingCount > 0;
}
