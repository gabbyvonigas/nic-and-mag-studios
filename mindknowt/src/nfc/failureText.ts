/**
 * What a failed scan says out loud.
 *
 * One place, because a scan is started from five screens and each had written
 * its own version, which is how a failure ends up reported differently
 * depending on where it happened. Pure, so the copy for every reason can be
 * asserted off device.
 *
 * Exactly one reason is silent, and it is the one that is not a failure:
 * backing out of the system sheet. Everything else says what happened and, as
 * far as the app can tell, why. A scan that does nothing and says nothing was
 * the bug this file exists to make impossible.
 */
import { NfcScanError, type NfcFailureReason } from './types';

export type NfcFailureMessage = {
  /** `warn` for something to try again, `danger` for something to fix. */
  tone: 'warn' | 'danger';
  text: string;
};

const BY_REASON: Record<
  Exclude<NfcFailureReason, 'canceled' | 'wrong-tag' | 'unknown'>,
  NfcFailureMessage
> = {
  timeout: {
    tone: 'warn',
    text: 'No tag was detected. Hold it to the top of the phone.',
  },
  'radio-disabled': {
    tone: 'danger',
    text: 'NFC is turned off. Turn it on, then scan again.',
  },
  unsupported: {
    tone: 'danger',
    text: 'This build cannot open an NFC reader. Dev tools, NFC check says what the system reports.',
  },
  busy: {
    tone: 'warn',
    text: 'The NFC reader is busy. Wait a moment, then scan again.',
  },
  'no-uid': {
    tone: 'danger',
    text: 'The tag was read but reported no ID, so it cannot be used as a Knowt Tag.',
  },
  'no-session': {
    tone: 'danger',
    text: 'iOS never opened the NFC reader, so no scan happened. This usually means the installed build is missing the NFC entitlement, which needs a new build. Dev tools, NFC check says what the system reports.',
  },
};

export function nfcFailureMessage(err: unknown): NfcFailureMessage | null {
  if (!(err instanceof NfcScanError)) {
    // Not ours, so it cannot be classified. It still has to identify itself:
    // a failure that reaches the screen saying only "Error" is its own bug.
    return {
      tone: 'danger',
      text: describe(err),
    };
  }

  switch (err.reason) {
    case 'canceled':
      // Backing out of the sheet is not a failure. The alarm simply continues.
      return null;
    case 'wrong-tag':
      // Already shown inside the system sheet. Repeated here because the sheet
      // is gone by the time the screen renders again.
      return { tone: 'danger', text: err.message };
    case 'unknown':
      return { tone: 'danger', text: err.message || 'The scan failed.' };
    default:
      return BY_REASON[err.reason];
  }
}

/** The error's class name, always, so nothing renders as the bare `"Error"`. */
function describe(err: unknown): string {
  if (err instanceof Error) {
    const name = err.constructor?.name || err.name || 'Error';
    return err.message ? `${name}: ${err.message}` : name;
  }
  return String(err);
}
