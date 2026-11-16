import NfcManager, { NfcError, NfcTech } from 'react-native-nfc-manager';
import type { TagEvent } from 'react-native-nfc-manager';

import {
  formatUid,
  NfcScanError,
  type NfcDiagnostics,
  type NfcFailureReason,
  type NfcReader,
  type ScanOptions,
  type ScannedTag,
} from './types';

/**
 * On iOS `requestTechnology` always opens an `NFCTagReaderSession`, never an
 * `NFCNDEFReaderSession`, so the tag UID comes back even for tags carrying no
 * NDEF payload. `Ndef` is treated as a wildcard by the library's native tech
 * filter: it connects to any detected tag type rather than requiring NDEF
 * formatting. Default polling is ISO14443 + ISO15693, which covers NTAG213/
 * 215/216 stickers.
 *
 * Do NOT add `NfcTech.FelicaIOS` here. It switches on ISO18092 polling, and
 * iOS rejects a session that polls FeliCa unless the app also declares
 * `com.apple.developer.nfc.readersession.felica.systemcodes` in Info.plist.
 * Without it the session fails instantly, with no scan sheet and an empty
 * error message. FeliCa is a Japanese transit format we have no use for; if it
 * is ever needed, pass `systemCodes` to the config plugin in app.json first.
 */
const SCAN_TECHS = [NfcTech.Ndef];

const SHEET_PROMPT = 'Hold the top of your iPhone near the tag.';
const SHEET_SUCCESS = 'Tag read';

/**
 * The tech string whose availability answers the question this app asks.
 *
 * `isSupported('')` and `isSupported('Ndef')` both report
 * `NFCNDEFReaderSession.readingAvailable`, which is a different class from the
 * one every scan here opens. Anything else routes to
 * `NFCTagReaderSession.readingAvailable`, so that is what gets asked.
 */
const TAG_SESSION_PROBE = 'iso15693';

/**
 * The library's own declarations are wrong about these two, so they are
 * narrowed here rather than cast at each call site.
 *
 * `isSupported` is declared as taking no arguments, and its implementation in
 * `src/NfcManager.js` is `isSupported(tech = '')`, passed straight through to
 * the native `isSupported:` which branches on it. `isTagSessionAvailableIOS`
 * is declared as returning the `Boolean` wrapper object rather than a boolean.
 */
const probes = NfcManager as unknown as {
  isSupported(tech?: string): Promise<boolean>;
  isTagSessionAvailableIOS(): Promise<boolean>;
};

/**
 * How long to wait before deciding no reader sheet is coming.
 *
 * **This is the fix for a scan that did nothing at all.** On iOS
 * `requestTechnology` does not resolve when the sheet opens; it stores the
 * callback and resolves only once a tag is read or the session closes. The
 * library's native code builds the session with
 * `[[NFCTagReaderSession alloc] initWithPollingOption:delegate:queue:]`, whose
 * initializer returns nil when the app is not entitled to read tags, then calls
 * `beginSession` on that nil and keeps the callback anyway. No session, no
 * delegate, no callback, so the promise never settles and nothing is thrown.
 *
 * `isTagSessionAvailableIOS` reports whether a session object exists, which is
 * the one signal that separates "the sheet is up and waiting for a tag" from
 * "there was never going to be a sheet". Long enough that a busy JS thread is
 * not mistaken for a missing entitlement.
 */
const SESSION_CHECK_MS = 1_500;

const NO_SESSION_MESSAGE =
  'iOS did not open the NFC reader. This build is most likely missing the ' +
  'NFC tag reading entitlement, which needs a new build rather than a ' +
  'setting on the phone. Dev tools, NFC check says what the system reports.';

const NOT_ENTITLED_MESSAGE =
  'This build cannot open an NFC reader session. Either the iPhone has no ' +
  'NFC reader or the app is missing the NFC tag reading entitlement.';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** FeliCa reports `idm`; every other iOS tag type reports a hex `id`. */
type IosTag = TagEvent & { tech?: string; idm?: string };

/** Whether a reader session object exists right now. Must not throw. */
async function sessionExists(): Promise<boolean> {
  try {
    return await probes.isTagSessionAvailableIOS();
  } catch {
    // The question could not be asked, so do not use it to condemn the scan.
    return true;
  }
}

function reasonFor(err: unknown): NfcFailureReason {
  if (err instanceof NfcError.UserCancel) return 'canceled';
  if (err instanceof NfcError.Timeout) return 'timeout';
  if (err instanceof NfcError.RadioDisabled) return 'radio-disabled';
  if (err instanceof NfcError.UnsupportedFeature) return 'unsupported';
  if (err instanceof NfcError.SystemBusy) return 'busy';
  return 'unknown';
}

/**
 * The library constructs its typed errors with an empty message, so a plain
 * `String(err)` collapses all of them to the useless string "Error". Keep the
 * class name so an unmapped failure still identifies itself.
 */
function describe(err: unknown): string {
  if (err instanceof Error) {
    const name = err.constructor?.name || err.name || 'Error';
    return err.message ? `${name}: ${err.message}` : name;
  }
  return String(err);
}

