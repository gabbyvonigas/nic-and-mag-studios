/**
 * Which category a preset list belongs to.
 *
 * A set is a list of knowts, each naming its own category, and almost every
 * shipped set names one throughout. Three do not: morning essentials spans
 * three, and prescriptions and medical spans two. So the set's category is the
 * one most of its knowts carry rather than whichever happens to come first,
 * and a tie goes to the earlier one so the answer never depends on map order.
 *
 * Pure, because it decides what an "Add a custom knowt to Home" row says and
 * which category that knowt lands in, and both are wrong in a way nobody would
 * notice if this drifted.
 */
import type { StarterSet } from './types';

export function setCategoryKey(set: StarterSet): string | null {
  const counts = new Map<string, number>();
  for (const knowt of set.knowts) {
    const key = knowt.category?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  // Insertion order is the order the knowts are listed, so the first-seen
  // category wins a tie without needing a separate index.
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return best;
}
