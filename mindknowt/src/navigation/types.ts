import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Today: undefined;
  AllKnowts: undefined;
  Dev: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  AddKnowt: undefined;
  KnowtDetail: { knowtId: string };
  /**
   * The screen AlarmKit reopens the app to. Addressable by URL so it can be
   * exercised without waiting for a real alarm — see linking.ts.
   */
  Ringing: { knowtId: string };
  NfcHarness: undefined;
  AlarmHarness: undefined;
};
