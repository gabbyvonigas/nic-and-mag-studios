// Imported from the leaf module rather than the db barrel: validation must not
// depend on the native SQLite stack, so it stays testable off-device.
import { CATEGORY_KEYS } from '../db/categoryKeys';
import type { KnowtMode, RepeatType } from '../db/types';
import type { ParseResult, StarterKnowt, StarterSchedule, StarterSet } from './types';

const REPEATS: RepeatType[] = [
  'daily',
  'weekdays',
  'weekends',
  'days_of_week',
  'interval',
  'supply',
  'once',
];

const MODES: KnowtMode[] = ['strict', 'soft', 'open'];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseSchedule(
  raw: unknown,
  where: string,
  errors: string[],
  notices: string[],
): StarterSchedule | null {
  if (!isRecord(raw)) {
    errors.push(`${where}: schedule must be an object.`);
    return null;
  }

  // Times are collected from the person applying the set, never taken from
  // content, so a time here is reported rather than silently dropped.
  if (raw.time !== undefined) {
    notices.push(`${where}: "time" is ignored. Times are chosen when the set is applied.`);
  }

  const repeat = raw.repeat;
  if (typeof repeat !== 'string' || !REPEATS.includes(repeat as RepeatType)) {
    errors.push(
      `${where}: repeat must be one of ${REPEATS.join(', ')}, got ${JSON.stringify(repeat)}.`,
    );
    return null;
  }

  const schedule: StarterSchedule = {
    label: optionalString(raw.label),
    repeat: repeat as RepeatType,
  };

  if (repeat === 'days_of_week') {
    const days = raw.daysOfWeek;
    if (
      !Array.isArray(days) ||
      days.length === 0 ||
      !days.every((d) => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 7)
    ) {
      errors.push(`${where}: days_of_week needs daysOfWeek as integers 1-7, 1 being Sunday.`);
      return null;
    }
    schedule.daysOfWeek = days as number[];
  }

  if (repeat === 'interval') {
    const days = raw.intervalDays;
    if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) {
      errors.push(`${where}: interval needs a positive whole intervalDays.`);
      return null;
    }
    schedule.intervalDays = days;
  }

  if (repeat === 'supply') {
    const supply = raw.supplyDays;
    if (typeof supply !== 'number' || !Number.isInteger(supply) || supply <= 0) {
      errors.push(`${where}: supply needs a positive whole supplyDays.`);
      return null;
    }
    schedule.supplyDays = supply;

    const lead = raw.leadDays ?? 0;
    if (typeof lead !== 'number' || !Number.isInteger(lead) || lead < 0) {
      errors.push(`${where}: leadDays must be a whole number of days, zero or more.`);
      return null;
    }
    if (lead >= supply) {
      errors.push(`${where}: leadDays (${lead}) must be less than supplyDays (${supply}).`);
      return null;
    }
    schedule.leadDays = lead;
  }

  return schedule;
}

function parseKnowt(
  raw: unknown,
  where: string,
  errors: string[],
  notices: string[],
): StarterKnowt | null {
  if (!isRecord(raw)) {
    errors.push(`${where}: knowt must be an object.`);
    return null;
  }

  const name = optionalString(raw.name);
  if (!name) {
    errors.push(`${where}: name is required.`);
    return null;
  }

  const category = raw.category;
  if (typeof category !== 'string' || !CATEGORY_KEYS.includes(category as never)) {
    errors.push(
      `${where} (${name}): category must be one of ${CATEGORY_KEYS.join(', ')}, got ${JSON.stringify(category)}.`,
    );
    return null;
  }

  const mode = raw.suggestedMode;
  if (mode !== undefined && (typeof mode !== 'string' || !MODES.includes(mode as KnowtMode))) {
    errors.push(
      `${where} (${name}): suggestedMode must be one of ${MODES.join(', ')}.`,
    );
    return null;
  }

  const rawSchedules = raw.schedules ?? [];
  if (!Array.isArray(rawSchedules)) {
    errors.push(`${where} (${name}): schedules must be an array.`);
    return null;
  }

  const schedules: StarterSchedule[] = [];
  rawSchedules.forEach((entry, index) => {
    const parsed = parseSchedule(
      entry,
      `${where} (${name}) schedule ${index + 1}`,
      errors,
      notices,
    );
    if (parsed) schedules.push(parsed);
  });

  return {
    name,
    category,
    icon: optionalString(raw.icon),
    suggestedMode: (mode as KnowtMode | undefined) ?? null,
    locationNote: optionalString(raw.locationNote),
    notes: optionalString(raw.notes),
    schedules,
  };
}

/**
 * Validates bundled content. Content is hand-written, so a typo'd category or
 * repeat type must produce a named error rather than a set that silently
 * creates nothing.
 */
export function parseStarterSets(raw: unknown): ParseResult {
  const errors: string[] = [];
  const notices: string[] = [];

  if (!isRecord(raw) || !Array.isArray(raw.sets)) {
    return {
      sets: [],
      errors: ['starter-sets.json must be an object with a "sets" array.'],
      notices,
    };
  }

  const sets: StarterSet[] = [];
  const seenIds = new Set<string>();

  raw.sets.forEach((entry, index) => {
    const where = `set ${index + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${where}: must be an object.`);
      return;
    }

    const id = optionalString(entry.id);
    const name = optionalString(entry.name);
    const description = optionalString(entry.description);

    if (!id) {
      errors.push(`${where}: id is required.`);
      return;
    }
    if (seenIds.has(id)) {
      errors.push(`${where}: duplicate id "${id}". Ids must be unique and stable.`);
      return;
    }
    seenIds.add(id);

    if (!name) {
      errors.push(`set "${id}": name is required.`);
      return;
    }
    if (!description) {
      errors.push(`set "${id}": description is required.`);
      return;
    }
    if (!Array.isArray(entry.knowts) || entry.knowts.length === 0) {
      errors.push(`set "${id}": knowts must be a non-empty array.`);
      return;
    }

    const knowts: StarterKnowt[] = [];
    entry.knowts.forEach((knowtRaw, knowtIndex) => {
      const parsed = parseKnowt(
        knowtRaw,
        `set "${id}" knowt ${knowtIndex + 1}`,
        errors,
        notices,
      );
      if (parsed) knowts.push(parsed);
    });

    sets.push({ id, name, description, knowts });
  });

  return { sets, errors, notices };
}
