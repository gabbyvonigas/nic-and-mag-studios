import { useEffect, useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
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
import { TimeWheel } from '../components/TimeWheel';
import {
  addSchedule,
  deleteSchedule,
  getSchedule,
  toISODate,
  updateSchedule,
  type RepeatType,
} from '../db';
import { useQuery } from '../db/useQuery';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EditSchedule'>;

const REPEATS: { value: RepeatType; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'days_of_week', label: 'Certain days' },
  { value: 'interval', label: 'Every few days' },
  { value: 'once', label: 'Just once' },
];

/** Sunday = 1, matching the schema and AlarmKit. */
const DAYS = [
  { value: 1, label: 'Sun' },
  { value: 2, label: 'Mon' },
  { value: 3, label: 'Tue' },
  { value: 4, label: 'Wed' },
  { value: 5, label: 'Thu' },
  { value: 6, label: 'Fri' },
  { value: 7, label: 'Sat' },
];

function parseDays(json: string | null): number[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

export function EditScheduleScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const existingId = params.scheduleId ?? null;

  const { data: existing, loading } = useQuery(
    () => (existingId ? getSchedule(existingId) : Promise.resolve(null)),
    [existingId],
  );

  // A new schedule opens on a time nobody has chosen yet, so the wheel has to
  // start somewhere. This is a starting position for a control the person is
  // about to turn, not a value saved on their behalf: nothing is written until
  // Save, and Add a knowt still refuses to guess for them.
  const [time, setTime] = useState('08:00');
  const [repeatType, setRepeatType] = useState<RepeatType>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState('2');
  const [label, setLabel] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    if (existingId && !existing) return;

    if (existing) {
      setTime(existing.time);
      setRepeatType(existing.repeat_type);
      setDays(parseDays(existing.days_of_week));
      setIntervalDays(`${existing.interval_days ?? 2}`);
      setLabel(existing.label ?? '');
    }
    setLoaded(true);
  }, [existing, existingId, loaded]);

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const interval = Number(intervalDays);
  const intervalOk = Number.isInteger(interval) && interval >= 1 && interval <= 365;

  const canSave =
    repeatType === 'days_of_week'
      ? days.length > 0
      : repeatType === 'interval'
        ? intervalOk
        : true;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const fields = {
        time,
        repeatType,
        label: label.trim() || null,
        daysOfWeek: repeatType === 'days_of_week' ? days : null,
        intervalDays: repeatType === 'interval' ? interval : null,
        // An interval counts from a start date, and a one-off needs a day to
        // land on. Both are today unless one is already stored.
        startDate:
          repeatType === 'interval' || repeatType === 'once'
            ? (existing?.start_date ?? toISODate(new Date()))
            : null,
      };

      if (existingId) {
        await updateSchedule(existingId, fields);
      } else {
        await addSchedule(params.knowtId, {
          time: fields.time,
          repeatType: fields.repeatType,
          label: fields.label,
          daysOfWeek: fields.daysOfWeek ?? undefined,
          intervalDays: fields.intervalDays ?? undefined,
          startDate: fields.startDate ?? undefined,
        });
      }

      // This is when it rings, so the armed alarm is wrong until this runs.
      await resyncAlarmsQuietly();
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!existingId) return;
    Alert.alert(
      'Remove this schedule?',
      'It stops ringing. Everything it has already recorded is kept.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              await deleteSchedule(existingId);
              await resyncAlarmsQuietly();
              navigation.goBack();
            })(),
        },
      ],
    );
  };

  if (loading || !loaded) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <ActivityIndicator color={theme.color.textSecondary} />
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
            title={existingId ? 'Edit schedule' : 'New schedule'}
            backLabel="Cancel"
            onBack={() => navigation.goBack()}
          />

          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Time</Text>
          <TimeWheel value={time} onChange={setTime} />

          <Text style={styles.label}>How often</Text>
          <View style={styles.chips}>
            {REPEATS.map((repeat) => {
              const on = repeatType === repeat.value;
              return (
                <Pressable
                  key={repeat.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setRepeatType(repeat.value)}
                  style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {repeat.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {repeatType === 'days_of_week' ? (
            <>
              <Text style={styles.label}>Which days</Text>
              <View style={styles.dayRow}>
                {DAYS.map((day) => {
                  const on = days.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      accessibilityRole="button"
                      accessibilityLabel={day.label}
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleDay(day.value)}
                      style={[styles.day, on && styles.dayOn]}>
                      <Text style={[styles.dayText, on && styles.dayTextOn]}>
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {days.length === 0 ? (
                <Text style={styles.errorHint}>Pick at least one day.</Text>
              ) : null}
            </>
          ) : null}

          {repeatType === 'interval' ? (
            <>
              <Text style={styles.label}>How many days apart</Text>
              <View style={styles.intervalRow}>
                <TextInput
                  style={styles.intervalInput}
                  value={intervalDays}
                  onChangeText={setIntervalDays}
                  keyboardType="number-pad"
                  maxLength={3}
                />
                <Text style={styles.intervalSuffix}>
                  {interval === 1 ? 'day' : 'days'}
                </Text>
              </View>
              {!intervalOk ? (
                <Text style={styles.errorHint}>
                  Enter a whole number of days, 1 or more.
                </Text>
              ) : null}
            </>
          ) : null}

          <Text style={styles.label}>Label</Text>
          <TextInput
            style={styles.input}
            value={label}
            onChangeText={setLabel}
            placeholder="Morning, Evening. Optional."
            placeholderTextColor={theme.color.textMuted}
          />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={saving ? 'Saving' : 'Save schedule'}
            disabled={!canSave || saving}
            onPress={() => void save()}
          />
          {existingId ? (
            <Button label="Remove schedule" variant="quiet" onPress={confirmDelete} />
          ) : null}
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
  errorHint: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.dangerText,
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
  chipOn: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  chipText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  chipTextOn: { color: theme.color.onAccent },
  dayRow: { flexDirection: 'row', gap: theme.spacing.xs },
  day: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    backgroundColor: theme.color.surface,
  },
  dayOn: { backgroundColor: theme.color.accent, borderColor: theme.color.accent },
  dayText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textPrimary,
  },
  dayTextOn: { fontFamily: theme.font.face.medium, color: theme.color.onAccent },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  intervalInput: {
    width: 90,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    textAlign: 'center',
  },
  intervalSuffix: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
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
    gap: theme.spacing.sm,
  },
});