export const nfcReader: NfcReader = {
  /**
   * Both, not either. Every scan in this app opens a tag reader session, so a
   * device that reports NDEF reading but not tag reading cannot do what this
   * app needs, and answering "available" there means a harness that says ready
   * and then fails on every scan.
   */
  async isAvailable() {
    try {
      const [ndef, tag] = await Promise.all([
        probes.isSupported(''),
        probes.isSupported(TAG_SESSION_PROBE),
      ]);
      return ndef && tag;
    } catch {
      return false;
    }
  },

  async init() {
    await NfcManager.start();
  },

  async probe(): Promise<NfcDiagnostics> {
    const notes: string[] = [];

    const ask = async (tech: string, label: string) => {
      try {
        return await probes.isSupported(tech);
      } catch (err) {
        notes.push(`${label}: ${describe(err)}`);
        return false;
      }
    };

    const ndefReadingAvailable = await ask('', 'NDEF reading');
    const tagReadingAvailable = await ask(TAG_SESSION_PROBE, 'Tag reading');

    let enabled = false;
    try {
      // Always true on iOS: there is no NFC switch to read. Reported anyway,
      // so the one screen that answers "why did nothing happen" is not
      // quietly missing a field that matters on the other platform.
      enabled = await NfcManager.isEnabled();
    } catch (err) {
      notes.push(`enabled: ${describe(err)}`);
    }

    let started = false;
    try {
      await NfcManager.start();
      started = true;
    } catch (err) {
      notes.push(`start: ${describe(err)}`);
    }

    let sessionOpen = false;
    try {
      sessionOpen = await probes.isTagSessionAvailableIOS();
    } catch (err) {
      notes.push(`session check: ${describe(err)}`);
    }

    if (!tagReadingAvailable) {
      // The entitlement cannot be read from JavaScript. What can be read is
      // whether the system will let a tag session exist, which is the thing
      // the entitlement decides.
      notes.push(
        'Tag reading unavailable, which is what a missing NFC entitlement ' +
          'looks like from inside the app.',
      );
    }

    return {
      ndefReadingAvailable,
      tagReadingAvailable,
      enabled,
      started,
      sessionOpen,
      notes,
    };
  },

  async scanTag(options: ScanOptions = {}) {
    try {
      // Asked before the session, so a build that cannot open one says so
      // immediately rather than after the wait below.
      let canOpen = true;
      try {
        canOpen = await probes.isSupported(TAG_SESSION_PROBE);
      } catch {
        // If the probe itself fails, try the scan: refusing on a failed
        // question is worse than attempting the thing the question was about.
      }
      if (!canOpen) throw new NfcScanError('unsupported', NOT_ENTITLED_MESSAGE);

      // Deliberately not awaited yet. This promise resolves when a tag is read
      // or the session closes, which can be a minute away, so it cannot be the
      // thing that tells us whether a sheet opened at all.
      let requestSettled = false;
      const request = NfcManager.requestTechnology(SCAN_TECHS, {
        alertMessage: options.prompt ?? SHEET_PROMPT,
      }).then(
        (value) => {
          requestSettled = true;
          return value;
        },
        (err) => {
          requestSettled = true;
          throw err;
        },
      );
      // Observed, so a rejection arriving while the check below runs is not an
      // unhandled one. It is rethrown through the await further down.
      request.catch(() => {});

      await delay(SESSION_CHECK_MS);
      if (!requestSettled && !(await sessionExists())) {
        throw new NfcScanError('no-session', NO_SESSION_MESSAGE);
      }

      // The sheet is up, or the request has already answered. Either way this
      // is now safe to wait on for as long as iOS wants.
      await request;

      const tag = (await NfcManager.getTag()) as IosTag | null;
      const rawUid = tag?.id ?? tag?.idm;

      if (!rawUid) {
        throw new NfcScanError(
          'no-uid',
          'The tag was detected but reported no UID.',
        );
      }

      const expected = options.expectRawUid?.toLowerCase();
      if (expected && rawUid.toLowerCase() !== expected) {
        // Fail the session rather than closing it cleanly. iOS renders the
        // message inside its own sheet with an error mark, so the rejection
        // lands while the phone is still held against the wrong tag. Closing
        // the sheet successfully first and complaining afterwards is what made
        // this read as "it scanned, then it did not like it".
        const label = options.expectLabel ?? 'the right tag';
        const message = `Not ${label}`;
        try {
          await NfcManager.invalidateSessionWithErrorIOS(message);
        } catch {
          // The sheet is closing regardless; the throw below still reports it.
        }
        throw new NfcScanError('wrong-tag', message);
      }

      const scanned: ScannedTag = {
        uid: formatUid(rawUid),
        rawUid,
        byteLength: Math.ceil(rawUid.length / 2),
        tech: tag?.tech ?? 'unknown',
        scannedAt: Date.now(),
      };

      // Cosmetic sheet text only. A failure here must never discard a good read.
      try {
        await NfcManager.setAlertMessageIOS(SHEET_SUCCESS);
      } catch {
        // Session already closing; the UID above is still valid.
      }

      return scanned;
    } catch (err) {
      if (err instanceof NfcScanError) throw err;
      throw new NfcScanError(reasonFor(err), describe(err));
    } finally {
      // Closes the iOS sheet. Safe to call when no session is open.
      await this.cancel();
    }
  },

  async cancel() {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Nothing to cancel, or the session already closed itself.
    }
  },
};
