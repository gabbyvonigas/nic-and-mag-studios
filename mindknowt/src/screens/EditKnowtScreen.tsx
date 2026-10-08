import { useCallback, useEffect, useState } from 'react';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
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

import { resyncAlarmsQuietly } from '../alarms';
import { Icon } from '../components/Icon';
import { PriorityBars } from '../components/KnowtCard';
import { Button, SubScreenHeader } from '../components/ui';
import {
  stopChoice,
  stopChoiceOf,
  type StopChoice,
} from '../knowts/modes';
import { StopChoiceRow } from '../components/StopChoiceRow';
import { isScanOnly } from '../knowts/scanOnly';
import {
  attachTag,
  deleteSchedule,
  detachTag,
  findKnowtByTagUid,
  reassignTag,
  describeRepeat,
  formatTime,
  getKnowt,
  listCategories,
  ModeUnavailableError,
  TagInUseError,
  PRIORITY_HIGH,
  PRIORITY_LOW,
  PRIORITY_NORMAL,
  setMode,
  updateKnowt,
} from '../db';
import { askToDropSchedules } from '../knowts/deletePrompt';
import { askToReassign, askToUnassign } from '../knowts/tagConflict';
import { nfcFailureMessage, nfcReader } from '../nfc';
import { useQuery } from '../db/useQuery';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Icon and label share one color, and the chosen one sits on lime. */
type Route = RouteProp<RootStackParamList, 'EditKnowt'>;

