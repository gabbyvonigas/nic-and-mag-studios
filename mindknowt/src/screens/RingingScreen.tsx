import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Animated,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../components/ui';
import { HoldToConfirm } from '../components/HoldToConfirm';
import { describeRepeat, formatTime } from '../db';
import { useRingingSession } from '../ringing/useRingingSession';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'Ringing'>;

/**
 * Long enough that it cannot happen by accident, short enough that it is not a
 * punishment. Typing a word on top of this was too much: the point is to make
 * skipping deliberate, not tedious.
 */
const OVERRIDE_HOLD_MS = 3_000;

/**
 * The scan sheet is opened for you when the screen appears, so stopping an
 * alarm is one motion: slide to stop, then hold the phone to the tag. This
 * delay lets the screen present first, so the system sheet slides over
 * something rather than over a blank frame.
 */
const AUTO_SCAN_DELAY_MS = 400;

/**
 * Deliberate deferrals, offered in every mode. Snooze is the quick one; these
 * are for "not now, but later today". Choosing one is recorded as a snooze, so
 * the knowt still reads as not done.
 */
const REMIND_OPTIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
] as const;

function RingIndicator({ active }: { active: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  return (
    <View style={styles.ringRow}>
      <View style={styles.ringDot}>
        <Animated.View
          style={[
            styles.ringHalo,
            {
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) },
              ],
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            },
          ]}
        />
      </View>
      <Text style={styles.ringLabel}>RINGING</Text>
    </View>
  );
}

