import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './types';

/**
 * URL routing for the app. AlarmKit itself relaunches with a payload rather
 * than a link, so the alarm path does not depend on this, but making every
 * route addressable means the Ringing screen can be exercised on demand:
 *
 *   npx uri-scheme open "mindknowt://ringing/<knowtId>" --ios
 *
 * It is also what spec section 9's queued Shortcuts action will build on.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'mindknowt://'],
  config: {
    screens: {
      Tabs: {
        screens: {
          Today: 'today',
          AllKnowts: 'knowts',
          Settings: 'settings',
          Dev: 'dev',
        },
      },
      AddKnowt: 'add',
      KnowtDetail: 'knowt/:knowtId',
      Ringing: 'ringing/:knowtId',
      BrowseSets: 'sets',
      ApplySet: 'sets/:setId',
      Legal: 'legal',
      LegalDocument: 'legal/:document',
      NfcHarness: 'dev/nfc',
      AlarmHarness: 'dev/alarms',
    },
  },
};
