import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GearIcon } from '../components/icons';
import { KnowtCard, PriorityBars } from '../components/KnowtCard';
import { SummaryPanel } from '../components/SummaryPanel';
import { EmptyState } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  listCategoryGroups,
  listDashboard,
  loadMonthSummary,
  logCompletion,
  type CategoryGroup,
  type DashboardCard,
} from '../db';
import { useQuery } from '../db/useQuery';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';
import type { RootStackParamList } from '../navigation/types';
import { categoryShades, theme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
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

function todayLabel(now: Date): string {
  return `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

function clock(at: number | Date): string {
  const date = at instanceof Date ? at : new Date(at);
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const suffix = hours < 12 ? 'am' : 'pm';
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix}`;
}

/** When the next thing in a category is, said the way a person would. */
function whenLabel(at: Date, now: Date): string {
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);

  if (days <= 0) return `Today, ${clock(at)}`;
  if (days === 1) return `Tomorrow, ${clock(at)}`;
  if (days < 7) return `${DAYS[at.getDay()]}, ${clock(at)}`;
  return `${MONTHS[at.getMonth()]} ${at.getDate()}`;
}

/** The live thing to say about a card, if there is one. */
function statusOf(card: DashboardCard): string | null {
  if (card.completedAt) return `Done at ${clock(card.completedAt)}`;
  if (!card.pending) return null;

  switch (card.pending.kind) {
    case 'snooze':
      return `Snoozed until ${clock(card.pending.fires_at)}`;
    case 'refire':
      return `Rings again at ${clock(card.pending.fires_at)}`;
    case 'test':
      return `Test alarm at ${clock(card.pending.fires_at)}`;
    default:
      // A scheduled alarm says nothing new: the card already shows its time.
      return null;
  }
}

function metaOf(card: DashboardCard): string {
  const { schedule } = card;
  if (!schedule) return 'Any time today';
  return `${formatTime(schedule.time)}${
    schedule.label ? `, ${schedule.label}` : ''
  }, ${describeRepeat(schedule)}`;
}

function CategorySection({
  group,
  expanded,
  onToggle,
  onOpenKnowt,
  now,
}: {
  group: CategoryGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenKnowt: (id: string) => void;
  now: Date;
}) {
  const shades = categoryShades(group.category);
  const name = group.category?.name ?? 'Everything else';
  const next = group.next;

  return (
    <View style={styles.category}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${group.knowts.length} knowts`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.categoryRow, pressed && styles.pressed]}>
        <View style={[styles.categoryDot, { backgroundColor: shades.color }]} />

        <View style={styles.categoryText}>
          <Text numberOfLines={1} style={[styles.categoryName, { color: shades.ink }]}>
            {name}
          </Text>
          <Text numberOfLines={1} style={styles.categoryNext}>
            {next
              ? `${next.knowt.name}, ${whenLabel(next.at, now)}`
              : `${group.knowts.length} knowt${group.knowts.length === 1 ? '' : 's'}, nothing scheduled`}
          </Text>
        </View>

        {next ? <PriorityBars priority={next.knowt.priority} color={shades.ink} /> : null}

        {/* Rotated rather than swapped, so the control never changes shape. */}
        <Text style={[styles.chevron, expanded && styles.chevronOpen]}>
          {'›'}
        </Text>
      </Pressable>

      {expanded ? (
        <View style={styles.categoryCards}>
          {group.knowts.map((knowt) => {
            const soonest = knowt.schedules.length > 0 ? describeRepeat(knowt.schedules[0]!) : '';
            return (
              <KnowtCard
                key={knowt.id}
                name={knowt.name}
                meta={
                  knowt.schedules.length > 0
                    ? `${formatTime(knowt.schedules[0]!.time)}, ${soonest}`
                    : 'No schedule'
                }
                location={knowt.location_note}
                mode={knowt.mode}
                priority={knowt.priority}
                shades={shades}
                onPress={() => onOpenKnowt(knowt.id)}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const now = new Date();

  const { data: board, loading, reload } = useQuery(() => listDashboard(), []);
  const { data: groups, reload: reloadGroups } = useQuery(
    () => listCategoryGroups(),
    [],
  );
  const { data: summary, reload: reloadSummary } = useQuery(
    () => loadMonthSummary(now.getFullYear(), now.getMonth()),
    [],
  );

  // Collapsed is the default, so this holds only the ones opened by hand.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadGroups();
      void reloadSummary();
    }, [reload, reloadGroups, reloadSummary]),
  );

  const complete = async (card: DashboardCard) => {
    await logCompletion({
      knowtId: card.knowt.id,
      scheduleId: card.schedule?.id ?? null,
      method: 'tap',
    });
    await reload();
    await reloadSummary();
  };

  const openKnowt = (knowtId: string) =>
    navigation.navigate('KnowtDetail', { knowtId });

  const today = board?.today ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Daily</Text>
            <Text style={styles.date}>{todayLabel(now)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={12}
            onPress={() => navigation.navigate('Settings')}
            style={({ pressed }) => [styles.gear, pressed && styles.pressed]}>
            <GearIcon />
          </Pressable>
        </View>
        {board && board.total > 0 ? (
          <Text style={styles.progress}>
            {board.done} of {board.total} done
          </Text>
        ) : null}
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
          {today.length === 0 ? (
            <EmptyState
              message="Nothing due today."
              actionLabel="Add a knowt"
              onAction={() => navigation.navigate('AddKnowt')}
            />
          ) : (
            today.map((card) => (
              <KnowtCard
                key={`${card.knowt.id}:${card.schedule?.id ?? 'untimed'}`}
                name={card.knowt.name}
                meta={metaOf(card)}
                status={statusOf(card)}
                location={card.knowt.location_note}
                mode={card.knowt.mode}
                priority={card.knowt.priority}
                shades={categoryShades(card.knowt.category)}
                done={card.completedAt !== null}
                onPress={() => openKnowt(card.knowt.id)}
                onComplete={() => void complete(card)}
              />
            ))
          )}

          {(groups ?? []).length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Categories</Text>
              {(groups ?? []).map((group) => {
                const key = group.category?.id ?? 'none';
                return (
                  <CategorySection
                    key={key}
                    group={group}
                    now={now}
                    expanded={!!expanded[key]}
                    onToggle={() =>
                      setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    onOpenKnowt={openKnowt}
                  />
                );
              })}
            </>
          ) : null}

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
    gap: 2,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: { flex: 1, gap: 2 },
  gear: {
    paddingTop: theme.spacing.md,
    paddingLeft: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  title: {
    fontFamily: theme.font.face.bold,
    fontSize: theme.font.size.display,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  date: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  progress: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  content: {
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
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
  category: { gap: theme.spacing.sm },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  categoryDot: { width: 10, height: 10, borderRadius: 5 },
  categoryText: { flex: 1, gap: 2 },
  categoryName: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
  },
  categoryNext: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  chevron: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xl,
    color: theme.color.textMuted,
  },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  categoryCards: { gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
});
