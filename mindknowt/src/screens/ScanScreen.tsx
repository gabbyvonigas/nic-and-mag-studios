import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { theme } from '../theme';
import { useNfcScanner, type ScanEntry, type ScanFailure } from '../nfc';

type Tone = 'warn' | 'danger';

type Copy = {
  tone: Tone;
  title: string;
  detail: string;
};

function failureCopy(failure: ScanFailure): Copy {
  switch (failure.reason) {
    case 'cancelled':
      return {
        tone: 'warn',
        title: 'Scan cancelled',
        detail: 'The scan sheet was closed before a tag was read.',
      };
    case 'timeout':
      return {
        tone: 'warn',
        title: 'Scan timed out',
        detail: 'No tag was detected. Hold the tag to the top of the phone.',
      };
    case 'busy':
      return {
        tone: 'warn',
        title: 'NFC system is busy',
        detail: 'iOS reported the NFC system is busy. Wait a moment, then retry.',
      };
    case 'no-uid':
      return {
        tone: 'warn',
        title: 'No UID reported',
        detail: 'The tag responded but returned no identifier.',
      };
    case 'radio-disabled':
      return {
        tone: 'danger',
        title: 'NFC is turned off',
        detail: 'Enable NFC for this device, then try again.',
      };
    case 'unsupported':
      return {
        tone: 'danger',
        title: 'NFC not supported',
        detail: failure.message,
      };
    default:
      return {
        tone: 'danger',
        title: 'Could not read tag',
        detail: failure.message,
      };
  }
}

function timeOf(scannedAt: number): string {
  return new Date(scannedAt).toLocaleTimeString();
}

function HistoryRow({ entry, index }: { entry: ScanEntry; index: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIndex}>{index}</Text>
      <View style={styles.rowBody}>
        <Text style={styles.rowUid} numberOfLines={1} selectable>
          {entry.tag.uid}
        </Text>
        <Text style={styles.rowMeta}>
          {timeOf(entry.tag.scannedAt)} · {entry.tag.byteLength} bytes ·{' '}
          {entry.tag.tech}
        </Text>
      </View>
    </View>
  );
}

export function ScanScreen() {
  const {
    availability,
    isScanning,
    error,
    history,
    latest,
    scan,
    clearHistory,
  } = useNfcScanner();

  const disabled = isScanning || availability !== 'ready';
  const copy = error ? failureCopy(error) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>MindKnowt</Text>
        <Text style={styles.subtitle}>NFC read path</Text>
      </View>

      <View style={styles.stage}>
        {availability === 'checking' && (
          <ActivityIndicator color={theme.color.textSecondary} />
        )}

        {availability === 'unavailable' && (
          <View style={[styles.card, styles.cardDanger]}>
            <Text style={[styles.cardTitle, styles.textDanger]}>
              NFC unavailable
            </Text>
            <Text style={styles.cardDetail}>
              This device has no usable NFC reader. A physical iPhone 7 or newer
              is required. The simulator cannot scan tags.
            </Text>
          </View>
        )}

        {availability === 'ready' && latest && (
          <View style={styles.latest}>
            <Text style={styles.latestLabel}>LAST TAG UID</Text>
            <Text
              style={styles.latestUid}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              selectable>
              {latest.uid}
            </Text>
            <Text style={styles.latestMeta}>
              {latest.byteLength} bytes · {latest.tech}
            </Text>
          </View>
        )}

        {availability === 'ready' && !latest && !copy && (
          <Text style={styles.hint}>
            {isScanning
              ? 'Waiting for a tag…'
              : 'Tap the button, then hold a tag to the top of the phone.'}
          </Text>
        )}

        {copy && (
          <View
            style={[
              styles.card,
              copy.tone === 'warn' ? styles.cardWarn : styles.cardDanger,
              latest ? styles.cardSpaced : null,
            ]}>
            <Text
              style={[
                styles.cardTitle,
                copy.tone === 'warn' ? styles.textWarn : styles.textDanger,
              ]}>
              {copy.title}
            </Text>
            <Text style={styles.cardDetail}>{copy.detail}</Text>
          </View>
        )}
      </View>

      <View style={styles.historySection}>
        <View style={styles.historyHeader}>
          <Text style={styles.historyTitle}>
            Scanned this session ({history.length})
          </Text>
          {history.length > 0 && (
            <Pressable accessibilityRole="button" onPress={clearHistory}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          )}
        </View>

        <FlatList
          data={history}
          keyExtractor={(entry) => entry.key}
          renderItem={({ item, index }) => (
            <HistoryRow entry={item} index={history.length - index} />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No tags scanned yet.</Text>
          }
          showsVerticalScrollIndicator={false}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: isScanning }}
        disabled={disabled}
        onPress={scan}
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          disabled && styles.buttonDisabled,
        ]}>
        {isScanning ? (
          <ActivityIndicator color={theme.color.onAccent} />
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
    backgroundColor: theme.color.background,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: 72,
    paddingBottom: theme.spacing.xxl + theme.spacing.xl,
  },
  header: {
    gap: theme.spacing.xs,
  },
  title: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.display,
    fontWeight: theme.font.weight.bold,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  stage: {
    minHeight: 148,
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  hint: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textMuted,
    textAlign: 'center',
  },
  latest: {
    gap: theme.spacing.xs,
  },
  latestLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.successText,
    letterSpacing: 1,
  },
  latestUid: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.uid,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textPrimary,
  },
  latestMeta: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  cardSpaced: {
    marginTop: theme.spacing.lg,
  },
  cardWarn: {
    backgroundColor: theme.color.warningSurface,
    borderColor: theme.color.warningBorder,
  },
  cardDanger: {
    backgroundColor: theme.color.dangerSurface,
    borderColor: theme.color.dangerBorder,
  },
  cardTitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.semibold,
  },
  cardDetail: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    lineHeight: 20,
    color: theme.color.textBody,
  },
  textWarn: {
    color: theme.color.warningText,
  },
  textDanger: {
    color: theme.color.dangerText,
  },
  historySection: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
    paddingTop: theme.spacing.lg,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  historyTitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clear: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  rowIndex: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
    minWidth: 20,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowUid: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  rowMeta: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: theme.color.surfaceMuted,
  },
  empty: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textMuted,
  },
  button: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    backgroundColor: theme.color.accentDisabled,
  },
  buttonText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.onAccent,
  },
});
