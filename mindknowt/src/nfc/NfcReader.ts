import { createUnsupportedReader } from './createUnsupportedReader';
import type { NfcReader } from './types';

/**
 * Fallback for any platform without a `NfcReader.<platform>.ts` sibling.
 * Metro prefers the platform-specific file (`NfcReader.ios.ts` on iOS), so on
 * iOS this module is never bundled. It is also what TypeScript resolves
 * `./NfcReader` to, which keeps every implementation typed against one shape.
 */
export const nfcReader: NfcReader = createUnsupportedReader(
  'NFC scanning is not implemented on this platform.',
);
