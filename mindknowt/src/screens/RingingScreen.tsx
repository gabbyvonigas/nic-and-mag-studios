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
import { Icon } from '../components/Icon';
import { HoldToConfirm } from '../components/HoldToConfirm';
import { TimePicker } from '../components/TimePicker';
import { describeRepeat, formatTime } from '../db';
import { leaveRinging } from '../navigation/navigationRef';
import { canScan, requiresScan } from '../knowts/modes';
import { isScanOnly } from '../knowts/scanOnly';
import { shouldLeaveAfter } from '../ringing/finishAction';
import { useRingingSession } from '../ringing/useRingingSession';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * An HH:MM on today's date, as a timestamp.
 *
 * Today, never yesterday: a time later than now means the clock was wound
 * forward by mistake, not that the thing was done tomorrow, and clamping to now
 * keeps a completion from being recorded in the future.
 */
function atToday(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  const now = new Date();
  const at = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour ?? 0,
    minute ?? 0,
  );
  return Math.min(at.getTime(), now.getTime());
}
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
    eventNote,
    setEventNote,
  } = useRingingSession(params.knowtId, params.scheduleId ?? null);

  const [notesDraft, setNotesDraft] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);
  const [showEventNote, setShowEventNote] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  /**
   * What time to record, when the override is taken away from the tag. Starts
   * at now, which is the honest default when someone is doing it right now, and
   * can be wound back to when they actually did the thing.
   */
  const [doneAt, setDoneAt] = useState(() => {
    const at = new Date();
    return `${`${at.getHours()}`.padStart(2, '0')}:${`${at.getMinutes()}`.padStart(2, '0')}`;
  });
  const autoScanned = useRef(false);

  useEffect(() => {
    if (knowt && !notesDirty) setNotesDraft(knowt.notes ?? '');
  }, [knowt, notesDirty]);

  const leave = useCallback(() => {
    // One way out, and it does not depend on what is underneath. Falls back to
    // this screen's own navigation only if the navigator is somehow not ready.
    if (!leaveRinging()) navigation.navigate('Tabs', { screen: 'Daily' });
  }, [navigation]);

  /**
   * Runs an action and leaves unless the action said it did not take. A handler
   * that returns false, such as a wrong tag or a snooze AlarmKit refused, keeps
   * the screen up and the alarm ringing, and has already put a message on it.
   *
   * The rule itself is `shouldLeaveAfter`, in its own file with the account of
   * why Done used to complete the Knowt and leave the screen standing. The note
   * is no longer saved here: the session writes it with the completion, so it
   * is not the last thing in a queue of awaits behind a navigation.
   */
  const finish = useCallback(
    async (run: () => Promise<boolean | void>) => {
      if (!(await shouldLeaveAfter(run))) return;
      leave();
    },
    [leave],
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
    // Only when the scan is required. Opening the sheet unasked on a knowt
    // that can simply be dismissed is an interruption, not a shortcut.
    if (!requiresScan(knowt.mode) || !knowt.tag_uid) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    /**
     * The "once" claim is made here rather than when the effect runs, which is
     * the fix for a scan that could be lost entirely. The effect depends on
     * `knowt`, `finish` and `scanToStop`, so any of them changing tears down
     * the AppState listener below and re-runs this; claiming the scan up front
     * meant the re-run saw the claim, returned early, and left nothing
     * subscribed and nothing scheduled. Claiming it at the moment a scan is
     * actually scheduled still allows exactly one, and cannot lose it.
     */
    const start = () => {
      if (autoScanned.current) return;
      autoScanned.current = true;
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
          <Text style={styles.body}>That Knowt no longer exists.</Text>
          <Button label="Back to today" onPress={leave} />
        </View>
      </SafeAreaView>
    );
  }

  const schedule = knowt.schedules.find((s) => s.id === params.scheduleId) ?? null;
  /**
   * A standing item with no alarm, opened by tapping its card rather than by
   * anything going off. The screen is the same screen, because the scan, the
   * sheet, the note and the completion are all the same; what changes is
   * everything that assumes a ring. Nothing says RINGING, nothing offers to
   * snooze or remind later, and a Knowt with no tag gets a way to attach one
   * rather than being stuck.
   */
  const scanOnly = isScanOnly(knowt);
  const tagged = !!knowt.tag_uid;
  const scanRequired = requiresScan(knowt.mode);
  // Alarm Only with a tag can still be scanned, it just does not have to be.
  const scanOffered = canScan(knowt.mode, knowt.tag_uid);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          {scanOnly ? (
            <View style={styles.standingRow}>
              <Icon name="scan" role="row" color={theme.color.textSecondary} />
              <Text style={styles.standingLabel}>SCAN ONLY</Text>
            </View>
          ) : (
            <RingIndicator active={!resolved} />
          )}

          <Text style={styles.name}>{knowt.name}</Text>
          {scanOnly ? (
            <Text style={styles.scheduleLabel}>
              No alarm. Scan its tag whenever you pass it.
            </Text>
          ) : null}
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
          {/* Nothing here defers, because there is nothing to defer. A snooze
              and a "remind me in" both reschedule an alarm, and a scan-only
              Knowt has none to reschedule: offering them would promise a ring
              that the person chose not to have. */}
          {scanOnly ? (
            tagged ? (
              <>
                <Button
                  label={scanning ? 'Scanning' : 'Scan the tag'}
                  disabled={scanning}
                  onPress={() => void finish(scanToStop)}
                />
                <Button
                  label="Mark done"
                  variant="secondary"
                  onPress={() => void finish(() => complete('tap'))}
                />
                <Text style={styles.footerNote}>
                  Marking it done records it without a scan, which is what the
                  Log will show.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.footerNote}>
                  This Knowt has no tag yet, so there is nothing to scan.
                  Attach one and it will be ready the next time you pass it.
                </Text>
                <Button
                  label="Attach a Knowt Tag"
                  onPress={() =>
                    navigation.navigate('EditKnowt', { knowtId: knowt.id })
                  }
                />
                <Button
                  label="Mark done"
                  variant="secondary"
                  onPress={() => void finish(() => complete('tap'))}
                />
              </>
            )
          ) : (
            <>
              {scanRequired ? (
                <Button
                  label={scanning ? 'Scanning' : 'Scan the tag'}
                  disabled={scanning}
                  onPress={() => void finish(scanToStop)}
                />
              ) : (
                <Button
                  label="Done"
                  onPress={() => void finish(() => complete('tap'))}
                />
              )}

              {!scanRequired && scanOffered ? (
                <Button
                  label={scanning ? 'Scanning' : 'Scan the tag instead'}
                  variant="secondary"
                  disabled={scanning}
                  onPress={() => void finish(scanToStop)}
                />
              ) : null}

              {/* The duration is the whole question a person has about this
                  button, and it was the one thing the label did not say. */}
              <Button
                label={`Snooze ${knowt.snooze_minutes} min`}
                variant="secondary"
                onPress={() => void finish(snooze)}
              />

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
            </>
          )}

          {!scanOnly && scanRequired && (
            <View style={styles.overrideArea}>
              {overrideOpen ? (
                <View style={styles.overridePanel}>
                  <Text style={styles.overrideHint}>
                    Not near the tag? Snooze it until you are, or mark it done
                    and say when. Either way it is recorded as an override, not
                    as a scan.
                  </Text>

                  <Button
                    label={`Snooze ${knowt.snooze_minutes} min until I am there`}
                    variant="secondary"
                    onPress={() => void finish(snooze)}
                  />

                  <Text style={styles.overrideLabel}>Done at</Text>
                  <TimePicker compact value={doneAt} onChange={setDoneAt} />

                  <HoldToConfirm
                    label={`Hold to mark done at ${formatTime(doneAt)}`}
                    holdMs={OVERRIDE_HOLD_MS}
                    onComplete={() =>
                      void finish(() => complete('override', atToday(doneAt)))
                    }
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
    color: theme.color.dangerText,
    letterSpacing: 1,
  },
  // The same place and the same weight as RINGING, in the quiet gray rather
  // than the alarm red, and with no pulse: nothing is happening to you here.
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  standingLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    letterSpacing: 1,
  },
  footerNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textMuted,
  },
  name: {
    fontFamily: theme.font.body,
    fontSize: 36,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  scheduleLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
    ...theme.font.tabular,
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
  },
  textWarn: { color: theme.color.warningText },
  textDanger: { color: theme.color.dangerText },
  sectionTitle: {
    marginTop: theme.spacing.lg,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
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
    color: theme.color.textSecondary,
  },
  overrideArea: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  overrideLabel: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
