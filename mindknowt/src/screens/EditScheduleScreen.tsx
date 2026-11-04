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
import { TimePicker } from '../components/TimePicker';
import { MonthCalendar } from '../components/MonthCalendar';
import {
  addSchedule,
  deleteSchedule,
  getSchedule,
  toISODate,
  updateSchedule,
} from '../db';
import {
  presetFor,
  REPEAT_PRESETS,
  shapeFor,
  type RepeatPresetId,
} from '../knowts/repeats';
import { useQuery } from '../db/useQuery';
import {
  advanceQueue,
  showStepCounter,
  stepLabel,
} from '../knowts/scheduleQueue';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

/** Midnight on the day a date falls in. Local, because every other one is. */
function midnight(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate());
}

/** Parses the `YYYY-MM-DD` the column stores, as a local day. */
function fromISODate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'EditSchedule'>;

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
  const [preset, setPreset] = useState<RepeatPresetId>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState('2');
  const [label, setLabel] = useState('');
  /**
   * The date an interval counts from, and the day a one-off lands on.
   *
   * This screen never asked for it. It wrote `today` into the column and told
   * you so in a line of hint text, which is the one thing the project's own
   * rule says never to do: a default the person should have chosen. The
   * calendar has existed since `8593265` and was only ever put in the Setup
   * step, so "When it rings", "Add a schedule" and "Edit schedule" have never
   * had one to show. Nothing removed it; it was never here.
   */
  const [startDate, setStartDate] = useState(() => midnight(new Date()));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) return;
    if (existingId && !existing) return;

    if (existing) {
      setTime(existing.time);
      setPreset(presetFor(existing));
      setDays(parseDays(existing.days_of_week));
      setIntervalDays(`${existing.interval_days ?? 2}`);
      setLabel(existing.label ?? '');
      // Editing keeps the schedule's own date, so its rhythm does not
      // silently restart on whatever day the screen was opened.
      const stored = existing.start_date ? fromISODate(existing.start_date) : null;
      if (stored) {
        setStartDate(stored);
        setVisibleMonth(new Date(stored.getFullYear(), stored.getMonth(), 1));
      }
    }
    setLoaded(true);
  }, [existing, existingId, loaded]);

  const toggleDay = (day: number) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  };

  const chosen = REPEAT_PRESETS.find((p) => p.id === preset) ?? REPEAT_PRESETS[0]!;
  const interval = Number(intervalDays);
  const intervalOk = Number.isInteger(interval) && interval >= 1 && interval <= 365;

  const canSave = chosen.needsDay
    ? days.length === 1
    : chosen.needsDays
      ? days.length > 0
      : chosen.needsCount
        ? intervalOk
        : true;

  /**
   * Where to go once this Knowt is dealt with, saved or skipped.
   *
   * `replace` rather than `navigate`, so backing out of the fourth screen in a
   * run does not walk back through the first three.
   */
  const leave = () => {
    const next = advanceQueue(params);
    if (next) {
      navigation.replace('EditSchedule', {
        knowtId: next.knowtId,
        queue: next.queue,
        step: next.step,
      });
      return;
    }
    // The run is over, or there never was one.
    if (params.step) navigation.navigate('Tabs', { screen: 'AllKnowts' });
    else navigation.goBack();
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      // One place decides what the columns become. The screen only collects
      // the answers the chosen preset asks for.
      const shape = shapeFor(preset, { days, count: interval });
      const fields = {
        time,
        repeatType: shape.repeatType,
        label: label.trim() || null,
        daysOfWeek: shape.daysOfWeek,
        intervalDays: shape.intervalDays,
        intervalMonths: shape.intervalMonths,
        // The day the calendar above is showing as chosen, which starts at
        // today for a new schedule and at the stored date for an edited one.
        startDate: shape.needsStartDate ? toISODate(startDate) : null,
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
          intervalMonths: fields.intervalMonths ?? undefined,
          startDate: fields.startDate ?? undefined,
        });
      }

      // This is when it rings, so the armed alarm is wrong until this runs.
      await resyncAlarmsQuietly();
      leave();
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
            title={existingId ? 'Edit schedule' : 'When it rings'}
            subtitle={
              showStepCounter(params.step)
                ? stepLabel(params.step as { index: number; total: number })
                : undefined
            }
            backLabel="Cancel"
            onBack={
              // Backing out of a run leaves the run, it does not walk back
              // through it. The Knowt is already saved and simply has no
              // schedule, which is a state the app shows and filters for.
              params.step
                ? () => navigation.navigate('Tabs', { screen: 'AllKnowts' })
                : () => navigation.goBack()
            }
          />

          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Time</Text>
          <TimePicker value={time} onChange={setTime} />

          <Text style={styles.label}>How often</Text>
          <View style={styles.chips}>
            {REPEAT_PRESETS.map((option) => {
              const on = preset === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    setPreset(option.id);
                    // Weekly takes one day, so a set carried over from
                    // Certain days would silently make it several.
                    if (option.needsDay && days.length > 1) setDays([days[0]!]);
                  }}
                  style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* An interval has to count from somewhere and a one-off has to land
              on a day, and this screen used to write today into the column and
              say so in a line of hint text. The calendar asks instead, which
              is the rule everywhere else: never invent a default the person
              should choose. It shows for every preset whose shape needs a
              date, so a new schedule and an edited one both get one. */}
          {shapeFor(preset).needsStartDate ? (
            <>
              <Text style={styles.label}>
                {shapeFor(preset).repeatType === 'once' ? 'Which day' : 'Starting'}
              </Text>
              <MonthCalendar
                month={visibleMonth}
                selected={startDate}
                today={midnight(new Date())}
                occursOn={() => false}
                onPick={(day) => {
                  setStartDate(day);
                  setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
                }}
                onShiftMonth={(delta) =>
                  setVisibleMonth(
                    (m) => new Date(m.getFullYear(), m.getMonth() + delta, 1),
                  )
                }
              />
            </>
          ) : null}

          {chosen.needsDay || chosen.needsDays ? (
            <>
              <Text style={styles.label}>
                {chosen.needsDay ? 'Which day' : 'Which days'}
              </Text>
              <View style={styles.dayRow}>
                {DAYS.map((day) => {
                  const on = days.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      accessibilityRole="button"
                      accessibilityLabel={day.label}
                      accessibilityState={{ selected: on }}
                      onPress={() =>
                        chosen.needsDay ? setDays([day.value]) : toggleDay(day.value)
                      }
                      style={[styles.day, on && styles.dayOn]}>
                      <Text style={[styles.dayText, on && styles.dayTextOn]}>
                        {day.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {days.length === 0 ? (
                <Text style={styles.errorHint}>
                  {chosen.needsDay ? 'Pick a day.' : 'Pick at least one day.'}
                </Text>
              ) : null}
            </>
          ) : null}

          {chosen.needsCount ? (
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
            variant="highlight"
            disabled={!canSave || saving}
            onPress={() => void save()}
          />
          {params.step ? (
            <Button
              label="Skip for now"
              variant="quiet"
              onPress={leave}
            />
          ) : null}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.color.surface,
  },
  // Border with the fill, for the same reason as the filter pill: it holds the
  // chip's size rather than drawing an outline.
  chipOn: {
    backgroundColor: theme.color.fillStrong,
    borderColor: theme.color.fillStrong,
  },
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
  dayOn: {
    backgroundColor: theme.color.fillStrong,
    borderColor: theme.color.fillStrong,
  },
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
