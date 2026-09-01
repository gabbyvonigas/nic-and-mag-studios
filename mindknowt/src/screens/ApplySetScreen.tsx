import { useEffect, useMemo, useState } from 'react';
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

import { Button, Pill, ScreenHeader } from '../components/ui';
import { describeRepeat, parseTimeInput, type RepeatType } from '../db';
import { resyncAlarmsQuietly } from '../alarms';
import { applySet, previewSet, type SetPreview, type SetSelection } from '../sets';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ApplySet'>;

/** Offered when a set declares no schedule of its own for a knowt. */
const REPEAT_CHOICES: { value: RepeatType; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'once', label: 'Once' },
];

type ExtraSchedule = { time: string; repeat: RepeatType | null };

/** `describeRepeat` reads a schedule row; set content only has the repeat type. */
function describeShape(repeat: RepeatType): string {
  return describeRepeat({
    id: '',
    knowt_id: '',
    label: null,
    time: '00:00',
    repeat_type: repeat,
    days_of_week: null,
    interval_days: null,
    supply_days: null,
    lead_days: null,
    start_date: null,
    enabled: 1,
    alarmkit_id: null,
  });
}

export function ApplySetScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();

  const [preview, setPreview] = useState<SetPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [times, setTimes] = useState<Record<string, string[]>>({});
  const [extras, setExtras] = useState<Record<string, ExtraSchedule>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const result = await previewSet(params.setId);
      if (!active) return;
      setPreview(result);
      setLoading(false);
      if (result) {
        // Duplicates start unchecked so nothing is created twice by accident.
        setSelected(
          Object.fromEntries(
            result.entries.map((e) => [e.knowt.name, e.duplicateOf === null]),
          ),
        );
        setTimes(
          Object.fromEntries(
            result.entries.map((e) => [e.knowt.name, e.knowt.schedules.map(() => '')]),
          ),
        );
        setExtras(
          Object.fromEntries(
            result.entries.map((e) => [e.knowt.name, { time: '', repeat: null }]),
          ),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [params.setId]);

  const ready = useMemo(() => {
    if (!preview) return false;
    const chosen = preview.entries.filter((e) => selected[e.knowt.name]);
    if (chosen.length === 0) return false;
    return chosen.every((entry) => {
      // A schedule the set declares needs a time, because none is assumed.
      const declared = entry.knowt.schedules.every(
        (_, index) => parseTimeInput(times[entry.knowt.name]?.[index] ?? '') !== null,
      );

      // A schedule added here is optional, but half of one is not usable.
      const extra = extras[entry.knowt.name];
      const added =
        !extra?.time.trim() ||
        (parseTimeInput(extra.time) !== null && extra.repeat !== null);

      return declared && added;
    });
  }, [preview, selected, times, extras]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.color.textSecondary} />
      </SafeAreaView>
    );
  }

  if (!preview) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.body}>That set no longer exists.</Text>
          <Button label="Back" variant="quiet" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const apply = async () => {
    setSaving(true);
    try {
      const selections: SetSelection[] = preview.entries
        .filter((e) => selected[e.knowt.name])
        .map((e) => {
          const extra = extras[e.knowt.name];
          const extraTime = extra?.time ? parseTimeInput(extra.time) : null;
          return {
            name: e.knowt.name,
            // Stored as 24 hour regardless of how it was typed.
            times: (times[e.knowt.name] ?? []).map((t) => parseTimeInput(t) ?? ''),
            extraSchedule:
              extraTime && extra?.repeat
                ? { time: extraTime, repeat: extra.repeat }
                : null,
          };
        });
      await applySet(params.setId, selections);
      // A set can add a dozen schedules at once, none of them armed yet.
      await resyncAlarmsQuietly();
      navigation.navigate('Tabs', { screen: 'AllKnowts' });
    } finally {
      setSaving(false);
    }
  };

  const chosenCount = preview.entries.filter((e) => selected[e.knowt.name]).length;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <ScreenHeader title={preview.set.name} subtitle={preview.set.description} />

          <Text style={styles.hint}>
            Pick what you want. Adding a time is optional, and nothing is
            scheduled until you set one.
          </Text>

          {preview.entries.map((entry) => {
            const isSelected = !!selected[entry.knowt.name];
            return (
              <View key={entry.knowt.name} style={styles.entry}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  onPress={() =>
                    setSelected((prev) => ({
                      ...prev,
                      [entry.knowt.name]: !prev[entry.knowt.name],
                    }))
                  }
                  style={styles.entryHeader}>
                  <View style={[styles.box, isSelected && styles.boxChecked]}>
                    {isSelected ? <Text style={styles.tick}>✓</Text> : null}
                  </View>
                  <View style={styles.entryMain}>
                    <Text style={styles.entryName}>{entry.knowt.name}</Text>
                    {entry.knowt.notes ? (
                      <Text style={styles.entryNotes} numberOfLines={2}>
                        {entry.knowt.notes}
                      </Text>
                    ) : null}
                    {entry.duplicateOf ? (
                      <Pill label="Already exists" />
                    ) : null}
                  </View>
                </Pressable>

                {isSelected && entry.knowt.schedules.length === 0 ? (
                  <View style={styles.scheduleRow}>
                    <Text style={styles.scheduleLabel}>
                      Schedule, optional
                    </Text>
                    <TextInput
                      style={[
                        styles.timeInput,
                        extras[entry.knowt.name]?.time.trim() !== '' &&
                          parseTimeInput(extras[entry.knowt.name]?.time ?? '') === null &&
                          styles.timeInputInvalid,
                      ]}
                      value={extras[entry.knowt.name]?.time ?? ''}
                      onChangeText={(text) =>
                        setExtras((prev) => ({
                          ...prev,
                          [entry.knowt.name]: {
                            time: text,
                            repeat: prev[entry.knowt.name]?.repeat ?? null,
                          },
                        }))
                      }
                      placeholder="8:00 am"
                      placeholderTextColor={theme.color.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {extras[entry.knowt.name]?.time.trim() ? (
                      <View style={styles.repeatRow}>
                        {REPEAT_CHOICES.map((choice) => {
                          const active =
                            extras[entry.knowt.name]?.repeat === choice.value;
                          return (
                            <Pressable
                              key={choice.value}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              onPress={() =>
                                setExtras((prev) => ({
                                  ...prev,
                                  [entry.knowt.name]: {
                                    time: prev[entry.knowt.name]?.time ?? '',
                                    repeat: choice.value,
                                  },
                                }))
                              }
                              style={[styles.repeatChip, active && styles.repeatChipOn]}>
                              <Text
                                style={[
                                  styles.repeatText,
                                  active && styles.repeatTextOn,
                                ]}>
                                {choice.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {isSelected &&
                  entry.knowt.schedules.map((schedule, index) => {
                    const value = times[entry.knowt.name]?.[index] ?? '';
                    const invalid =
                      value.trim() !== '' && parseTimeInput(value) === null;
                    return (
                      <View key={index} style={styles.scheduleRow}>
                        <Text style={styles.scheduleLabel}>
                          {schedule.label ?? describeShape(schedule.repeat)}
                          {schedule.label ? ` · ${describeShape(schedule.repeat)}` : ''}
                        </Text>
                        <TextInput
                          style={[styles.timeInput, invalid && styles.timeInputInvalid]}
                          value={value}
                          onChangeText={(text) =>
                            setTimes((prev) => {
                              const next = [...(prev[entry.knowt.name] ?? [])];
                              next[index] = text;
                              return { ...prev, [entry.knowt.name]: next };
                            })
                          }
                          placeholder="8:00 am"
                          placeholderTextColor={theme.color.textMuted}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      </View>
                    );
                  })}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={
              chosenCount === 0
                ? 'Choose at least one'
                : `Add ${chosenCount} knowt${chosenCount === 1 ? '' : 's'}`
            }
            disabled={!ready || saving}
            onPress={() => void apply()}
          />
          <Button label="Cancel" variant="quiet" onPress={() => navigation.goBack()} />
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
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  body: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textBody,
  },
  hint: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textMuted,
  },
  entry: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.surfaceMuted,
  },
  entryHeader: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
  box: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  boxChecked: {
    backgroundColor: theme.color.accent,
    borderColor: theme.color.accent,
  },
  tick: { color: theme.color.onAccent, fontSize: 14 },
  entryMain: { flex: 1, gap: 4 },
  entryName: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  entryNotes: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  scheduleRow: { paddingLeft: 34, gap: 4 },
  scheduleLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  timeInput: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  timeInputInvalid: { borderColor: theme.color.dangerBorder },
  repeatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  repeatChip: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  repeatChipOn: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.surfaceMuted,
  },
  repeatText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  repeatTextOn: { color: theme.color.textPrimary },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
});
