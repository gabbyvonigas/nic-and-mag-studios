import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Only the two everyday destinations. Settings reaches the capsule's slot
 * count without earning it, so it moved to a corner control on Daily, and Dev
 * lives inside Settings until it is removed for release.
 */
export type TabParamList = {
  Daily: undefined;
  /**
   * `focus` opens the list already narrowed, for the gap cards on Log. It is
   * the filter's kind rather than the filter itself, because a route param
   * has to survive serialization and a category filter carries an id the Log
   * cards never need.
   */
  AllKnowts:
    | { focus?: 'no-schedule' | 'no-tag'; categoryId?: string }
    | undefined;
  Log: undefined;
};

/** Documents supplied by the owner; the app only routes to them. */
export type LegalDocument = 'terms' | 'privacy';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  AddKnowt: undefined;
  KnowtDetail: { knowtId: string };
  EditKnowt: { knowtId: string };
  /** Omit scheduleId to create one. */
  /**
   * Setting a time. `queue` and `step` are the preset flow: several Knowts
   * added together are taken through this screen one at a time, and the step
   * says where you are in that run.
   */
  EditSchedule: {
    knowtId: string;
    scheduleId?: string;
    /** Knowt ids still to go after this one. */
    queue?: string[];
    step?: { index: number; total: number };
  };
  /**
   * The screen AlarmKit reopens the app to. Addressable by URL so it can be
   * exercised without waiting for a real alarm. See linking.ts.
   */
  Ringing: { knowtId: string; scheduleId?: string };
  /**
   * Setting up one knowt, from a preset or a typed name. `draftId` is the
   * draft this replaces, deleted once the real row is written.
   */
  SetupKnowt: {
    name: string;
    categoryId?: string | null;
    notes?: string | null;
    draftId?: string;
  };
  BrowseSets: undefined;
  ApplySet: { setId: string };
  /**
   * `prompt` is the one-time offer, which opens on the pitch and can be
   * declined. Without it the screen is the Settings entry and opens on the
   * form, because arriving there was already a decision.
   */
  ClaimTags: { prompt?: boolean } | undefined;
  Categories: undefined;
  Settings: undefined;
  Dev: undefined;
  Legal: undefined;
  LegalDocument: { document: LegalDocument };
  NfcHarness: undefined;
  NfcCheck: undefined;
  AlarmHarness: undefined;
};
