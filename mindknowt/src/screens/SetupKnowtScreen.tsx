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
import { TimePicker } from '../components/TimePicker';
import { Button, SubScreenHeader } from '../components/ui';
import {
  createKnowt,
  describeRepeat,
  purgeKnowt,
  findKnowtByTagUid,
  reassignTag,
  listCategories,
  toISODate,
} from '../db';
import { useQuery } from '../db/useQuery';
import { MonthCalendar } from '../components/MonthCalendar';
import { StopChoiceRow } from '../components/StopChoiceRow';
import {
  clockLabel,
  dayLabel,
  draftRow,
  nextOccurrences,
  occursOn,
} from '../knowts/occurrences';
import { REPEAT_PRESETS, shapeFor, type RepeatPresetId } from '../knowts/repeats';
import { stopChoice, type StopChoice } from '../knowts/modes';
import { askToReassign } from '../knowts/tagConflict';
import { nfcFailureMessage, nfcReader } from '../nfc';
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

  /**
   * The mode, which is also whether it has a schedule at all.
   *
   * One piece of state for both, because they are one question. Scan Knowt
   * means no schedule, so step 2 has nothing to ask and collapses to a line.
   * The time and repeat values are kept rather than cleared, so switching back
   * returns what was already picked instead of throwing it away.
   */
  const [stops, setStops] = useState<StopChoice>('alarm');
  const scheduled = stopChoice(stops).rings;
  const [time, setTime] = useState('08:00');
  const [preset, setPreset] = useState<RepeatPresetId>('daily');
  const [days, setDays] = useState<number[]>([]);
  const [everyN, setEveryN] = useState('3');
  /**
   * The day the schedule starts on, and the day a one-off happens on. The
   * column has always existed; nothing was ever writing anything but today.
   */
  const [startDate, setStartDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });


  const [tagUid, setTagUid] = useState<string | null>(null);
  /** Set when the chosen tag has to be taken off another knowt on save. */
  const [takeFrom, setTakeFrom] = useState<{ uid: string; owner: string } | null>(
    null,
  );
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const chosen = REPEAT_PRESETS.find((p) => p.id === preset) ?? REPEAT_PRESETS[0]!;

  const today = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  const draft = {
    preset,
    days,
    count: Number(everyN) || 1,
    startDate,
  };

  /**
   * "Starts Mon, Oct 12 at 6:00 am. Repeats weekly."
   *
   * Reads the first real occurrence rather than the chosen date. A weekends
   * schedule started on a Monday does not start on Monday, and saying it does
   * would be the one line on the screen that is wrong.
   */
  const summaryLine = (() => {
    const first = nextOccurrences(draft, 1)[0] ?? startDate;
    const when = `Starts ${dayLabel(first, today)} at ${clockLabel(time)}.`;
    if (preset === 'once') return `${when} Just once.`;
    return `${when} ${describeRepeat(draftRow(draft))}.`;
  })();
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
        // Interrupts here, at the scan. A banner at the top of this form is
        // invisible from the bottom of it, which is where this button lives.
        const move = await askToReassign(owner.name, name.trim() || 'this Knowt');
        if (!move) return;
        // Held, not written: the knowt does not exist yet. Save does the move,
        // so backing out now leaves the other knowt with its tag.
        setTakeFrom({ uid: tag.rawUid, owner: owner.name });
      }
      setTagUid(tag.rawUid);
      // A tag arriving promotes Alarm Only to Scan + Alarm, which is what
      // attaching one has always meant. It leaves Scan Knowt alone: that
      // choice is about having no alarm, and a tag does not change it.
      setStops((current) => (current === 'alarm' ? 'both' : current));
    } catch (err) {
      const failure = nfcFailureMessage(err);
      if (failure) setNotice(failure.text);
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
      const created = await createKnowt({
        name: name.trim(),
        categoryId,
        notes: params.notes ?? null,
        // Strict only when there is a tag on the row to require. A tag still
        // held by another Knowt is moved below, so it is not attached yet and
        // `setMode` would refuse it.
        mode: tagUid && !takeFrom ? stopChoice(stops).mode : 'open',
        // The flag, not "it happens to have no schedule". A preset Knowt also
        // has none and is not this.
        scanOnly: stops === 'scan',
        // A tag still held by another knowt cannot be written here: tag_uid is
        // unique. The row is created without it and the move runs below.
        tagUid: takeFrom ? null : tagUid,
        schedule: scheduled
          ? {
              time,
              repeatType: shape.repeatType,
              // shapeFor returns nulls for the fields a shape does not use;
              // createKnowt takes undefined for the same idea.
              daysOfWeek: shape.daysOfWeek ?? undefined,
              intervalDays: shape.intervalDays ?? undefined,
              intervalMonths: shape.intervalMonths ?? undefined,
              // Always written now, not only for the shapes that count from
              // it. The calendar asked for it, so storing today instead would
              // quietly throw the answer away.
              startDate: toISODate(startDate),
            }
          : undefined,
      });

      if (takeFrom) await reassignTag(takeFrom.uid, created);

      // A draft only existed to hold this work until it was finished.
      if (params.draftId) await purgeKnowt(params.draftId);

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

            {scheduled ? (
              <>
                {/* The calendar leads the step: the date is the thing with
                    the most consequence here, and it was the one thing the
                    step never asked for. The time and the frequency sit
                    directly under it, both still in reach without a scroll. */}
                <MonthCalendar
                  month={visibleMonth}
                  selected={startDate}
                  today={today}
                  occursOn={(day) => occursOn(draftRow(draft), day, startDate)}
                  onPick={(day) => {
                    setStartDate(day);
                    setVisibleMonth(new Date(day.getFullYear(), day.getMonth(), 1));
                  }}
                  onShiftMonth={(delta) =>
                    setVisibleMonth((m) =>
                      new Date(m.getFullYear(), m.getMonth() + delta, 1),
                    )
                  }
                />

                <TimePicker value={time} onChange={setTime} />
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

                {/* Says the date, the time and the rhythm, because all three
                    are now choices rather than assumptions. */}
                <Text style={styles.stepNote}>
                  {summaryLine}
                </Text>
              </>
            ) : (
              // Step 3 is what emptied this one, so it says where the control
              // is rather than leaving a step that looks broken.
              <Text style={styles.stepNote}>
                Scan Knowt has no alarm, so there is no time to pick. It will
                sit on Daily every day under Anytime today until you scan its
                tag. Choose Alarm Only or Scan + Alarm below to give it a time.
              </Text>
            )}
          </Step>

          <Step
            index={3}
            title="Mode"
            note="This is the part that makes MindKnowt work. Put a tag where the
                  thing actually lives, and the alarm only stops when you are there.">
            <StopChoiceRow
              value={stops}
              tagged={!!tagUid}
              onChange={(next) => {
                Keyboard.dismiss();
                setStops(next);
              }}
            />

            {tagUid ? (
              <View style={styles.tagged}>
                <Text style={styles.taggedText}>
                  {takeFrom ? `Tag moving from ${takeFrom.owner}.` : 'Tag attached.'}
                </Text>
                <Text style={styles.taggedUid} selectable>
                  {tagUid}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setTagUid(null);
                    setTakeFrom(null);
                    // Scan + Alarm cannot survive losing its tag: an alarm that
                    // only a tag stops, with no tag, is one nothing stops.
                    // Scan Knowt can, because it carries a manual Mark done.
                    if (stops === 'both') setStops('alarm');
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
                  No tag yet? Alarm Only and Scan Knowt both work now, and you
                  can attach one from this Knowt whenever the tags arrive. Only
                  Scan + Alarm needs one up front.
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
    ...theme.font.tabular,
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
