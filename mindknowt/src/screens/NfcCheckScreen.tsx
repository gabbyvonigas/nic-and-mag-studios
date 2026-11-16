import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SubScreenHeader } from '../components/ui';
import {
  nfcFailureMessage,
  nfcReader,
  type NfcDiagnostics,
  type ScannedTag,
} from '../nfc';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * NFC on its own, away from alarms.
 *
 * This screen exists because a scan that did nothing was unanswerable. There
 * was no sheet, no error and no way to tell a missing entitlement from a tag
 * held wrong, which left the only report "I tapped Scan and nothing happened".
 * So everything the system will say about its own NFC is on one screen, each
 * line sourced from the platform rather than from what the app believes, plus a
 * scan that can be run with nothing else going on.
 *
 * The entitlement itself cannot be read from JavaScript. What can be read is
 * tag reading availability, which is the thing the entitlement decides, so that
 * is the line to look at and it says so.
 */
export function NfcCheckScreen() {
  const navigation = useNavigation<Nav>();

  const [checking, setChecking] = useState(true);
  const [diagnostics, setDiagnostics] = useState<NfcDiagnostics | null>(null);
  const [scanning, setScanning] = useState(false);
  const [tag, setTag] = useState<ScannedTag | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    setChecking(true);
    // `probe` is written not to throw, so there is nothing to catch and
    // nothing that can leave this screen without an answer.
    const result = await nfcReader.probe();
    if (!mounted.current) return;
    setDiagnostics(result);
    setChecking(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      // Never leave a session open behind this screen: the next scan anywhere
      // in the app would be refused as a duplicate registration.
      void nfcReader.cancel();
    };
  }, [refresh]);

  const scan = async () => {
    setError(null);
    setTag(null);
    setScanning(true);
    try {
      const read = await nfcReader.scanTag({
        prompt: 'Hold the top of your iPhone near the Knowt Tag.',
      });
      if (mounted.current) setTag(read);
    } catch (err) {
      const failure = nfcFailureMessage(err);
      // Canceling is the one silent reason everywhere else in the app. Here it
      // is said out loud, because this screen's whole job is to report what
      // happened.
      if (mounted.current) {
        setError(failure ? failure.text : 'Canceled, so no tag was read.');
      }
    } finally {
      if (mounted.current) setScanning(false);
      await refresh();
    }
  };

  const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader
          title="NFC check"
          subtitle="What this build can actually do"
          onBack={() => navigation.goBack()}
        />

        {checking || !diagnostics ? (
          <ActivityIndicator color={theme.color.textSecondary} />
        ) : (
          <>
            <View style={styles.card}>
              <Row
                label="Tag reading available"
                value={yesNo(diagnostics.tagReadingAvailable)}
                bad={!diagnostics.tagReadingAvailable}
              />
              <Text style={styles.hint}>
                The line that matters. Every scan in this app opens a tag
                reader session, and No here is what a missing NFC entitlement
                looks like from inside the app. The entitlement cannot be read
                from JavaScript, so this is the closest the app can get.
              </Text>

              <Row
                label="NDEF reading available"
                value={yesNo(diagnostics.ndefReadingAvailable)}
                bad={!diagnostics.ndefReadingAvailable}
              />
              <Row label="NFC switched on" value={yesNo(diagnostics.enabled)} />
              <Text style={styles.hint}>
                iOS has no NFC switch, so this is always Yes there and says
                nothing about whether a scan will work.
              </Text>

              <Row label="Reader started" value={yesNo(diagnostics.started)} />
              <Row
                label="Session open now"
                value={yesNo(diagnostics.sessionOpen)}
                bad={diagnostics.sessionOpen && !scanning}
              />
              <Text style={styles.hint}>
                A session left open with no scan running is a stuck one, and the
                next scan anywhere in the app is refused while it is there.
              </Text>
            </View>

            {diagnostics.notes.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>What the system said</Text>
                {diagnostics.notes.map((note) => (
                  <Text key={note} style={styles.note}>
                    {note}
                  </Text>
                ))}
              </View>
            ) : null}
          </>
        )}

        <Button
          label={scanning ? 'Scanning' : 'Start scan'}
          disabled={scanning}
          onPress={() => void scan()}
        />
        <Button
          label="Check again"
          variant="secondary"
          disabled={checking}
          onPress={() => void refresh()}
        />

        {tag ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tag read</Text>
            <Row label="ID" value={tag.uid} mono />
            <Row label="Raw" value={tag.rawUid} mono />
            <Row label="Bytes" value={String(tag.byteLength)} mono />
            <Row label="Technology" value={tag.tech} mono />
          </View>
        ) : null}

        {error ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Last error</Text>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.hint}>
          Nothing here changes a Knowt. A tag read on this screen is reported
          and forgotten, so the same tag can be tested as often as you like.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  label,
  value,
  bad,
  mono,
}: {
  label: string;
  value: string;
  bad?: boolean;
  mono?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && styles.rowValueMono,
          bad && styles.rowValueBad,
        ]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  cardTitle: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: 3,
  },
  rowLabel: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textBody,
  },
  rowValue: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  rowValueMono: { fontFamily: theme.font.mono, fontSize: theme.font.size.sm },
  rowValueBad: { color: theme.color.dangerText },
  hint: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textMuted,
  },
  note: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.sm,
    lineHeight: 18,
    color: theme.color.textSecondary,
  },
  error: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    lineHeight: 21,
    color: theme.color.dangerText,
  },
});
