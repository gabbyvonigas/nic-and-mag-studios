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

import { SummaryPanel } from '../components/SummaryPanel';
import { EmptyState, HeaderRule } from '../components/ui';
import {
  loadMonthLog,
  loadMonthSummary,
  undoCompletion,
  type LogCategoryGroup,
  type LoggedCompletion,
} from '../db';
import { useQuery } from '../db/useQuery';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';
import type { RootStackParamList } from '../navigation/types';
import { categoryShades, METHOD_COLORS, theme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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

function CompletionRow({
  completion,
  onUndo,
}: {
  completion: LoggedCompletion;
  onUndo: () => void;
}) {
  const tint = methodColor(completion.method);

  const detail: string[] = [];
  if (completion.minutesToComplete !== null) {
    detail.push(
      completion.minutesToComplete < 1
        ? 'answered at once'
        : `after ${completion.minutesToComplete} min`,
    );
  }
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
      onLongPress={onUndo}
      onPress={onUndo}
      style={({ pressed }) => [styles.entry, pressed && styles.pressed]}>
      <View style={styles.entryHead}>
        <Text numberOfLines={1} style={styles.entryName}>
          {completion.knowtName}
        </Text>
        <Text style={styles.entryWhen}>
          {dayLabel(completion.completedAt)}, {clock(completion.completedAt)}
        </Text>
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

function CategoryBlock({
  group,
  expanded,
  onToggle,
  onUndo,
}: {
  group: LogCategoryGroup;
  expanded: boolean;
  onToggle: () => void;
  onUndo: (completion: LoggedCompletion) => void;
}) {
  const shades = categoryShades(group.category);
  const name = group.category?.name ?? 'No category';
  const count = group.completions.length;

  return (
    <View style={styles.block}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${count} done`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.blockRow, pressed && styles.pressed]}>
        <View style={[styles.blockDot, { backgroundColor: shades.color }]} />
        <Text numberOfLines={1} style={[styles.blockName, { color: shades.ink }]}>
          {name}
        </Text>
        <Text style={styles.blockCount}>{count}</Text>
        <Text style={[styles.chevron, expanded && styles.chevronOpen]}>
          {'›'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.entries}>
          {group.completions.map((completion) => (
            <CompletionRow
              key={completion.eventId}
              completion={completion}
              onUndo={() => onUndo(completion)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function LogScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data: log, loading, reload } = useQuery(
    () => loadMonthLog(year, month),
    [year, month],
  );
  const { data: summary, reload: reloadSummary } = useQuery(
    () => loadMonthSummary(year, month),
    [year, month],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadSummary();
    }, [reload, reloadSummary]),
  );

  const step = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  // Nothing has happened in the future, so there is nowhere forward to go.
  const atCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  const confirmUndo = (completion: LoggedCompletion) => {
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
              await reload();
              await reloadSummary();
            })(),
        },
      ],
    );
  };

  const groups = log?.groups ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <HeaderRule />
        <Text style={styles.title}>Log</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            hitSlop={12}
            onPress={() => step(-1)}>
            <Text style={styles.stepArrow}>{'‹'}</Text>
          </Pressable>
          <Text style={styles.stepLabel}>
            {MONTHS[month]} {year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: atCurrentMonth }}
            disabled={atCurrentMonth}
            hitSlop={12}
            onPress={() => step(1)}>
            <Text
              style={[styles.stepArrow, atCurrentMonth && styles.stepArrowOff]}>
              {'›'}
            </Text>
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
          {groups.length === 0 ? (
            <EmptyState
              message={
                atCurrentMonth
                  ? 'Nothing finished this month yet. Anything you check off lands here.'
                  : 'Nothing was finished that month.'
              }
              actionLabel={atCurrentMonth ? 'Go to today' : undefined}
              onAction={
                atCurrentMonth
                  ? () => navigation.navigate('Tabs', { screen: 'Daily' })
                  : undefined
              }
            />
          ) : (
            groups.map((group) => {
              const key = group.category?.id ?? 'none';
              return (
                <CategoryBlock
                  key={key}
                  group={group}
                  expanded={!!expanded[key]}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                  }
                  onUndo={confirmUndo}
                />
              );
            })
          )}

          <Text style={styles.sectionTitle}>Summary</Text>
          {summary ? <SummaryPanel summary={summary} /> : null}
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
  blockDot: { width: 10, height: 10, borderRadius: 5 },
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
  entryNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textBody,
    fontStyle: 'italic',
  },
});
