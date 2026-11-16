/**
 * What the Knowts list is currently showing.
 *
 * Categories were the only filter, held as `string | null`. Log's two gap
 * cards navigate into this screen with something that is not a category, so
 * the filter became a shape rather than an id: "no schedule" and "no category"
 * are not the absence of a filter, and encoding either as null would have made
 * them mean All.
 *
 * Pure, and takes its knowts already loaded.
 */
import type { CategoryRow, KnowtWithDetail } from '../db/types';

export type KnowtFilter =
  | { kind: 'all' }
  | { kind: 'category'; categoryId: string }
  /** Knowts that will never ring, because nothing is set to ring them. */
  | { kind: 'no-schedule' }
  /** Knowts with no tag, so nothing to scan. */
  | { kind: 'no-tag' };

/**
 * Whether a knowt will ever ring.
 *
 * A disabled schedule is a row that exists and will never fire, which is the
 * state the card is pointing at, so it does not count. Counting it would send
 * someone to a knowt that looks set up and is not.
 */
export function hasLiveSchedule(knowt: KnowtWithDetail): boolean {
  return knowt.schedules.some((schedule) => schedule.enabled === 1);
}

/** A cleared tag leaves an empty string behind, which is not a tag. */
export function hasTag(knowt: KnowtWithDetail): boolean {
  return typeof knowt.tag_uid === 'string' && knowt.tag_uid.length > 0;
}

export function applyFilter(
  knowts: KnowtWithDetail[],
  filter: KnowtFilter,
): KnowtWithDetail[] {
  switch (filter.kind) {
    case 'all':
      return knowts;
    case 'category':
      return knowts.filter(
        (knowt) => knowt.category?.id === filter.categoryId,
      );
    case 'no-schedule':
      return knowts.filter((knowt) => !hasLiveSchedule(knowt));
    case 'no-tag':
      return knowts.filter((knowt) => !hasTag(knowt));
  }
}

export function countWithoutSchedule(knowts: KnowtWithDetail[]): number {
  return knowts.filter((knowt) => !hasLiveSchedule(knowt)).length;
}

export function countWithoutTag(knowts: KnowtWithDetail[]): number {
  return knowts.filter((knowt) => !hasTag(knowt)).length;
}

/**
 * What the active filter is called, for the chip and the empty state.
 *
 * A category that has since been deleted reads as All, because that is what
 * the list is in fact showing once its filter matches nothing it can name.
 */
export function filterLabel(
  filter: KnowtFilter,
  categories: CategoryRow[],
): string {
  if (filter.kind === 'no-schedule') return 'No schedule';
  if (filter.kind === 'no-tag') return 'No tag';
  if (filter.kind === 'category') {
    return (
      categories.find((category) => category.id === filter.categoryId)?.name ??
      'All'
    );
  }
  return 'All';
}

/** True when two filters select the same thing, for toggling a chip off. */
export function sameFilter(a: KnowtFilter, b: KnowtFilter): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'category' && b.kind === 'category') {
    return a.categoryId === b.categoryId;
  }
  return true;
}
