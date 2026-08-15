import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import NfcManager, { NfcError, NfcTech } from 'react-native-nfc-manager';
import type { TagEvent } from 'react-native-nfc-manager';

/**
 * On iOS `requestTechnology` always opens an NFCTagReaderSession, so the tag's
 * UID is returned even when the tag holds no NDEF payload. `Ndef` behaves as a
 * wildcard in the native tech filter — it connects to any detected tag type —
 * and adding `FelicaIOS` widens polling to ISO18092 on top of the default
 * ISO14443 + ISO15693.
 */
const SCAN_TECHS = [NfcTech.Ndef, NfcTech.FelicaIOS];

/** FeliCa reports `idm`; every other iOS tag type reports a hex `id`. */
type ScannedTag = TagEvent & { tech?: string; idm?: string };

type Availability = 'checking' | 'ready' | 'unavailable';

type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'success'; uid: string; bytes: number; tech: string }
  | { status: 'error'; tone: 'warn' | 'error'; title: string; detail: string };

/** "04a2b3c4d5e680" -> "04:A2:B3:C4:D5:E6:80" */
function formatUid(hex: string): string {
  return (hex.match(/.{1,2}/g) ?? []).join(':').toUpperCase();
}

function describeError(err: unknown): {
  tone: 'warn' | 'error';
  title: string;
  detail: string;
} {
  if (err instanceof NfcError.UserCancel) {
    return {
      tone: 'warn',
      title: 'Scan cancelled',
      detail: 'The scan sheet was closed before a tag was read.',
    };
  }
  if (err instanceof NfcError.Timeout) {
    return {
      tone: 'warn',
      title: 'Scan timed out',
      detail: 'No tag was detected. Hold the tag to the top of the phone.',
    };
  }
  if (err instanceof NfcError.RadioDisabled) {
    return {
      tone: 'error',
      title: 'NFC is turned off',
      detail: 'Enable NFC for this device, then try again.',
    };
  }
  if (err instanceof NfcError.UnsupportedFeature) {
    return {
      tone: 'error',
      title: 'NFC not supported',
      detail: 'This device cannot open an NFC reader session.',
    };
  }
  if (err instanceof NfcError.SystemBusy) {
    return {
      tone: 'warn',
      title: 'NFC system is busy',
      detail: 'iOS reported the NFC system is busy. Wait a moment, then retry.',
    };
  }
  return {
    tone: 'error',
    title: 'Could not read tag',
    detail: err instanceof Error && err.message ? err.message : String(err),
  };
}

export default function App() {
  const [availability, setAvailability] = useState<Availability>('checking');
  const [scan, setScan] = useState<ScanState>({ status: 'idle' });

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        if (!(await NfcManager.isSupported())) {
          if (active) setAvailability('unavailable');
          return;
        }
        await NfcManager.start();
        if (active) setAvailability('ready');
      } catch {
        if (active) setAvailability('unavailable');
      }
    })();

    return () => {
      active = false;
      // Make sure a half-open session never outlives the screen.
      NfcManager.cancelTechnologyRequest().catch(() => {});
    };
  }, []);

  const handleScan = useCallback(async () => {
    setScan({ status: 'scanning' });
    try {
      await NfcManager.requestTechnology(SCAN_TECHS, {
        alertMessage: 'Hold the top of your iPhone near the tag.',
      });

      const tag = (await NfcManager.getTag()) as ScannedTag | null;
      const rawUid = tag?.id ?? tag?.idm;

      if (!rawUid) {
        throw new Error('Tag was detected but reported no UID.');
      }

      await NfcManager.setAlertMessageIOS('Tag read');
      setScan({
        status: 'success',
        uid: formatUid(rawUid),
        bytes: Math.ceil(rawUid.length / 2),
        tech: tag?.tech ?? 'unknown',
      });
    } catch (err) {
      setScan({ status: 'error', ...describeError(err) });
    } finally {
      // Closes the iOS sheet; safe to call even when no session is open.
      NfcManager.cancelTechnologyRequest().catch(() => {});
    }
  }, []);

  const scanning = scan.status === 'scanning';
  const disabled = scanning || availability !== 'ready';

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.title}>MindKnowt</Text>
        <Text style={styles.subtitle}>NFC read path</Text>
      </View>

      <View style={styles.resultArea}>
        {availability === 'checking' && (
          <ActivityIndicator color="#6b7280" />
        )}

        {availability === 'unavailable' && (
          <View style={[styles.card, styles.cardError]}>
            <Text style={[styles.cardTitle, styles.textError]}>
              NFC unavailable
            </Text>
            <Text style={styles.cardDetail}>
              This device has no usable NFC reader. A physical iPhone 7 or newer
              is required — the simulator cannot scan tags.
            </Text>
          </View>
        )}

        {availability === 'ready' && scan.status === 'idle' && (
          <Text style={styles.hint}>
            Tap the button, then hold a tag to the top of the phone.
          </Text>
        )}

        {availability === 'ready' && scanning && (
          <Text style={styles.hint}>Waiting for a tag…</Text>
        )}

        {scan.status === 'success' && (
          <View style={[styles.card, styles.cardSuccess]}>
            <Text style={styles.cardLabel}>TAG UID</Text>
            <Text style={styles.uid} selectable>
              {scan.uid}
            </Text>
            <Text style={styles.meta}>
              {scan.bytes} bytes · {scan.tech}
            </Text>
          </View>
        )}

        {scan.status === 'error' && (
          <View
            style={[
              styles.card,
              scan.tone === 'warn' ? styles.cardWarn : styles.cardError,
            ]}>
            <Text
              style={[
                styles.cardTitle,
                scan.tone === 'warn' ? styles.textWarn : styles.textError,
              ]}>
              {scan.title}
            </Text>
            <Text style={styles.cardDetail}>{scan.detail}</Text>
          </View>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: scanning }}
        disabled={disabled}
        onPress={handleScan}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          disabled && styles.buttonDisabled,
        ]}>
        {scanning ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.buttonText}>Scan a tag</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 96,
    paddingBottom: 56,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
  },
  resultArea: {
    flex: 1,
    justifyContent: 'center',
  },
  hint: {
    fontSize: 15,
    color: '#9ca3af',
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 6,
  },
  cardSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  cardWarn: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  cardError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
    letterSpacing: 1,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  cardDetail: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4b5563',
  },
  textWarn: {
    color: '#b45309',
  },
  textError: {
    color: '#b91c1c',
  },
  uid: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'Menlo',
  },
  meta: {
    fontSize: 13,
    color: '#6b7280',
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    backgroundColor: '#d1d5db',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
});
