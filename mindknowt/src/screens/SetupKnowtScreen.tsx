import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Keyboard,
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
import { AlarmIcon, ScanIcon } from '../components/icons';
import { TimeWheel } from '../components/TimeWheel';
import { Button, SubScreenHeader } from '../components/ui';
import {
  createKnowt,
  deleteKnowt,
  findKnowtByTagUid,
  formatTime,
  listCategories,
  toISODate,
  type KnowtMode,
} from '../db';
import { useQuery } from '../db/useQuery';
import { REPEAT_PRESETS, shapeFor, type RepeatPresetId } from '../knowts/repeats';
import { NfcScanError, nfcReader } from '../nfc';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'SetupKnowt'>;

const DAYS = [
  { value: 1, label: 'Sun' },
  { value: 2, label: 'Mon' },
  { value: 3, label: 'Tue' },
  { value: 4, label: 'Wed' },
  { value: 5, label: 'Thu' },
  { value: 6, label: 'Fri' },
  { value: 7, label: 'Sat' },
];

/** A numbered section, so the order of the three questions is visible. */
function Step({
  index,
  title,
  note,
  children,
}: {
  index: number;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHead}>
        <View style={styles.stepNumber}>
          <Text style={styles.stepNumberText}>{index}</Text>
        </View>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      {note ? <Text style={styles.stepNote}>{note}</Text> : null}
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

/**
 * Setting up one knowt, whether it came from a preset or from a typed name.
 *
 * The three questions are asked in the order they matter: what it is, when it
 * happens, and how it stops. Attaching the tag lives in the third, because
 * scanning a tag at the place the task lives is the whole point of the app and
 * it used to be something you discovered afterwards on the finished knowt.
 */
export function SetupKnowtScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { data: categories } = useQuery(() => listCategories(), []);

  const [name, setName] = useState(params.name);
  const [categoryId, setCategoryId] = useState<string | null>(
    params.categoryId ?? null,
  );

  const [scheduled, setScheduled] = useState(true);
  const [time, setTime] = useState('08:00');
  const [preset, setPreset] = useState<RepeatPresetId>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [everyN, setEveryN] = useState('3');

  const [mode, setMode] = useState<KnowtMode>('open');
  const [tagUid, setTagUid] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chosen = REPEAT_PRESETS.find((p) => p.id === preset) ?? REPEAT_PRESETS[0]!;
  const scheduleReady =
    !scheduled ||
    ((!chosen.needsDay || days.length === 1) &&
      (!chosen.needsDays || days.length > 0) &&
      (!chosen.needsCount || Number(everyN) > 0));

  const ready = name.trim().length > 0 && scheduleReady;

  const toggleDay = (day: number) =>
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );

  /**
   * Scanned before the knowt exists, so the UID is held here and written with
   * the row. Checking it against the database straight away is the point: a tag
   * that already belongs to something else has to be reported while the person
   * is still holding it, not at save time.
   */
  const scan = async () => {
    setNotice(null);
    setScanning(true);
    try {
      const tag = await nfcReader.scanTag();
      const owner = await findKnowtByTagUid(tag.rawUid);
      if (owner) {
        setNotice(`That tag is already ${owner.name}. Try a different one.`);
        return;
      }
      setTagUid(tag.rawUid);
      setMode('strict');
    } catch (err) {
      if (err instanceof NfcScanError && err.reason === 'canceled') return;
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const shape = shapeFor(preset, {
        days,
        count: Number(everyN) || 1,
      });
      await createKnowt({
        name: name.trim(),
        categoryId,
        notes: params.notes ?? null,
        mode: tagUid ? mode : 'open',
        tagUid,
        schedule: scheduled
          ? {
              time,
              repeatType: shape.repeatType,
              // shapeFor returns nulls for the fields a shape does not use;
              // createKnowt takes undefined for the same idea.
              daysOfWeek: shape.daysOfWeek ?? undefined,
              intervalDays: shape.intervalDays ?? undefined,
              startDate: shape.needsStartDate
                ? toISODate(new Date())
                : undefined,
            }
          : undefined,
      });

      // A draft only existed to hold this work until it was finished.
      if (params.draftId) await deleteKnowt(params.draftId);

      await resyncAlarmsQuietly();
      navigation.navigate('Tabs', { screen: 'AllKnowts' });
    } catch (err) {
      setNotice(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}>
          <SubScreenHeader
            title="Set it up"
            onBack={() => navigation.goBack()}
            backLabel="Back"
          />

          {notice ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{notice}</Text>
            </View>
          ) : null}

          <Step index={1} title="What it is">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Vitamins"
              placeholderTextColor={theme.color.textMuted}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            <View style={styles.chips}>
              {(categories ?? []).map((category) => {
                const selected = categoryId === category.id;
                const shades = categoryShades(category);
                return (
                  <Pressable
                    key={category.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setCategoryId(selected ? null : category.id)}
                    style={[
                      styles.chip,
                      selected && {
                        backgroundColor: shades.fill,
                        borderColor: shades.color,
                      },
                    ]}>
                    <Text
                      style={[styles.chipText, selected && { color: shades.ink }]}>
                      {category.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Step>

          <Step
            index={2}
            title="When it happens"
            note="Pick a time and how often it comes back around.">
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: scheduled }}
              onPress={() => {
                Keyboard.dismiss();
                setScheduled((on) => !on);
              }}
              style={({ pressed }) => [
                styles.toggle,
                scheduled && styles.toggleOn,
                pressed && styles.pressed,
              ]}>
              <Text
                style={[styles.toggleText, scheduled && styles.toggleTextOn]}>
                {scheduled ? 'Scheduled' : 'No schedule'}
              </Text>
            </Pressable>

            {scheduled ? (
              <>
                <TimeWheel value={time} onChange={setTime} />
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
                          setDays([]);
                        }}
                        style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {chosen.needsDay || chosen.needsDays ? (
                  <View style={styles.chips}>
                    {DAYS.map((day) => {
                      const on = days.includes(day.value);
                      return (
                        <Pressable
                          key={day.value}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          onPress={() =>
                            chosen.needsDay
                              ? setDays([day.value])
                              : toggleDay(day.value)
                          }
                          style={[styles.chip, on && styles.chipOn]}>
                          <Text
                            style={[styles.chipText, on && styles.chipTextOn]}>
                            {day.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {chosen.needsCount ? (
                  <View style={styles.countRow}>
                    <Text style={styles.stepNote}>Every</Text>
                    <TextInput
                      style={[styles.input, styles.countInput]}
                      value={everyN}
                      onChangeText={setEveryN}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    <Text style={styles.stepNote}>days</Text>
                  </View>
                ) : null}

                <Text style={styles.stepNote}>
                  Starts {formatTime(time)}, from today.
                </Text>
              </>
            ) : (
              <Text style={styles.stepNote}>
                It will not ring on its own. You can add a time later.
              </Text>
            )}
          </Step>

          <Step
            index={3}
            title="How it stops"
            note="This is the part that makes MindKnowt work. Put a tag where the
                  thing actually lives, and the alarm only stops when you are there.">
            <View style={styles.modeRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'strict', disabled: !tagUid }}
                disabled={!tagUid}
                onPress={() => setMode('strict')}
                style={[
                  styles.modeCard,
                  mode === 'strict' && styles.modeCardOn,
                  !tagUid && styles.modeCardOff,
                ]}>
                <ScanIcon
                  size={20}
                  color={
                    !tagUid
                      ? theme.color.textMuted
                      : mode === 'strict'
                        ? theme.color.onHighlight
                        : theme.color.textPrimary
                  }
                />
                <Text
                  style={[
                    styles.modeLabel,
                    mode === 'strict' && styles.modeLabelOn,
                    !tagUid && styles.modeLabelOff,
                  ]}>
                  Scan Knowt
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode !== 'strict' }}
                onPress={() => setMode('open')}
                style={[styles.modeCard, mode !== 'strict' && styles.modeCardOn]}>
                <AlarmIcon
                  size={20}
                  color={
                    mode !== 'strict'
                      ? theme.color.onHighlight
                      : theme.color.textPrimary
                  }
                />
                <Text
                  style={[
                    styles.modeLabel,
                    mode !== 'strict' && styles.modeLabelOn,
                  ]}>
                  Alarm Only
                </Text>
              </Pressable>
            </View>

            {tagUid ? (
              <View style={styles.tagged}>
                <Text style={styles.taggedText}>Tag attached.</Text>
                <Text style={styles.taggedUid} selectable>
                  {tagUid}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setTagUid(null);
                    setMode('open');
                  }}>
                  <Text style={styles.link}>Remove it</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Button
                  label={scanning ? 'Hold it near the tag' : 'Scan a tag now'}
                  variant="highlight"
                  disabled={scanning}
                  onPress={() => void scan()}
                />
                <Text style={styles.stepNote}>
                  No tag yet? Alarm Only works now, and you can attach one from
                  this knowt whenever the tags arrive.
                </Text>
              </>
            )}
          </Step>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={saving ? 'Saving' : 'Done'}
            variant="highlight"
            disabled={!ready || saving}
            onPress={() => void save()}
          />
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
  },
  pressed: { opacity: 0.7 },
  step: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadow.card,
  },
  stepHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.highlight,
  },
  stepNumberText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.onHighlight,
  },
  stepTitle: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  stepNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 20,
    color: theme.color.textMuted,
  },
  stepBody: { gap: theme.spacing.sm },
  input: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.background,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  countInput: { width: 80, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    backgroundColor: theme.color.background,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipOn: {
    backgroundColor: theme.color.highlight,
    borderColor: theme.color.highlight,
  },
  chipText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  chipTextOn: { color: theme.color.onHighlight },
  toggle: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  toggleOn: {
    backgroundColor: theme.color.highlight,
    borderColor: theme.color.highlight,
  },
  toggleText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  toggleTextOn: { color: theme.color.onHighlight },
  modeRow: { flexDirection: 'row', gap: theme.spacing.sm },
  modeCard: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
  },
  modeCardOn: {
    backgroundColor: theme.color.highlight,
    borderColor: theme.color.highlight,
  },
  modeCardOff: { backgroundColor: theme.color.background },
  modeLabel: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  modeLabelOn: { color: theme.color.onHighlight },
  modeLabelOff: { color: theme.color.textMuted },
  tagged: { gap: theme.spacing.xs, alignItems: 'flex-start' },
  taggedText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  taggedUid: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  link: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  banner: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.dangerBorder,
    backgroundColor: theme.color.dangerSurface,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
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
