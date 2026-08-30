import { theme } from '../theme';

import { CATEGORY_KEYS, type CategoryKey } from './categoryKeys';

import { clearContent, getDatabase } from './database';
import { newId } from './ids';
import type { KnowtMode, RepeatType } from './types';

/** Shipped categories, spec section 4.1. */
const CATEGORIES = [
  { key: 'home', name: 'Home', color: theme.categoryPalette.home, icon: 'house' },
  { key: 'daily', name: 'Daily', color: theme.categoryPalette.daily, icon: 'sun' },
  { key: 'care', name: 'Care', color: theme.categoryPalette.care, icon: 'heart' },
  { key: 'ritual', name: 'Ritual', color: theme.categoryPalette.ritual, icon: 'sparkle' },
  { key: 'go', name: 'Go', color: theme.categoryPalette.go, icon: 'car' },
  { key: 'admin', name: 'Admin', color: theme.categoryPalette.admin, icon: 'tray' },
] as const;

// Fails to compile if the seeded categories ever drift from the canonical keys.
const _keysMatch: readonly CategoryKey[] = CATEGORIES.map((c) => c.key);
void _keysMatch;

type SeedKnowt = {
  name: string;
  icon: string;
  category: (typeof CATEGORIES)[number]['key'];
  locationNote: string | null;
  notes: string | null;
  schedule: {
    label: string | null;
    time: string;
    repeatType: RepeatType;
    daysOfWeek?: number[];
    intervalDays?: number;
    startDate?: string;
  };
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Example content so the screens are not empty during testing. Every seed is
 * Open mode. Build-order step 3 is Open only, and Open mode is what makes the
 * app usable before any tags arrive. The notes are drawn from the spec's own
 * examples, because the whole point of the notes field is that this is the
 * detail worth having when the alarm goes off months later.
 */
const KNOWTS: SeedKnowt[] = [
  {
    name: 'Vitamins',
    icon: 'pill',
    category: 'daily',
    locationNote: 'Kitchen · medicine shelf',
    notes: '1 scoop, empty stomach, wait 30 min before coffee',
    schedule: { label: 'Morning', time: '08:00', repeatType: 'daily' },
  },
  {
    name: 'Replace air filter',
    icon: 'filter',
    category: 'home',
    locationNote: 'Hallway ceiling vent',
    notes: '20x25x1, MERV 11, Lowe’s',
    schedule: {
      label: null,
      time: '10:00',
      repeatType: 'interval',
      intervalDays: 90,
      startDate: today(),
    },
  },
  {
    name: 'Trash out',
    icon: 'trash',
    category: 'home',
    locationNote: 'Side door',
    notes: 'Recycling every other week',
    schedule: {
      label: 'Night before',
      time: '20:00',
      repeatType: 'days_of_week',
      daysOfWeek: [2],
    },
  },
  {
    name: 'Text Mom happy birthday',
    icon: 'message',
    category: 'admin',
    locationNote: null,
    notes: null,
    schedule: {
      label: null,
      time: '09:00',
      repeatType: 'once',
      startDate: today(),
    },
  },
  {
    name: 'Hair gloss touch-up',
    icon: 'sparkle',
    category: 'ritual',
    locationNote: 'Bathroom · under sink',
    notes: 'Redken Shades EQ 09V, Ashley at Ivy, 918-555-0143',
    schedule: {
      label: null,
      time: '18:00',
      repeatType: 'interval',
      intervalDays: 42,
      startDate: today(),
    },
  },
];

const OPEN_MODE: KnowtMode = 'open';

export async function isEmpty(): Promise<boolean> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM knowts',
  );
  return (row?.n ?? 0) === 0;
}

/** Inserts categories and example knowts. Assumes the content tables are empty. */
export async function seed(): Promise<void> {
  const db = await getDatabase();
  const categoryIds = new Map<string, string>();

  await db.withTransactionAsync(async () => {
    for (const [index, category] of CATEGORIES.entries()) {
      const id = newId();
      categoryIds.set(category.key, id);
      await db.runAsync(
        `INSERT INTO categories (id, name, key, color, icon, is_custom, sort)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        id,
        category.name,
        category.key,
        category.color,
        category.icon,
        index,
      );
    }

    for (const knowt of KNOWTS) {
      const knowtId = newId();
      await db.runAsync(
        `INSERT INTO knowts
           (id, tag_uid, mode, name, icon, category_id, location_note, notes,
            link_url, refire_minutes, snooze_minutes, archived, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, 5, 10, 0, ?)`,
        knowtId,
        OPEN_MODE,
        knowt.name,
        knowt.icon,
        categoryIds.get(knowt.category) ?? null,
        knowt.locationNote,
        knowt.notes,
        Date.now(),
      );

      const s = knowt.schedule;
      await db.runAsync(
        `INSERT INTO schedules
           (id, knowt_id, label, time, repeat_type, days_of_week, interval_days,
            supply_days, lead_days, start_date, enabled, alarmkit_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 1, NULL)`,
        newId(),
        knowtId,
        s.label,
        s.time,
        s.repeatType,
        s.daysOfWeek ? JSON.stringify(s.daysOfWeek) : null,
        s.intervalDays ?? null,
        s.startDate ?? null,
      );
    }
  });
}

/** Runs on launch. Does nothing once the user has knowts of their own. */
export async function seedIfEmpty(): Promise<boolean> {
  if (!(await isEmpty())) return false;
  await seed();
  return true;
}

/** Wipe and reseed. Leaves app_meta alone. See `clearContent`. */
export async function reseed(): Promise<void> {
  await clearContent();
  await seed();
}
