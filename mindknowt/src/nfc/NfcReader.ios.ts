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
 * On iOS `requestTechnology` always opens an `NFCTagReaderSession` — never an
 * `NFCNDEFReaderSession` — so the tag UID comes back even for tags carrying no
 * NDEF payload. `Ndef` is treated as a wildcard by the library's native tech
 * filter (it connects to any detected tag type rather than requiring NDEF
 * formatting), and `FelicaIOS` widens polling to ISO18092 on top of the
 * default ISO14443 + ISO15693.
 */
const SCAN_TECHS = [NfcTech.Ndef, NfcTech.FelicaIOS];

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

      await NfcManager.setAlertMessageIOS(SHEET_SUCCESS);

      const scanned: ScannedTag = {
        uid: formatUid(rawUid),
        rawUid,
        byteLength: Math.ceil(rawUid.length / 2),
        tech: tag?.tech ?? 'unknown',
        scannedAt: Date.now(),
      };
      return scanned;
    } catch (err) {
      if (err instanceof NfcScanError) throw err;
      const message =
        err instanceof Error && err.message ? err.message : String(err);
      throw new NfcScanError(reasonFor(err), message);
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
