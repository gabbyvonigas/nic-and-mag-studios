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
import { Button, SubScreenHeader } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  getKnowt,
  listCategories,
  ModeUnavailableError,
  setMode,
  updateKnowt,
  type KnowtMode,
} from '../db';
import { useQuery } from '../db/useQuery';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EditKnowt'>;

const MODES: { value: KnowtMode; label: string; detail: string }[] = [
  {
    value: 'strict',
    label: 'Strict',
    detail: 'Keeps ringing until the right tag is scanned.',
  },
  { value: 'soft', label: 'Soft', detail: 'Scan it, or dismiss it.' },
  { value: 'open', label: 'Open', detail: 'No tag. Tap done when it is done.' },
];

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
  const [mode, setModeChoice] = useState<KnowtMode>('open');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fills the form once. Re-running on every query render would throw away
  // whatever is half typed.
  useEffect(() => {
    if (!knowt || loaded) return;
    setName(knowt.name);
    setCategoryId(knowt.category_id);
    setLocationNote(knowt.location_note ?? '');
    setNotes(knowt.notes ?? '');
    setModeChoice(knowt.mode);
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
            // whole edit back over one field. Held in a local because the
            // captured `error` is still the value from this render.
            problem = err.message;
            setError(err.message);
          } else {
            throw err;
          }
        }
      }

      // The name is the alarm's title, so an armed alarm is stale until this.
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
          {MODES.map((option) => {
            const on = mode === option.value;
            const blocked = option.value !== 'open' && !tagged;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on, disabled: blocked }}
                disabled={blocked}
                onPress={() => setModeChoice(option.value)}
                style={[
                  styles.option,
                  on && styles.optionOn,
                  blocked && styles.optionBlocked,
                ]}>
                <Text
                  style={[
                    styles.optionLabel,
                    on && styles.optionLabelOn,
                    blocked && styles.optionTextBlocked,
                  ]}>
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.optionDetail,
                    blocked && styles.optionTextBlocked,
                  ]}>
                  {blocked ? 'Needs a tag attached first.' : option.detail}
                </Text>
              </Pressable>
            );
          })}

          <Text style={styles.label}>Schedules</Text>
          {knowt.schedules.length === 0 ? (
            <Text style={styles.hint}>
              No schedules. Without one this never rings on its own.
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
                <Text style={styles.chevron}>{'›'}</Text>
              </Pressable>
            ))
          )}
          <Button
            label="Add a schedule"
            variant="secondary"
            onPress={() =>
              navigation.navigate('EditSchedule', { knowtId: knowt.id })
            }
          />

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
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={saving ? 'Saving' : 'Save changes'}
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
  option: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    backgroundColor: theme.color.surface,
    gap: 2,
  },
  optionOn: { borderColor: theme.color.accent, borderWidth: 2 },
  optionBlocked: { backgroundColor: theme.color.surfaceMuted },
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
  optionTextBlocked: { color: theme.color.textMuted },
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
