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

export interface NfcReader {
  /** Whether this device can scan at all. Must not throw. */
  isAvailable(): Promise<boolean>;

  /** Prepare the underlying stack. Call once before the first `scanTag`. */
  init(): Promise<void>;

  /**
   * Open the platform's scan affordance and resolve with the first tag read.
   * Rejects with `NfcScanError` for every failure, cancellation included.
   */
  scanTag(): Promise<ScannedTag>;

  /** Tear down any in-flight session. Safe to call when none is open. */
  cancel(): Promise<void>;
}

/** `04a2b3c4` -> `04:A2:B3:C4` */
export function formatUid(rawHex: string): string {
  return (rawHex.match(/.{1,2}/g) ?? []).join(':').toUpperCase();
}
