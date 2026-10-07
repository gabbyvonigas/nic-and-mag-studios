/**
 * How a preset set is presented: which category it is filed under, and the
 * mark that stands for it.
 *
 * Filing is derived from the content by `setCategoryKey`, which counts the
 * categories of the knowts in the set. That is right for most of them and
 * wrong for three, because the per knowt category says where one knowt lives
 * and the set's category is a browsing aid. Vitamins and supplements is filed
 * `daily` by its contents and belongs under Wellness; prescriptions and
 * medical comes out `admin` on a five to three count and belongs under
 * Wellness too; morning essentials comes out `go` and reads as Daily.
 *
 * Those three are listed here rather than fixed in the content, because the
 * content is right about the knowts and only the grouping is in question.
 */
import { setCategoryKey } from './category';
import type { IconName } from '../components/Icon';
import type { StarterSet } from './types';

/** Named overrides. Everything absent is filed by what its knowts say. */
const CATEGORY_OVERRIDES: Record<string, string> = {
  'morning-essentials': 'daily',
  'vitamins-supplements': 'care',
  'prescriptions-medical': 'care',
};

export function presentedCategoryKey(set: StarterSet): string | null {
  return CATEGORY_OVERRIDES[set.id] ?? setCategoryKey(set);
}

/** The mark for a set. Its own, so twenty eight rows can be told apart. */
const SET_ICONS: Record<string, IconName> = {
  'morning-essentials': 'sun',
  'household-maintenance': 'tools',
  'kitchen-food': 'food',
  'trash-recycling': 'trash',
  'cleaning-chores': 'sparkle',
  'vitamins-supplements': 'vitamins',
  'prescriptions-medical': 'medical',
  'post-surgery-recovery': 'recovery',
  'fitness-movement': 'fitness',
  'skincare-beauty': 'water',
  'self-care-wellness': 'heart',
  'mental-health': 'mood',
  pets: 'paw',
  plants: 'leaf',
  finances: 'cash',
  'business-work': 'briefcase',
  errands: 'errand',
  'returns-exchanges': 'returns',
  restocking: 'cart',
  'car-maintenance': 'car2',
  'travel-prep': 'plane',
  'home-safety': 'shield',
  'tech-digital': 'laptop',
  'subscriptions-renewals': 'renew',
  'personal-admin': 'document',
  seasonal: 'snow',
  'seasonal-home-prep': 'thermometer',
  'sports-kids': 'ball',
};

/** A set added later with no mark of its own still gets one. */
export function setIcon(setId: string): IconName {
  return SET_ICONS[setId] ?? 'tray';
}
