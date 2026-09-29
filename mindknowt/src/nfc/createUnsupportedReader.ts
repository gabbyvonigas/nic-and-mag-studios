import { NfcScanError, type NfcReader } from './types';

/**
 * Reader for platforms with no implementation yet. Reports unavailable rather
 * than throwing on probe, so the UI renders its "NFC unavailable" state
 * instead of an error.
 */
export function createUnsupportedReader(note: string): NfcReader {
  return {
    async isAvailable() {
      return false;
    },
    async init() {
      // Nothing to start.
    },
    async scanTag(): Promise<never> {
      throw new NfcScanError('unsupported', note);
    },
    async cancel() {
      // No session can exist.
    },
  };
}
