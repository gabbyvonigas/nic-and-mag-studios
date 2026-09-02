import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SubScreenHeader } from '../components/ui';
import { theme } from '../theme';
import { useAlarmTester, type AlarmFailure } from '../alarms';

function failureCopy(failure: AlarmFailure): { title: string; detail: string } {
  switch (failure.reason) {
    case 'unauthorized':
      return {
        title: 'Alarms not allowed',
        detail: 'Permission was denied. Enable alarms for MindKnowt in Settings.',
      };
    case 'not-configured':
      return { title: 'App Group not reachable', detail: failure.message };
    case 'schedule-rejected':
      return { title: 'Alarm refused', detail: failure.message };
    case 'unsupported':
      return { title: 'Alarms unavailable', detail: failure.message };
    default:
      return { title: 'Something went wrong', detail: failure.message };
  }
}

function clockOf(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

export function AlarmScreen() {
  const {
    availability,
    authorization,
    busy,
    error,
    scheduled,
    launch,
    authorize,
    scheduleIn,
    cancel,
    clearLaunch,
  } = useAlarmTester();

  const navigation = useNavigation();
  const ready = availability === 'ready';
  const copy = error ? failureCopy(error) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <SubScreenHeader
        onBack={() => navigation.goBack()}
        title="Alarms"
        subtitle="AlarmKit path"
      />

      {launch && (
        <View style={[styles.card, styles.cardSuccess]}>
          <Text style={styles.cardLabel}>LAUNCHED BY ALARM</Text>
          <Text style={styles.mono} selectable>
            {launch.payload ?? '(no payload)'}
          </Text>
          <Text style={styles.meta}>id {launch.alarmId}</Text>
          <Pressable accessibilityRole="button" onPress={clearLaunch}>
            <Text style={styles.link}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      {availability === 'checking' && (
        <ActivityIndicator color={theme.color.textSecondary} />
      )}

      {availability === 'unavailable' && !copy && (
        <View style={[styles.card, styles.cardDanger]}>
          <Text style={[styles.cardTitle, styles.textDanger]}>
            Alarms unavailable
          </Text>
          <Text style={styles.cardDetail}>
            This device cannot schedule system alarms. AlarmKit needs iOS 26.1
            or newer on real hardware.
          </Text>
        </View>
      )}

      {copy && (
        <View style={[styles.card, styles.cardDanger]}>
          <Text style={[styles.cardTitle, styles.textDanger]}>{copy.title}</Text>
          <Text style={styles.cardDetail}>{copy.detail}</Text>
        </View>
      )}

      {ready && (
        <>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Permission</Text>
            <Text style={styles.rowValue}>{authorization}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={authorize}
            style={({ pressed }) => [
              styles.button,
              styles.buttonSecondary,
              pressed && styles.buttonPressed,
              busy && styles.buttonDisabled,
            ]}>
            <Text style={styles.buttonSecondaryText}>Allow alarms</Text>
          </Pressable>

          <Text style={styles.hint}>
            Schedule one, then lock the phone. It should ring through Silent and
            Focus, and tapping Stop should reopen MindKnowt with the payload
            above.
          </Text>

          {[1, 2].map((minutes) => (
            <Pressable
              key={minutes}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={() => scheduleIn(minutes)}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                busy && styles.buttonDisabled,
              ]}>
              {busy ? (
                <ActivityIndicator color={theme.color.onAccent} />
              ) : (
                <Text style={styles.buttonText}>
                  Ring in {minutes} minute{minutes === 1 ? '' : 's'}
                </Text>
              )}
            </Pressable>
          ))}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Scheduled this session ({scheduled.length})
            </Text>
            {scheduled.length === 0 ? (
              <Text style={styles.empty}>Nothing scheduled yet.</Text>
            ) : (
              scheduled.map((alarm) => (
                <View key={alarm.id} style={styles.alarmRow}>
                  <View style={styles.alarmBody}>
                    <Text style={styles.alarmTime}>
                      {clockOf(alarm.firesAt)}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {alarm.id}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => cancel(alarm.id)}>
                    <Text style={styles.link}>Cancel</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    gap: theme.spacing.lg,
  },
  header: { gap: theme.spacing.xs },
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
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  cardSuccess: {
    backgroundColor: theme.color.successSurface,
    borderColor: theme.color.successBorder,
  },
  cardDanger: {
    backgroundColor: theme.color.dangerSurface,
    borderColor: theme.color.dangerBorder,
  },
  cardLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.successText,
    letterSpacing: 1,
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
  textDanger: { color: theme.color.dangerText },
  mono: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
  },
  meta: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  link: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textSecondary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  rowLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  rowValue: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  hint: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textMuted,
  },
  button: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: theme.color.surfaceMuted,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: theme.color.accentDisabled },
  buttonText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.onAccent,
  },
  buttonSecondaryText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textPrimary,
  },
  section: { gap: theme.spacing.sm },
  sectionTitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textMuted,
  },
  alarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.surfaceMuted,
  },
  alarmBody: { flex: 1, gap: 2 },
  alarmTime: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
});
