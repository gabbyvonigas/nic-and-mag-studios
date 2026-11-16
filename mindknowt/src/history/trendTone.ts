/**
 * Which bar of the Completion trend is colored.
 *
 * Color marks which day is today, and nothing else. It is deliberately not a
 * reading of how much got done: the height already says that, and coloring the
 * busiest bar would turn a chart into a scoreboard. A day with nothing done is
 * still today, and a day that went well three weeks ago is still gray.
 */
export type TrendTone = 'today' | 'other';

export function trendTone(bucket: { current: boolean }): TrendTone {
  return bucket.current ? 'today' : 'other';
}
