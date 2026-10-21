import { createUnsupportedReader } from './createUnsupportedReader';
import type { NfcReader } from './types';

/**
 * TODO(android): implement against `react-native-nfc-manager`, which supports
 * Android already. The shape is the same as `NfcReader.ios.ts`; the differences
 * to handle are:
 *   - `NfcManager.isEnabled()` matters on Android (NFC can be switched off),
 *     whereas iOS has no user-facing toggle.
 *   - There is no system scan sheet, so the UI needs its own "hold tag near
 *     phone" affordance driven by the `isScanning` flag.
 *   - Request the concrete techs (`NfcA`/`NfcB`/`NfcF`/`NfcV`) rather than
 *     relying on the `Ndef` wildcard, which is iOS-specific behavior.
 * Nothing outside this file needs to change.
 */
export const nfcReader: NfcReader = createUnsupportedReader(
  'NFC scanning on Android is not implemented yet.',
);
