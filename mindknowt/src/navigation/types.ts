import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Only the two everyday destinations. Settings reaches the capsule's slot
 * count without earning it, so it moved to a corner control on Daily, and Dev
 * lives inside Settings until it is removed for release.
 */
export type TabParamList = {
  Daily: undefined;
  AllKnowts: undefined;
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
  EditSchedule: { knowtId: string; scheduleId?: string };
  /**
   * The screen AlarmKit reopens the app to. Addressable by URL so it can be
   * exercised without waiting for a real alarm. See linking.ts.
   */
  Ringing: { knowtId: string; scheduleId?: string };
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
  AlarmHarness: undefined;
};