export function EditKnowtScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const { data: knowt, loading, reload } = useQuery(
    () => getKnowt(params.knowtId),
    [params.knowtId],
  );
  const { data: categories } = useQuery(() => listCategories(), []);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState('');
  const [notes, setNotes] = useState('');

  const [priority, setPriority] = useState<number>(PRIORITY_NORMAL);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fills the form once. Re-running on every query render would throw away
  // whatever is half typed.
  useEffect(() => {
    if (!knowt || loaded) return;
    setName(knowt.name);
    setCategoryId(knowt.category_id);
    setLocationNote(knowt.location_note ?? '');
    setNotes(knowt.notes ?? '');
    setPriority(knowt.priority);
    setLoaded(true);
  }, [knowt, loaded]);

  // Schedules are edited on their own screen and saved there, so coming back
  // has to re-read them. The typed fields above are untouched by this.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const tagged = !!knowt?.tag_uid;
  const scanOnly = !!knowt && isScanOnly(knowt);
  const stops: StopChoice = knowt ? stopChoiceOf(knowt) : 'alarm';

  /**
   * Moving a Knowt between the three ways it can stop.
   *
   * Two of them store the same mode, so there is no single field to set. What
   * separates Scan Knowt from Scan + Alarm is whether a schedule exists, which
   * means each direction has to do the thing that makes the choice true:
   * picking Scan Knowt removes the schedules, and picking either ringing option
   * from Scan Knowt has to go and get a time, because the app never invents
   * one.
   *
   * The same handler is on the detail screen. Kept as two short copies rather
   * than lifted into a hook, because the two screens differ in where they
   * report a failure and what they reload, and a hook taking four callbacks
   * would be longer than both.
   */
  const chooseStop = async (next: StopChoice) => {
    if (!knowt) return;
    const want = stopChoice(next);
    if (next === stopChoiceOf(knowt)) return;
    setError(null);

    try {
      if (!want.rings) {
        // Removing schedules is real data and the only way to stop something
        // ringing, so it asks. History survives: completions belong to the
        // Knowt, not to the schedule that prompted them.
        if (knowt.schedules.length > 0) {
          if (!(await askToDropSchedules(knowt.name, knowt.schedules.length))) {
            return;
          }
          for (const schedule of knowt.schedules) {
            await deleteSchedule(schedule.id);
          }
        }
        // Strict only if there is a tag to require, since `setMode` refuses it
        // otherwise. Either way it is scan-only, because that is decided by
        // having no schedule rather than by the mode.
        await setMode(knowt.id, knowt.tag_uid ? 'strict' : 'open');
        // The alarms armed for those schedules come down with them, or it
        // keeps ringing for a schedule that no longer exists.
        await resyncAlarmsQuietly();
        await reload();
        return;
      }

      await setMode(knowt.id, want.mode);
      await reload();

      // It has to ring, and nothing can ring without a time. Backing out of
      // that screen leaves it with no schedule, so it reads as Scan Knowt
      // again, which is the honest outcome of not giving it one.
      if (knowt.schedules.length === 0) {
        navigation.navigate('EditSchedule', { knowtId: knowt.id });
      }
    } catch (err) {
      setError(
        err instanceof ModeUnavailableError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err),
      );
    }
  };

  /**
   * Attaching lived only on the detail screen, which meant the editor could
   * offer Scan + Alarm, refuse it for want of a tag, and give no way to fix that
   * without leaving. It writes straight through rather than waiting for Save,
   * the same as it does on detail: the tag is a fact about the hardware, not a
   * draft edit, and the mode buttons above have to unlock the moment it lands.
   */
  const scanToAttach = async () => {
    setError(null);
    setScanning(true);
    try {
      const tag = await nfcReader.scanTag();
      const owner = await findKnowtByTagUid(tag.rawUid);
      if (owner && owner.id !== params.knowtId) {
        // Interrupts at the scan rather than reporting it somewhere the person
        // is not looking. Tags are rewritable, so a conflict is a choice.
        if (!(await askToReassign(owner.name, name.trim()))) return;
        await reassignTag(tag.rawUid, params.knowtId);
        await reload();
        return;
      }
      await attachTag(params.knowtId, tag.rawUid);
      await reload();
    } catch (err) {
      // Null only for backing out of the sheet, which is not a failure. Every
      // other reason says what happened; the copy is in `nfc/failureText.ts`.
      const failure = nfcFailureMessage(err);
      if (failure) setError(failure.text);
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!knowt) return;
    setSaving(true);
    setError(null);

    try {
      await updateKnowt(knowt.id, {
        name,
        categoryId,
        locationNote: locationNote.trim() || null,
        notes: notes.trim() || null,
        priority,
      });

      // How it stops is not saved here. It is applied the moment it is
      // chosen, because one of the three options deletes schedules and that
      // cannot sit in local state waiting for a button. The same reasoning
      // already applied to attaching a tag.

      // The name is the alarm's title, so an armed alarm is stale until this.
      await resyncAlarmsQuietly();
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !loaded) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!knowt) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          <SubScreenHeader title="Edit" onBack={() => navigation.goBack()} />
          <Text style={styles.body}>That Knowt no longer exists.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <SubScreenHeader
            title="Edit"
            backLabel="Cancel"
            onBack={() => navigation.goBack()}
          />

          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="What is it?"
            placeholderTextColor={theme.color.textMuted}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {(categories ?? []).map((category) => {
              const on = categoryId === category.id;
              const shades = categoryShades(category);
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setCategoryId(on ? null : category.id)}
                  style={[
                    styles.chip,
                    on && { backgroundColor: shades.color, borderColor: shades.color },
                  ]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('Categories')}>
            <Text style={styles.link}>Manage categories</Text>
          </Pressable>

          <Text style={styles.label}>How it stops</Text>
          {/* Applied immediately rather than on Save, the same as attaching a
              tag just above. Scan Knowt deletes schedules, which is not a draft
              edit that can sit in local state waiting for a button. */}
          <StopChoiceRow
            value={stops}
            tagged={tagged}
            onChange={(next) => void chooseStop(next)}
          />
          <Text style={styles.hint}>
            {stopChoice(stops).detail}
            {tagged ? '' : ' Scan + Alarm needs a tag attached first.'}
          </Text>

          <Button
            label={tagged ? 'Replace the Knowt tag' : 'Add a Knowt tag to scan'}
            variant="secondary"
            disabled={scanning || saving}
            onPress={() => void scanToAttach()}
          />
          {tagged ? (
            <Text style={styles.tagUid} selectable>
              {knowt.tag_uid}
            </Text>
          ) : null}

          <Text style={styles.label}>When it happens</Text>
          {scanOnly ? (
            <Text style={styles.hint}>
              No alarm. It sits on Daily every day under Anytime today until
              you scan its tag.
            </Text>
          ) : (
            knowt.schedules.map((schedule) => (
              <Pressable
                key={schedule.id}
                accessibilityRole="button"
                accessibilityLabel={`Edit the ${formatTime(schedule.time)} schedule`}
                onPress={() =>
                  navigation.navigate('EditSchedule', {
                    knowtId: knowt.id,
                    scheduleId: schedule.id,
                  })
                }
                style={({ pressed }) => [
                  styles.scheduleRow,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.scheduleMain}>
                  <Text style={styles.scheduleTime}>
                    {formatTime(schedule.time)}
                    {schedule.label ? `, ${schedule.label}` : ''}
                  </Text>
                  <Text style={styles.scheduleRepeat}>
                    {describeRepeat(schedule)}
                    {schedule.enabled ? '' : ', paused'}
                  </Text>
                </View>
                <Icon name="forward" color={theme.color.textMuted} />
              </Pressable>
            ))
          )}
          {scanOnly ? null : (
            <Button
              label="Add a schedule"
              variant="secondary"
              onPress={() =>
                navigation.navigate('EditSchedule', { knowtId: knowt.id })
              }
            />
          )}

          <Text style={styles.label}>Where it lives</Text>
          <TextInput
            style={styles.input}
            value={locationNote}
            onChangeText={setLocationNote}
            placeholder="Kitchen, under the sink."
            placeholderTextColor={theme.color.textMuted}
          />

          <Text style={styles.label}>Priority</Text>
          <View style={styles.priorityRow}>
            {[
              { value: PRIORITY_LOW, label: 'Low' },
              { value: PRIORITY_NORMAL, label: 'Normal' },
              { value: PRIORITY_HIGH, label: 'High' },
            ].map((level) => {
              const on = priority === level.value;
              return (
                <Pressable
                  key={level.value}
                  accessibilityRole="button"
                  accessibilityLabel={`${level.label} priority`}
                  accessibilityState={{ selected: on }}
                  onPress={() => setPriority(level.value)}
                  style={[styles.priority, on && styles.priorityOn]}>
                  {/* The same bars the cards use, so the control and the
                      result are recognizably the same thing. */}
                  <PriorityBars
                    priority={level.value}
                    color={on ? theme.color.textPrimary : theme.color.textMuted}
                    size={14}
                  />
                  <Text
                    style={[styles.priorityText, on && styles.priorityTextOn]}>
                    {level.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            Priority orders a category when it is expanded. It does not change
            when anything rings.
          </Text>

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Filter size, product name, dosage."
            placeholderTextColor={theme.color.textMuted}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={saving ? 'Saving' : 'Save changes'}
            variant="highlight"
            disabled={name.trim().length === 0 || saving}
            onPress={() => void save()}
          />
          <Text style={styles.footerHint}>
            Schedules save on their own screen.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  loading: {
    flex: 1,
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  label: {
    marginTop: theme.spacing.lg,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  body: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textBody,
  },
  hint: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  link: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  input: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  notesInput: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    lineHeight: 22,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    minHeight: 100,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.color.surface,
  },
  chipText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  chipTextOn: { color: theme.color.onAccent },
  priorityRow: { flexDirection: 'row', gap: theme.spacing.sm },
  priority: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.color.surface,
  },
  priorityOn: { borderColor: theme.color.accent, borderWidth: 2 },
  priorityText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  priorityTextOn: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
  },
  addRow: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
  },
  addRowText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.accent,
  },
  tagUid: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
    textAlign: 'center',
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  pressed: { opacity: 0.7 },
  scheduleMain: { flex: 1, gap: 2 },
  scheduleTime: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
    ...theme.font.tabular,
  },
  scheduleRepeat: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  chevron: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xl,
    color: theme.color.textMuted,
  },
  banner: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.dangerBorder,
    backgroundColor: theme.color.dangerSurface,
    padding: theme.spacing.md,
  },
  bannerText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.dangerText,
  },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  footerHint: {
    textAlign: 'center',
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
});