export function RingingScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const {
    knowt,
    loading,
    resolved,
    scanning,
    message,
    scanToStop,
    remindIn,
    snooze,
    complete,
    saveKnowtNotes,
    saveEventNote,
  } = useRingingSession(params.knowtId, params.scheduleId ?? null);

  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [eventNote, setEventNote] = useState('');
  const [showEventNote, setShowEventNote] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const autoScanned = useRef(false);

  useEffect(() => {
    if (knowt && !notesDirty) setNotesDraft(knowt.notes ?? '');
  }, [knowt, notesDirty]);

  const leave = () => navigation.navigate('Tabs', { screen: 'Today' });

  /**
   * Runs an action and leaves only if it resolved the alarm. A handler that
   * returns false, such as a wrong tag or a failed scan, keeps the screen up and the
   * alarm ringing.
   */
  const finish = useCallback(
    async (run: () => Promise<boolean | void>) => {
      const outcome = await run();
      if (outcome === false) return;
      if (eventNote.trim()) await saveEventNote(eventNote);
      leave();
    },
    // `leave` and `eventNote` are read fresh on each call, so re-creating this
    // when they change is what keeps the auto-scan effect honest.
    [eventNote, saveEventNote, navigation],
  );

  /**
   * Opens the scan sheet as soon as the screen is up. Once per mount: if the
   * sheet is dismissed, the alarm keeps ringing and the button is there, but
   * reopening it automatically would trap the phone in a loop of sheets.
   *
   * Waits for `active` because an alarm dismissal relaunches the app, and a
   * scan session requested before the app is frontmost is rejected by iOS.
   */
  useEffect(() => {
    if (loading || !knowt || resolved) return;
    if (autoScanned.current) return;
    if (knowt.mode === 'open' || !knowt.tag_uid) return;

    autoScanned.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      timer = setTimeout(() => void finish(scanToStop), AUTO_SCAN_DELAY_MS);
    };

    if (AppState.currentState === 'active') {
      start();
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sub.remove();
        start();
      }
    });
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [loading, knowt, resolved, finish, scanToStop]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!knowt) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.missing}>
          <Text style={styles.body}>That knowt no longer exists.</Text>
          <Button label="Back to today" onPress={leave} />
        </View>
      </SafeAreaView>
    );
  }

  const schedule = knowt.schedules.find((s) => s.id === params.scheduleId) ?? null;
  const strict = knowt.mode === 'strict';
  const soft = knowt.mode === 'soft';
  const open = knowt.mode === 'open';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <RingIndicator active={!resolved} />

          <Text style={styles.name}>{knowt.name}</Text>
          {schedule ? (
            <Text style={styles.scheduleLabel}>
              {schedule.label ? `${schedule.label} · ` : ''}
              {formatTime(schedule.time)} · {describeRepeat(schedule)}
            </Text>
          ) : null}
          {knowt.location_note ? (
            <Text style={styles.location}>{knowt.location_note}</Text>
          ) : null}

          {message ? (
            <View
              style={[
                styles.banner,
                message.tone === 'warn' ? styles.bannerWarn : styles.bannerDanger,
              ]}>
              <Text
                style={[
                  styles.bannerText,
                  message.tone === 'warn' ? styles.textWarn : styles.textDanger,
                ]}>
                {message.text}
              </Text>
            </View>
          ) : null}

          {/* The note is the highest-value real estate in the app: standing in
              front of the thing is exactly when the detail matters, and when
              you learn what is worth writing down. So it renders in full and
              is editable right here. */}
          <Text style={styles.sectionTitle}>Note</Text>
          <TextInput
            style={styles.noteInput}
            value={notesDraft}
            onChangeText={(text) => {
              setNotesDraft(text);
              setNotesDirty(true);
            }}
            placeholder="Filter size, product name, dosage, phone number."
            placeholderTextColor={theme.color.textMuted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
          />
          {notesDirty ? (
            <Button
              label="Save note"
              variant="secondary"
              onPress={async () => {
                await saveKnowtNotes(notesDraft);
                setNotesDirty(false);
              }}
            />
          ) : null}

          {showEventNote ? (
            <>
              <Text style={styles.sectionTitle}>Note for this time</Text>
              <TextInput
                style={styles.eventNoteInput}
                value={eventNote}
                onChangeText={setEventNote}
                placeholder="Used the last one."
                placeholderTextColor={theme.color.textMuted}
                multiline
                scrollEnabled={false}
                textAlignVertical="top"
              />
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowEventNote(true)}>
              <Text style={styles.link}>Add a note</Text>
            </Pressable>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {(strict || soft) && (
            <Button
              label={scanning ? 'Scanning…' : 'Scan to stop'}
              disabled={scanning}
              onPress={() => void finish(scanToStop)}
            />
          )}

          {open && (
            <Button label="Done" onPress={() => void finish(() => complete('tap'))} />
          )}

          <Button
            label="Snooze"
            variant="secondary"
            onPress={() => void finish(snooze)}
          />

          {soft && (
            <Button
              label="Dismiss"
              variant="quiet"
              onPress={() => void finish(() => complete('tap'))}
            />
          )}

          <View style={styles.remindRow}>
            <Text style={styles.remindLabel}>Remind me in</Text>
            {REMIND_OPTIONS.map((option) => (
              <Pressable
                key={option.minutes}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => void finish(() => remindIn(option.minutes))}>
                <Text style={styles.remindOption}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          {strict && (
            <View style={styles.overrideArea}>
              {overrideOpen ? (
                <View style={styles.overridePanel}>
                  <Text style={styles.overrideHint}>
                    Stops the alarm without scanning, and is recorded as an
                    override.
                  </Text>
                  <HoldToConfirm
                    label="Hold to override"
                    holdMs={OVERRIDE_HOLD_MS}
                    onComplete={() => void finish(() => complete('override'))}
                  />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setOverrideOpen(false)}>
                    <Text style={styles.overrideLink}>Cancel</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setOverrideOpen(true)}>
                  {/* Never hidden entirely: there must always be a way out. */}
                  <Text style={styles.overrideLink}>Override</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  missing: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  ringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  ringDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.color.dangerText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringHalo: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.color.dangerText,
  },
  ringLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.dangerText,
    letterSpacing: 1,
  },
  name: {
    fontFamily: theme.font.body,
    fontSize: 36,
    fontWeight: theme.font.weight.bold,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  scheduleLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  location: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textMuted,
  },
  body: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textBody,
  },
  banner: {
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  bannerWarn: {
    backgroundColor: theme.color.warningSurface,
    borderColor: theme.color.warningBorder,
  },
  bannerDanger: {
    backgroundColor: theme.color.dangerSurface,
    borderColor: theme.color.dangerBorder,
  },
  bannerText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
  },
  textWarn: { color: theme.color.warningText },
  textDanger: { color: theme.color.dangerText },
  sectionTitle: {
    marginTop: theme.spacing.lg,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noteInput: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    lineHeight: 26,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.surfaceMuted,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    minHeight: 120,
  },
  eventNoteInput: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    minHeight: 72,
  },
  link: {
    marginTop: theme.spacing.md,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textSecondary,
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  remindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  remindLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  remindOption: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textSecondary,
  },
  overrideArea: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  overridePanel: { gap: theme.spacing.sm },
  overrideHint: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  overrideLink: {
    textAlign: 'center',
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
});
