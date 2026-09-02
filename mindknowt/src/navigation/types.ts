import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Only the two everyday destinations. Settings reaches the capsule's slot
 * count without earning it, so it moved to a corner control on Daily, and Dev
 * lives inside Settings until it is removed for release.
 */
export type TabParamList = {
  Daily: undefined;
  AllKnowts: undefined;
};

/** Documents supplied by the owner; the app only routes to them. */
export type LegalDocument = 'terms' | 'privacy';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  AddKnowt: undefined;
  KnowtDetail: { knowtId: string };
  EditKnowt: { knowtId: string };
  /**
   * The screen AlarmKit reopens the app to. Addressable by URL so it can be
   * exercised without waiting for a real alarm. See linking.ts.
   */
  Ringing: { knowtId: string; scheduleId?: string };
  BrowseSets: undefined;
  ApplySet: { setId: string };
  Settings: undefined;
  Dev: undefined;
  Legal: undefined;
  LegalDocument: { document: LegalDocument };
  NfcHarness: undefined;
  AlarmHarness: undefined;
};
