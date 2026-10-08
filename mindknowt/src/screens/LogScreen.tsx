import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { resyncAlarmsQuietly } from '../alarms';
import { CategoryDot } from '../components/KnowtCard';
import { PeriodPanel, PeriodToggle } from '../components/PeriodPanel';
import { SummaryPanel } from '../components/SummaryPanel';
import { EmptyState, TabHeader } from '../components/ui';
import { undoCompletion } from '../db';
import { listKnowts, loadInsight, loadPeriodPair, loadRangeSummary } from '../db';
import type { CompletedItem } from '../history/range';
import {
  deltaBetween,
  rangeFor,
  shiftRange,
  type PeriodKind,
} from '../history/period';
import { Icon } from '../components/Icon';
import { useQuery } from '../db/useQuery';
import { countWithoutSchedule, countWithoutTag } from '../knowts/knowtFilter';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';
import type { RootStackParamList } from '../navigation/types';
import { categoryShades, METHOD_COLORS, theme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function clock(at: number): string {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const suffix = hours < 12 ? 'am' : 'pm';
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix}`;
}

function dayLabel(at: number): string {
  const date = new Date(at);
  return `${MONTHS[date.getMonth()]?.slice(0, 3)} ${date.getDate()}`;
}

const METHOD_WORDS: Record<string, string> = {
  scan: 'scanned',
  tap: 'tapped',
  override: 'overridden',
  missed: 'missed',
};

function methodColor(method: string): string {
  if (method === 'scan') return METHOD_COLORS.scan;
  if (method === 'override') return METHOD_COLORS.override;
  return METHOD_COLORS.tap;
}

/** The heading over one day's completions, on Week and Month. */
function dayHeading(date: Date): string {
  const today = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(date, today)) return 'Today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (same(date, yesterday)) return 'Yesterday';
  return `${DAY_NAMES[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function CompletionRow({
  item,
  onUndo,
}: {
  item: CompletedItem;
  onUndo: (item: CompletedItem) => void;
}) {
  const completion = item;
  const tint = methodColor(completion.method);
  const shades = categoryShades(completion.category);

  const detail: string[] = [];
  if (completion.snoozeCount > 0) {
    detail.push(
      `${completion.snoozeCount} snooze${completion.snoozeCount === 1 ? '' : 's'}`,
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${completion.knowtName}, ${METHOD_WORDS[completion.method]}, ${dayLabel(completion.completedAt)}`}
      accessibilityHint="Opens the option to mark this as not done"
      onLongPress={() => onUndo(item)}
      onPress={() => onUndo(item)}
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
      <View style={styles.entryHead}>
        <CategoryDot shades={shades} size={8} />
        <Text numberOfLines={1} style={styles.entryName}>
          {completion.knowtName}
        </Text>
        <Text style={styles.entryWhen}>{clock(completion.completedAt)}</Text>
      </View>

      <View style={styles.entryMeta}>
        <View style={[styles.methodPip, { backgroundColor: tint }]} />
        <Text style={[styles.methodWord, { color: tint }]}>
          {METHOD_WORDS[completion.method] ?? completion.method}
        </Text>
        {detail.length > 0 ? (
          <Text style={styles.entryDetail}>{detail.join(', ')}</Text>
        ) : null}
      </View>

      {/* Written on the Ringing screen, and until now never read back. */}
      {completion.note ? (
        <Text style={styles.entryNote}>{completion.note}</Text>
      ) : null}
    </Pressable>
  );
}


export function LogScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});


  // Not month scoped: a tag is attached now or it is not, whatever month is
  // being read.
  // Not period scoped: a knowt is missing a tag or a schedule now, whatever
  // span is being read.
  const { data: allKnowts, reload: reloadTagged } = useQuery(
    () => listKnowts(),
    [],
  );

  /** Month is the default, because that is the span the Log grew up around. */
  const [periodKind, setPeriodKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const range = rangeFor(periodKind, anchor);
  const rangeKey = `${periodKind}:${range.from.getTime()}`;

  const { data: period, reload: reloadPeriod } = useQuery(
    () => loadPeriodPair(range),
    [rangeKey],
  );
  // Every card on this screen reads this one summary, so Day, Week and Month
  // show the same screen with the numbers computed for the span on the toggle.
  const { data: summary, loading, reload: reloadSummary } = useQuery(
    () => loadRangeSummary(range),
    [rangeKey],
  );
  const { data: insight, reload: reloadInsight } = useQuery(
    () => loadInsight(),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void reloadSummary();
      void reloadTagged();
      void reloadPeriod();
      void reloadInsight();
    }, [reloadSummary, reloadTagged, reloadPeriod, reloadInsight]),
  );

  const step = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  // Nothing has happened in the future, so there is nowhere forward to go.
  // The next arrow stops at the period containing today, whatever its span.
  const atLatest = range.to.getTime() > Date.now();

  const atCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  const confirmUndo = (completion: CompletedItem) => {
    Alert.alert(
      `Mark ${completion.knowtName} as not done?`,
      'It goes back to Daily and this entry is removed from the log.',
      [
        { text: 'Leave it', style: 'cancel' },
        {
          text: 'Not done',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              await undoCompletion(completion.eventId);
              // Sync skips occurrences that have been completed, so taking a
              // completion back puts one back in play and it has to be armed
              // again. Without this, "not done" quietly meant "and it will not
              // remind you either".
              await resyncAlarmsQuietly();
              await reloadSummary();
              await reloadPeriod();
            })(),
        },
      ],
    );
  };

  const days = summary?.days ?? [];

  /** How the empty state names the span it found nothing in. */
  const periodNoun = atLatest
    ? periodKind === 'day'
      ? 'today'
      : periodKind === 'week'
        ? 'this week'
        : 'this month'
    : periodKind === 'day'
      ? 'that day'
      : periodKind === 'week'
        ? 'that week'
        : 'that month';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TabHeader title="Log" onSettings={() => navigation.navigate('Settings')} />

      <View style={styles.header}>

        <PeriodToggle
          value={periodKind}
          onChange={(kind) => {
            setPeriodKind(kind);
            // Stepping back through months then switching to Day should not
            // land on some arbitrary day in the past.
            setAnchor(new Date());
          }}
        />

        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous"
            hitSlop={12}
            onPress={() => setAnchor(shiftRange(range, -1))}>
            <Icon name="back" size={16} color={theme.color.textSecondary} />
          </Pressable>
          <Text style={styles.stepLabel}>{range.label}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next"
            accessibilityState={{ disabled: atLatest }}
            disabled={atLatest}
            hitSlop={12}
            onPress={() => setAnchor(shiftRange(range, 1))}>
            <Icon
              name="forward"
              size={16}
              color={
                atLatest ? theme.color.border : theme.color.textSecondary
              }
            />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.textSecondary} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}>
          {period ? (
            <PeriodPanel
              summary={period.current}
              previous={deltaBetween(period.current, period.previous)}
              insight={insight ?? null}
              onAdjustTime={(knowtId) =>
                navigation.navigate('EditSchedule', { knowtId })
              }
              onOpenCategory={(categoryId) =>
                navigation.navigate('Tabs', {
                  screen: 'AllKnowts',
                  params: { categoryId },
                })
              }
            />
          ) : null}

          {days.length === 0 ? (
            <EmptyState
              message={
                atLatest
                  ? `Nothing finished ${periodNoun} yet. Anything you check off lands here.`
                  : `Nothing was finished ${periodNoun}.`
              }
              actionLabel={atLatest ? 'Go to today' : undefined}
              onAction={
                atLatest
                  ? () => navigation.navigate('Tabs', { screen: 'Daily' })
                  : undefined
              }
            />
          ) : (
            <>
              <Text style={styles.sectionTitle}>Completed</Text>
              {days.map((day) => (
                <View key={day.iso} style={styles.day}>
                  {/* A single day needs no heading over its own list; it is
                      already the thing on the toggle. */}
                  {periodKind === 'day' ? null : (
                    <Text style={styles.dayHead}>{dayHeading(day.date)}</Text>
                  )}
                  {day.items.map((item) => (
                    <CompletionRow
                      key={item.eventId}
                      item={item}
                      onUndo={confirmUndo}
                    />
                  ))}
                </View>
              ))}
            </>
          )}

          {/* Every view, not just Month. These cards were behind a
              `periodKind === 'month'` check, which is why Day and Week showed
              a smaller screen. The numbers come from the same range summary the
              rest of this screen reads, so they move with the toggle and with
              the stepper. */}
          {summary ? (
            <>
              <Text style={styles.sectionTitle}>Summary</Text>
              <SummaryPanel
                summary={summary}
                gaps={{
                  withoutTag: countWithoutTag(allKnowts ?? []),
                  withoutSchedule: countWithoutSchedule(allKnowts ?? []),
                  onOpenUntagged: () =>
                    navigation.navigate('Tabs', {
                      screen: 'AllKnowts',
                      params: { focus: 'no-tag' },
                    }),
                  onOpenUnscheduled: () =>
                    navigation.navigate('Tabs', {
                      screen: 'AllKnowts',
                      params: { focus: 'no-schedule' },
                    }),
                }}
              />
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    fontFamily: theme.font.face.bold,
    fontSize: theme.font.size.display,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  stepArrow: {
    width: 24,
    textAlign: 'center',
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
  },
  stepArrowOff: { color: theme.color.textMuted },
  stepLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  content: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm },
  pressed: { opacity: 0.7 },
  sectionTitle: {
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  block: { gap: theme.spacing.sm },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  blockName: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
  },
  blockCount: {
    fontFamily: theme.font.face.bold,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  chevron: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xl,
    color: theme.color.textMuted,
  },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  entries: { gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  entry: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: 4,
  },
  entryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  entryName: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  entryWhen: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    ...theme.font.tabular,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  methodPip: { width: 7, height: 7, borderRadius: 4 },
  methodWord: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
  },
  entryDetail: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  day: { gap: theme.spacing.xs, marginBottom: theme.spacing.md },
  dayHead: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    marginTop: theme.spacing.xs,
  },
  entryNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textBody,
    fontStyle: 'italic',
  },
});
