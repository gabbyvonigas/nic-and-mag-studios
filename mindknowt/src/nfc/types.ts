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
  | 'canceled'
  /** A tag was read, but it was not the one the caller was waiting for. */
  | 'wrong-tag'
  | 'timeout'
  | 'radio-disabled'
  | 'unsupported'
  | 'busy'
  | 'no-uid'
  /**
   * The platform never opened a reader session, so no sheet appeared and
   * nothing was ever going to.
   *
   * This is its own reason because it is the one failure that produced no
   * error at all. On iOS `NFCTagReaderSession`'s initializer returns nil when
   * the app is not entitled to read tags, and the library's native code then
   * calls `beginSession` on nil and stores the callback it will never invoke.
   * The JavaScript promise simply never settles: no sheet, no rejection, and a
   * Scan button stuck reading "Scanning" because the state that disables it is
   * cleared in a `finally` that never runs.
   */
  | 'no-session'
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

/**
 * What the platform says about its own NFC, read one field at a time.
 *
 * Exists because a scan that silently does nothing is unanswerable from the
 * app's own logs. Every field is something the platform reports rather than
 * something this app believes, so the Dev screen can state what is true of the
 * build that is actually installed.
 */
export type NfcDiagnostics = {
  /** NDEF reading, which is what a general "is NFC supported" asks. */
  ndefReadingAvailable: boolean;
  /**
   * Tag reading. This is the one that matters: every scan in this app opens a
   * tag reader session, and a build with no NFC entitlement cannot open one.
   */
  tagReadingAvailable: boolean;
  /**
   * Whether NFC is switched on.
   *
   * Meaningful on Android. On iOS there is no user-facing NFC switch and the
   * library returns true unconditionally, so it is reported rather than
   * trusted: a true here says nothing about whether a scan will work.
   */
  enabled: boolean;
  /** Whether the stack accepted being started. */
  started: boolean;
  /** Whether a session is open right now. A stuck one rejects the next scan. */
  sessionOpen: boolean;
  /** Whatever the probe itself could not determine, in its own words. */
  notes: string[];
};

export interface NfcReader {
  /** Whether this device can scan at all. Must not throw. */
  isAvailable(): Promise<boolean>;

  /** Everything the platform will say about its NFC. Must not throw. */
  probe(): Promise<NfcDiagnostics>;

  /** Prepare the underlying stack. Call once before the first `scanTag`. */
  init(): Promise<void>;

  /**
   * Open the platform's scan affordance and resolve with the first tag read.
   * Rejects with `NfcScanError` for every failure, cancelation included, and
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
