/** Row shapes mirroring the schema in spec section 3. */

export type KnowtMode = 'strict' | 'soft' | 'open';

export type RepeatType =
  | 'daily'
  | 'weekdays'
  | 'weekends'
  | 'days_of_week'
  | 'interval'
  | 'supply'
  | 'once';

export type EventMethod = 'scan' | 'tap' | 'override' | 'missed';

export type CategoryRow = {
  id: string;
  name: string;
  color: string;
  icon: string;
  is_custom: number;
  sort: number;
};

export type KnowtRow = {
  id: string;
  /** null in Open mode. */
  tag_uid: string | null;
  mode: KnowtMode;
  name: string;
  icon: string;
  category_id: string | null;
  location_note: string | null;
  /** Long-form and first-class. Renders on the detail and Ringing screens. */
  notes: string | null;
  /** Stored in v1, surfaced in v2. */
  link_url: string | null;
  refire_minutes: number;
  snooze_minutes: number;
  archived: number;
  created_at: number;
};

export type ScheduleRow = {
  id: string;
  knowt_id: string;
  label: string | null;
  /** "08:00" local wall clock, never absolute. */
  time: string;
  repeat_type: RepeatType;
  /** JSON array of 1-7, Sunday = 1. */
  days_of_week: string | null;
  interval_days: number | null;
  supply_days: number | null;
  lead_days: number | null;
  start_date: string | null;
  enabled: number;
  alarmkit_id: string | null;
};

export type EventRow = {
  id: string;
  knowt_id: string;
  /** null for a spontaneous check-in with no alarm pending. */
  schedule_id: string | null;
  fired_at: number | null;
  completed_at: number | null;
  method: EventMethod | null;
  note: string | null;
  snooze_count: number;
};

/** A knowt joined with its category and schedules, for list and detail screens. */
export type KnowtWithDetail = KnowtRow & {
  category: CategoryRow | null;
  schedules: ScheduleRow[];
};
