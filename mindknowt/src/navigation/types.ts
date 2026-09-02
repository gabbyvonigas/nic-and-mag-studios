import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Daily: undefined;
  AllKnowts: undefined;
  Settings: undefined;
  Dev: undefined;
};

/** Documents supplied by the owner; the app only routes to them. */
export type LegalDocument = 'terms' | 'privacy';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  AddKnowt: undefined;
  KnowtDetail: { knowtId: string };
  /**
   * The screen AlarmKit reopens the app to. Addressable by URL so it can be
   * exercised without waiting for a real alarm. See linking.ts.
   */
  Ringing: { knowtId: string; scheduleId?: string };
  BrowseSets: undefined;
  ApplySet: { setId: string };
  Legal: undefined;
  LegalDocument: { document: LegalDocument };
  NfcHarness: undefined;
  AlarmHarness: undefined;
};
