import type { KnowtMode, RepeatType } from '../db';

/**
 * Shapes for `assets/starter-sets.json`. Content ships as bundled JSON so new
 * sets are a content edit rather than a code change — spec section 4.2.
 */

export type StarterSchedule = {
  label: string | null;
  time: string;
  repeat: RepeatType;
  daysOfWeek?: number[];
  intervalDays?: number;
  supplyDays?: number;
  leadDays?: number;
};

export type StarterKnowt = {
  name: string;
  category: string;
  icon: string | null;
  /** Applied when a tag is attached, never at creation time. */
  suggestedMode: KnowtMode | null;
  locationNote: string | null;
  notes: string | null;
  schedules: StarterSchedule[];
};

export type StarterSet = {
  id: string;
  name: string;
  description: string;
  knowts: StarterKnowt[];
};

export type ParseResult = {
  sets: StarterSet[];
  /** Every problem found, so bad content fails loudly rather than silently. */
  errors: string[];
};
