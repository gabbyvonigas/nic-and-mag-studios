export { nfcReader } from './NfcReader';
export { nfcFailureMessage, type NfcFailureMessage } from './failureText';
export { useNfcScanner } from './useNfcScanner';
export type {
  NfcAvailability,
  ScanEntry,
  ScanFailure,
} from './useNfcScanner';
export {
  formatUid,
  NfcScanError,
  type NfcDiagnostics,
  type NfcFailureReason,
  type NfcReader,
  type ScannedTag,
} from './types';
