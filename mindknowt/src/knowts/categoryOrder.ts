/**
 * The order categories appear in, which is the order of the filter strip on
 * Knowts and of every category list in the app.
 *
 * `categories.sort` has existed since the first schema and `listCategories`
 * has always ordered by it, but nothing ever wrote it, so every category
 * shipped with sort 0 and the list fell through to ordering by name. This is
 * the part that writes it.
 *
 * Pure, and takes the list already loaded, so the moves can be asserted
 * without a database.
 */
import type { CategoryRow } from '../db/types';

export type Move = 'up' | 'down';

/**
 * The list with one category moved one place.
 *
 * Moving the first one up or the last one down returns the list unchanged
 * rather than wrapping. Wrapping would mean a control that looks like it did
 * nothing has in fact sent the category to the far end.
 */
export function moveCategory(
  categories: CategoryRow[],
  id: string,
  move: Move,
): CategoryRow[] {
  const from = categories.findIndex((category) => category.id === id);
  if (from === -1) return categories;

  const to = move === 'up' ? from - 1 : from + 1;
  if (to < 0 || to >= categories.length) return categories;

  const next = [...categories];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as CategoryRow);
  return next;
}

/** Whether a control should be drawn at all, so an end category has one. */
export function canMove(
  categories: CategoryRow[],
  id: string,
  move: Move,
): boolean {
  const at = categories.findIndex((category) => category.id === id);
  if (at === -1) return false;
  return move === 'up' ? at > 0 : at < categories.length - 1;
}

/**
 * The `sort` value each category should be stored with, given an order.
 *
 * Dense and zero based, rewritten in full on every move rather than nudged.
 * Nudging one row's number is how two categories end up sharing a sort value,
 * and once they do, their order is whatever the secondary sort says, which
 * looks to the person like the move did not take.
 */
export function sortValues(categories: CategoryRow[]): Map<string, number> {
  return new Map(categories.map((category, index) => [category.id, index]));
}

/**
 * True when the stored order already matches this one, so a no-op move does
 * not write to the database.
 */
export function orderMatches(categories: CategoryRow[]): boolean {
  return categories.every((category, index) => category.sort === index);
}
