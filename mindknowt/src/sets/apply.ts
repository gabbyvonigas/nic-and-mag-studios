import bundled from '../../assets/starter-sets.json';

import {
  addSchedule,
  createKnowt,
  findCategoryByKey,
  listKnowts,
  toISODate,
} from '../db';
import { parseStarterSets } from './parse';
import type { StarterKnowt, StarterSet } from './types';

const parsed = parseStarterSets(bundled);

export function listSets(): StarterSet[] {
  return parsed.sets;
}

/** Content problems, surfaced on the Dev screen so typos are visible. */
export function setContentErrors(): string[] {
  return parsed.errors;
}

export function getSet(setId: string): StarterSet | null {
  return parsed.sets.find((s) => s.id === setId) ?? null;
}

export type SetEntryPreview = {
  knowt: StarterKnowt;
  /** Name of an existing knowt this would duplicate, if any. */
  duplicateOf: string | null;
};

export type SetPreview = {
  set: StarterSet;
  entries: SetEntryPreview[];
};

/**
 * Spec section 6: applying a set that would create duplicates flags matches by
 * name so they can be deselected before anything is created.
 */
export async function previewSet(setId: string): Promise<SetPreview | null> {
  const set = getSet(setId);
  if (!set) return null;

  const existing = await listKnowts();
  const byName = new Map(existing.map((k) => [k.name.trim().toLowerCase(), k.name]));

  return {
    set,
    entries: set.knowts.map((knowt) => ({
      knowt,
      duplicateOf: byName.get(knowt.name.trim().toLowerCase()) ?? null,
    })),
  };
}

/**
 * Creates real knowts from a set. Everything is created Open — Strict and Soft
 * need a tag, and these have none yet — with the set's suggestion stored for
 * when a tag is attached.
 */
export async function applySet(
  setId: string,
  names: string[],
): Promise<{ created: number }> {
  const set = getSet(setId);
  if (!set) return { created: 0 };

  const wanted = new Set(names.map((n) => n.trim().toLowerCase()));
  const chosen = set.knowts.filter((k) => wanted.has(k.name.trim().toLowerCase()));

  // Schedules that count from a start date anchor to the day the set is applied.
  const startDate = toISODate(new Date());
  let created = 0;

  for (const knowt of chosen) {
    const category = await findCategoryByKey(knowt.category);

    const knowtId = await createKnowt({
      name: knowt.name,
      icon: knowt.icon ?? undefined,
      mode: 'open',
      suggestedMode: knowt.suggestedMode,
      categoryId: category?.id ?? null,
      locationNote: knowt.locationNote,
      notes: knowt.notes,
    });

    for (const schedule of knowt.schedules) {
      const anchored =
        schedule.repeat === 'interval' ||
        schedule.repeat === 'supply' ||
        schedule.repeat === 'once';

      await addSchedule(knowtId, {
        label: schedule.label,
        time: schedule.time,
        repeatType: schedule.repeat,
        daysOfWeek: schedule.daysOfWeek,
        intervalDays: schedule.intervalDays,
        supplyDays: schedule.supplyDays,
        leadDays: schedule.leadDays,
        startDate: anchored ? startDate : undefined,
      });
    }

    created += 1;
  }

  return { created };
}
