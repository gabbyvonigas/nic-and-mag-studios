/**
 * The one line under Completion by category.
 *
 * Not a feed. Exactly one insight shows, or none, and none is the normal state
 * early on. Everything here is pure so the gating can be tested off device,
 * which matters more than usual: an insight engine that fires on thin data
 * produces confident nonsense, and nonsense about someone's habits reads worse
 * than silence.
 *
 * Two rules shape all of it. Nothing surfaces without enough behind it, and a
 * suggestion is always about a knowt rather than about the person: "Workout
 * might work better at a different time", never "you keep missing this".
 */

/** Completions a knowt or a pattern needs before anything is said about it. */
export const MIN_COMPLETIONS = 6;

/** A weekday claim needs to have seen the weekday a few times over. */
export const MIN_WEEKS_FOR_WEEKDAY = 3;

/** The window an override ratio is read over, and the least that counts. */
export const OVERRIDE_WINDOW = 5;
export const MIN_OVERRIDES = 3;

export type InsightTone = 'positive' | 'adjustment';

export type InsightKind =
  | 'time-of-day'
  | 'day-of-week'
  | 'tag-attached'
  | 'override-frequency';

export type Insight = {
  kind: InsightKind;
  tone: InsightTone;
  text: string;
  /** 0 to 1. Only used to choose between candidates. */
  confidence: number;
  /** Adjustment insights carry their fix, so the line is not just a verdict. */
  action?: { kind: 'adjust-time'; knowtId: string; knowtName: string };
};

/** One resolved event, flattened to what the rules actually read. */
export type InsightEvent = {
  knowtId: string;
  knowtName: string;
  hasTag: boolean;
  /** Null when it was never completed, which is what a miss is. */
  completedAt: number | null;
  method: 'scan' | 'tap' | 'override' | null;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function completionsOf(events: InsightEvent[]): InsightEvent[] {
  return events.filter((event) => event.completedAt !== null);
}

/**
 * When things actually get done. Needs one part of the day to be genuinely
 * ahead, not just first past the post: half of everything, and clearly more
 * than the runner up, or the claim is noise dressed as a finding.
 */
function timeOfDay(events: InsightEvent[]): Insight | null {
  const done = completionsOf(events);
  if (done.length < MIN_COMPLETIONS) return null;

  const tally = { morning: 0, afternoon: 0, evening: 0 };
  for (const event of done) {
    tally[partOfDay(new Date(event.completedAt as number).getHours())] += 1;
  }

  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const [topName, topCount] = ranked[0] as [string, number];
  const runnerUp = (ranked[1]?.[1] ?? 0) as number;
  const share = topCount / done.length;

  if (share < 0.5) return null;
  if (runnerUp > 0 && topCount < runnerUp * 1.5) return null;

  return {
    kind: 'time-of-day',
    tone: 'positive',
    text: `${topName[0]!.toUpperCase()}${topName.slice(1)}s are when these get done.`,
    confidence: share,
  };
}

/**
 * The strongest weekday. Needs three weeks of history, because a claim about
 * Tuesdays made from two Tuesdays is a claim about two days.
 */
function dayOfWeek(events: InsightEvent[], now: Date): Insight | null {
  const done = completionsOf(events);
  if (done.length < MIN_COMPLETIONS) return null;

  const earliest = Math.min(...done.map((event) => event.completedAt as number));
  const weeks = (now.getTime() - earliest) / (DAY_MS * 7);
  if (weeks < MIN_WEEKS_FOR_WEEKDAY) return null;

  const tally = [0, 0, 0, 0, 0, 0, 0];
  for (const event of done) {
    tally[new Date(event.completedAt as number).getDay()] += 1;
  }

  const best = Math.max(...tally);
  const mean = done.length / 7;
  if (best < mean * 1.5) return null;

  const index = tally.indexOf(best);
  return {
    kind: 'day-of-week',
    tone: 'positive',
    text: `${WEEKDAYS[index]} is the day that goes best.`,
    confidence: Math.min(1, best / done.length),
  };
}

/**
 * Whether the tag is doing its job. Both sides need enough behind them, or
 * this compares a habit against a rounding error.
 */
function tagAttached(events: InsightEvent[]): Insight | null {
  const tagged = events.filter((event) => event.hasTag);
  const untagged = events.filter((event) => !event.hasTag);
  if (tagged.length < MIN_COMPLETIONS || untagged.length < MIN_COMPLETIONS) {
    return null;
  }

  const rate = (list: InsightEvent[]) =>
    completionsOf(list).length / list.length;
  const gap = rate(tagged) - rate(untagged);
  if (gap < 0.15) return null;

  return {
    kind: 'tag-attached',
    tone: 'positive',
    text: 'Knowts with a tag attached get finished more often.',
    confidence: Math.min(1, gap * 2),
  };
}

/**
 * The one adjustment insight. A real ratio only: three of the last five or
 * more, never one of two, and it names the knowt rather than the person.
 *
 * Only the single strongest candidate is ever returned, so several knowts
 * qualifying cannot turn into several lines.
 */
function overrideFrequency(events: InsightEvent[]): Insight | null {
  const byKnowt = new Map<string, InsightEvent[]>();
  for (const event of events) {
    const list = byKnowt.get(event.knowtId);
    if (list) list.push(event);
    else byKnowt.set(event.knowtId, [event]);
  }

  let best: Insight | null = null;

  for (const [knowtId, list] of byKnowt) {
    // Most recent first, then the window. An old habit that was fixed months
    // ago should not keep being reported.
    const recent = [...list]
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, OVERRIDE_WINDOW);
    if (recent.length < OVERRIDE_WINDOW) continue;

    const overrides = recent.filter((event) => event.method === 'override');
    if (overrides.length < MIN_OVERRIDES) continue;

    const ratio = overrides.length / recent.length;
    const name = recent[0]!.knowtName;
    const candidate: Insight = {
      kind: 'override-frequency',
      tone: 'adjustment',
      text: `${name} might work better at a different time.`,
      confidence: ratio,
      action: { kind: 'adjust-time', knowtId, knowtName: name },
    };
    if (!best || candidate.confidence > best.confidence) best = candidate;
  }

  return best;
}

/**
 * Everything that currently qualifies, best first. Exported for the tests and
 * for nothing else: the app shows one line, and that is `pickInsight`.
 */
export function candidateInsights(
  events: InsightEvent[],
  now: Date,
): Insight[] {
  const found = [
    timeOfDay(events),
    dayOfWeek(events, now),
    tagAttached(events),
    overrideFrequency(events),
  ].filter((insight): insight is Insight => insight !== null);

  return found.sort((a, b) => b.confidence - a.confidence);
}

/**
 * The one to show, or none.
 *
 * Positive first, always. An adjustment only surfaces when nothing encouraging
 * qualifies, which is what stops the Log turning into a list of corrections on
 * a week that happened to go badly.
 */
export function pickInsight(
  events: InsightEvent[],
  now: Date,
): Insight | null {
  const candidates = candidateInsights(events, now);
  const positive = candidates.filter((insight) => insight.tone === 'positive');
  if (positive.length > 0) return positive[0] ?? null;
  return candidates.find((insight) => insight.tone === 'adjustment') ?? null;
}
