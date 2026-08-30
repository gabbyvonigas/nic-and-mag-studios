import NfcManager, { NfcError, NfcTech } from 'react-native-nfc-manager';
import type { TagEvent } from 'react-native-nfc-manager';

import {
  formatUid,
  NfcScanError,
  type NfcFailureReason,
  type NfcReader,
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

/** FeliCa reports `idm`; every other iOS tag type reports a hex `id`. */
type IosTag = TagEvent & { tech?: string; idm?: string };

function reasonFor(err: unknown): NfcFailureReason {
  if (err instanceof NfcError.UserCancel) return 'cancelled';
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
  async isAvailable() {
    try {
      return await NfcManager.isSupported();
    } catch {
      return false;
    }
  },

  async init() {
    await NfcManager.start();
  },

  async scanTag() {
    try {
      await NfcManager.requestTechnology(SCAN_TECHS, {
        alertMessage: SHEET_PROMPT,
      });

      const tag = (await NfcManager.getTag()) as IosTag | null;
      const rawUid = tag?.id ?? tag?.idm;

      if (!rawUid) {
        throw new NfcScanError(
          'no-uid',
          'The tag was detected but reported no UID.',
        );
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
