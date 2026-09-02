import { useEffect, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
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
import { Button, SubScreenHeader } from '../components/ui';
import {
  addSchedule,
  deleteSchedule,
  formatTime,
  getKnowt,
  listCategories,
  ModeUnavailableError,
  parseTimeInput,
  setMode,
  toISODate,
  updateKnowt,
  updateSchedule,
  type KnowtMode,
  type RepeatType,
  type ScheduleRow,
} from '../db';
import { useQuery } from '../db/useQuery';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EditKnowt'>;

const REPEATS: { value: RepeatType; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'once', label: 'Once' },
];

const MODES: { value: KnowtMode; label: string; detail: string }[] = [
  { value: 'strict', label: 'Strict', detail: 'Only the right tag stops it.' },
  { value: 'soft', label: 'Soft', detail: 'Scan, or dismiss.' },
  { value: 'open', label: 'Open', detail: 'No tag. Tap done.' },
];

/** A schedule being edited, held as typed text until it is saved. */
type ScheduleDraft = {
  /** Existing row id, or null for one being added. */
  id: string | null;
  time: string;
  repeatType: RepeatType;
  removed: boolean;
};

function toDraft(row: ScheduleRow): ScheduleDraft {
  return {
    id: row.id,
    time: formatTime(row.time),
    repeatType: row.repeat_type,
    removed: false,
  };
}

export function EditKnowtScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const { data: knowt, loading } = useQuery(
    () => getKnowt(params.knowtId),
    [params.knowtId],
  );
  const { data: categories } = useQuery(() => listCategories(), []);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [locationNote, setLocationNote] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setModeChoice] = useState<KnowtMode>('open');
  const [drafts, setDrafts] = useState<ScheduleDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fills the form once. Re-running on every render of the query would throw
  // away whatever is half typed.
  useEffect(() => {
    if (!knowt || loaded) return;
    setName(knowt.name);
    setCategoryId(knowt.category_id);
    setLocationNote(knowt.location_note ?? '');
    setNotes(knowt.notes ?? '');
    setModeChoice(knowt.mode);
    setDrafts(knowt.schedules.map(toDraft));
    setLoaded(true);
  }, [knowt, loaded]);

  const editDraft = (index: number, patch: Partial<ScheduleDraft>) => {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  };

  const addDraft = () => {
    // No time is filled in. A guessed time is a time nobody chose.
    setDrafts((prev) => [
      ...prev,
      { id: null, time: '', repeatType: 'daily', removed: false },
    ]);
  };

  const visible = drafts.filter((d) => !d.removed);
  const badTime = visible.find((d) => parseTimeInput(d.time) === null);
  const canSave = name.trim().length > 0 && !badTime;

  const save = async () => {
    if (!knowt) return;
    setSaving(true);
    setError(null);
    let problem: string | null = null;

    try {
      await updateKnowt(knowt.id, {
        name,
        categoryId,
        locationNote: locationNote.trim() || null,
        notes: notes.trim() || null,
      });

      if (mode !== knowt.mode) {
        try {
          await setMode(knowt.id, mode);
        } catch (err) {
          if (err instanceof ModeUnavailableError) {
            // Everything else saved. Say what did not, rather than rolling the
            // whole edit back over one field. Tracked in a local because the
            // captured `error` is still the value from this render.
            problem = err.message;
            setError(err.message);
          } else {
            throw err;
          }
        }
      }

      for (const draft of drafts) {
        if (draft.removed) {
          if (draft.id) await deleteSchedule(draft.id);
          continue;
        }

        const time = parseTimeInput(draft.time);
        if (!time) continue;
        const startDate =
          draft.repeatType === 'once' ? toISODate(new Date()) : null;

        if (draft.id) {
          await updateSchedule(draft.id, {
            time,
            repeatType: draft.repeatType,
            startDate,
          });
        } else {
          await addSchedule(knowt.id, {
            time,
            repeatType: draft.repeatType,
            startDate: startDate ?? undefined,
          });
        }
      }

      // The name is the alarm's title and the times are when it rings, so the
      // armed alarms are stale until this runs.
      await resyncAlarmsQuietly();

      if (!problem) navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !loaded) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!knowt) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.content}>
          <SubScreenHeader title="Edit" onBack={() => navigation.goBack()} />
          <Text style={styles.body}>That knowt no longer exists.</Text>
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
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setCategoryId(on ? null : category.id)}
                  style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Mode</Text>
          {MODES.map((option) => {
            const on = mode === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setModeChoice(option.value)}
                style={[styles.option, on && styles.optionOn]}>
                <Text style={[styles.optionLabel, on && styles.optionLabelOn]}>
                  {option.label}
                </Text>
                <Text style={styles.optionDetail}>{option.detail}</Text>
              </Pressable>
            );
          })}
          {!knowt.tag_uid ? (
            <Text style={styles.hint}>
              Strict and Soft both need a tag. Add one from the knowt screen
              first.
            </Text>
          ) : null}

          <Text style={styles.label}>Where it lives</Text>
          <TextInput
            style={styles.input}
            value={locationNote}
            onChangeText={setLocationNote}
            placeholder="Kitchen, under the sink."
            placeholderTextColor={theme.color.textMuted}
          />

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

          <Text style={styles.label}>Schedules</Text>
          {visible.length === 0 ? (
            <Text style={styles.hint}>
              No schedules. Without one this never rings on its own.
            </Text>
          ) : null}

          {drafts.map((draft, index) => {
            if (draft.removed) return null;
            const parsed = parseTimeInput(draft.time);
            return (
              <View key={draft.id ?? `new-${index}`} style={styles.scheduleCard}>
                <View style={styles.scheduleTop}>
                  <TextInput
                    style={[styles.timeInput, !parsed && styles.timeInputBad]}
                    value={draft.time}
                    onChangeText={(text) => editDraft(index, { time: text })}
                    placeholder="8:00 am"
                    placeholderTextColor={theme.color.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove this schedule"
                    hitSlop={8}
                    onPress={() => editDraft(index, { removed: true })}>
                    <Text style={styles.removeLink}>Remove</Text>
                  </Pressable>
                </View>

                <View style={styles.chips}>
                  {REPEATS.map((repeat) => {
                    const on = draft.repeatType === repeat.value;
                    return (
                      <Pressable
                        key={repeat.value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() =>
                          editDraft(index, { repeatType: repeat.value })
                        }
                        style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {repeat.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {!parsed ? (
                  <Text style={styles.errorHint}>
                    Enter a time such as 8:00 am, 7pm or 19:30.
                  </Text>
                ) : null}
              </View>
            );
          })}

          <Button label="Add a schedule" variant="secondary" onPress={addDraft} />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={saving ? 'Saving' : 'Save changes'}
            disabled={!canSave || saving}
            onPress={() => void save()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.background,
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
  errorHint: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.dangerText,
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
  chipOn: {
    backgroundColor: theme.color.accent,
    borderColor: theme.color.accent,
  },
  chipText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  chipTextOn: { color: theme.color.onAccent },
  option: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.color.surface,
    gap: 2,
  },
  optionOn: { borderColor: theme.color.accent, borderWidth: 2 },
  optionLabel: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  optionLabelOn: { fontFamily: theme.font.face.bold },
  optionDetail: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  scheduleCard: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  scheduleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  timeInput: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    paddingVertical: theme.spacing.sm,
  },
  timeInputBad: { borderBottomColor: theme.color.dangerBorder },
  removeLink: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.dangerText,
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
  },
});
