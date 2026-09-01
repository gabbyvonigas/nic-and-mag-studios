/**
 * Platform-agnostic NFC contract. Everything above this layer (hooks, screens)
 * depends only on these types, never on `react-native-nfc-manager` or on any
 * other platform SDK. Adding Android means adding an implementation file, not
 * restructuring callers.
 */

/** A single successful read, normalized across platforms. */
export type ScannedTag = {
  /** Human-readable UID, uppercase hex, colon-separated: `04:A2:B3:...`. */
  uid: string;
  /** Unformatted lowercase hex as reported by the platform. */
  rawUid: string;
  /** Number of bytes in the UID. */
  byteLength: number;
  /** Platform's name for the tag technology, or `unknown`. */
  tech: string;
  /** `Date.now()` at the moment the read completed. */
  scannedAt: number;
};

/**
 * Why a scan did not produce a tag. Platform implementations map their native
 * error types onto these so the UI can render copy without platform knowledge.
 */
export type NfcFailureReason =
  | 'cancelled'
  /** A tag was read, but it was not the one the caller was waiting for. */
  | 'wrong-tag'
  | 'timeout'
  | 'radio-disabled'
  | 'unsupported'
  | 'busy'
  | 'no-uid'
  | 'unknown';

export class NfcScanError extends Error {
  readonly reason: NfcFailureReason;

  constructor(reason: NfcFailureReason, message: string) {
    super(message);
    this.name = 'NfcScanError';
    this.reason = reason;
  }
}

/**
 * Options for one scan.
 *
 * `expectRawUid` is the important one. Passing it lets the platform reject a
 * mismatched tag inside its own scan sheet, while the phone is still against
 * the tag, rather than reporting success and leaving the caller to complain
 * afterwards. Rejecting after the sheet has closed reads as "it scanned, then
 * something went wrong", which is exactly backwards.
 */
export type ScanOptions = {
  /** Copy shown in the platform sheet while waiting for a tag. */
  prompt?: string;
  /** Raw lowercase hex UID the scan is waiting for. Case-insensitive. */
  expectRawUid?: string | null;
  /** Name of the expected thing, used in the rejection message. */
  expectLabel?: string;
};

export interface NfcReader {
  /** Whether this device can scan at all. Must not throw. */
  isAvailable(): Promise<boolean>;

  /** Prepare the underlying stack. Call once before the first `scanTag`. */
  init(): Promise<void>;

  /**
   * Open the platform's scan affordance and resolve with the first tag read.
   * Rejects with `NfcScanError` for every failure, cancellation included, and
   * with reason `wrong-tag` when `expectRawUid` is set and does not match.
   */
  scanTag(options?: ScanOptions): Promise<ScannedTag>;

  /** Tear down any in-flight session. Safe to call when none is open. */
  cancel(): Promise<void>;
}

/** `04a2b3c4` -> `04:A2:B3:C4` */
export function formatUid(rawHex: string): string {
  return (rawHex.match(/.{1,2}/g) ?? []).join(':').toUpperCase();
}
