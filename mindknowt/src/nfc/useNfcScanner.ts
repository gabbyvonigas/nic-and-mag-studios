import { useCallback, useEffect, useRef, useState } from 'react';

import { nfcReader } from './NfcReader';
import { NfcScanError, type NfcFailureReason, type ScannedTag } from './types';

export type NfcAvailability = 'checking' | 'ready' | 'unavailable';

/** A history row. `key` is stable and unique even for repeat scans of one tag. */
export type ScanEntry = {
  key: string;
  tag: ScannedTag;
};

export type ScanFailure = {
  reason: NfcFailureReason;
  message: string;
};

/**
 * Owns scan state for the session. Talks only to the `NfcReader` interface, so
 * it is platform-agnostic; the concrete reader is chosen by Metro at bundle
 * time.
 */
export function useNfcScanner() {
  const [availability, setAvailability] = useState<NfcAvailability>('checking');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<ScanFailure | null>(null);
  const [history, setHistory] = useState<ScanEntry[]>([]);

  const mounted = useRef(true);
  const scanCount = useRef(0);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        if (!(await nfcReader.isAvailable())) {
          if (mounted.current) setAvailability('unavailable');
          return;
        }
        await nfcReader.init();
        if (mounted.current) setAvailability('ready');
      } catch {
        if (mounted.current) setAvailability('unavailable');
      }
    })();

    return () => {
      mounted.current = false;
      // Never let a half-open session outlive the screen.
      void nfcReader.cancel();
    };
  }, []);

  const scan = useCallback(async () => {
    setError(null);
    setIsScanning(true);

    try {
      const tag = await nfcReader.scanTag();
      if (!mounted.current) return;

      scanCount.current += 1;
      // Newest first. Repeat scans of the same tag are kept, not deduplicated.
      setHistory((prev) => [
        { key: `${tag.rawUid}-${scanCount.current}`, tag },
        ...prev,
      ]);
    } catch (err) {
      if (!mounted.current) return;
      setError(
        err instanceof NfcScanError
          ? { reason: err.reason, message: err.message }
          : {
              reason: 'unknown',
              message:
                err instanceof Error && err.message ? err.message : String(err),
            },
      );
    } finally {
      if (mounted.current) setIsScanning(false);
    }
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setError(null);
  }, []);

  return {
    availability,
    isScanning,
    error,
    history,
    latest: history.length > 0 ? history[0].tag : null,
    scan,
    clearHistory,
  };
}
