import { useCallback, useRef } from 'react';
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
import { KnowtCard } from '../components/KnowtCard';
import { EmptyState, HeaderRule } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  listDashboard,
  listWeeklyUpcoming,
  logCompletion,
  type DashboardCard,
  type UpcomingEntry,
} from '../db';
import { useQuery } from '../db/useQuery';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';
import { isClaimConfigured } from '../tags/claim';
import { shouldOfferTags } from '../tags/offer';
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

/** When something later this week happens, said the way a person would. */
function weekLabel(at: Date, now: Date): string {
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  const when = days === 1 ? 'Tomorrow' : (DAYS[at.getDay()] ?? '');
  return `${when}, ${clock(at)}`;
}

/**
 * The week ahead, under today.
 *
 * Deliberately smaller than the cards above it. Today is the screen; this is a
 * glance at what is coming, and if it competed visually it would blunt the part
 * that actually needs doing now.
 */
function UpcomingRow({
  entry,
  now,
  onPress,
}: {
  entry: UpcomingEntry;
  now: Date;
  onPress: () => void;
}) {
  const shades = categoryShades(entry.knowt.category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.knowt.name}, ${weekLabel(entry.at, now)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.upcomingRow, pressed && styles.pressed]}>
      <View style={[styles.upcomingDot, { backgroundColor: shades.color }]} />
      <Text numberOfLines={1} style={styles.upcomingName}>
        {entry.knowt.name}
      </Text>
      {entry.knowt.priority >= 2 ? (
        <View style={styles.upcomingFlag}>
          <Text style={styles.upcomingFlagText}>High</Text>
        </View>
      ) : null}
      <Text style={styles.upcomingWhen}>{weekLabel(entry.at, now)}</Text>
    </Pressable>
  );
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

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const now = new Date();

  const { data: board, loading, reload } = useQuery(() => listDashboard(), []);
  const { data: upcoming, reload: reloadUpcoming } = useQuery(
    () => listWeeklyUpcoming(),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadUpcoming();
    }, [reload, reloadUpcoming]),
  );

  // The free tags are offered once, on the first Daily screen someone sees.
  // The ref keeps it to one attempt per run: shouldOfferTags only turns false
  // once the offer has been answered, and coming back here in between should
  // not reopen it.
  const offered = useRef(false);
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (offered.current || !isClaimConfigured()) return;
        offered.current = true;
        if (await shouldOfferTags()) {
          navigation.navigate('ClaimTags', { prompt: true });
        }
      })();
    }, [navigation]),
  );

  const complete = async (card: DashboardCard) => {
    await logCompletion({
      knowtId: card.knowt.id,
      scheduleId: card.schedule?.id ?? null,
      method: 'tap',
    });
    await reload();
    await reloadUpcoming();
  };

  const openKnowt = (knowtId: string) =>
    navigation.navigate('KnowtDetail', { knowtId });

  // Completing is what sends a knowt to Log, so it leaves Daily. The query
  // still returns everything, which is what keeps the counter above honest
  // and gives Log the full picture.
  const remaining = (board?.today ?? []).filter((c) => c.completedAt === null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <HeaderRule />
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
          {remaining.length === 0 ? (
            <EmptyState
              message={
                board && board.total > 0
                  ? 'Everything due today is done. It is all in Log.'
                  : 'Nothing due today.'
              }
              actionLabel={board && board.total > 0 ? undefined : 'Add a knowt'}
              onAction={
                board && board.total > 0
                  ? undefined
                  : () => navigation.navigate('AddKnowt')
              }
            />
          ) : (
            remaining.map((card) => (
              <KnowtCard
                key={`${card.knowt.id}:${card.schedule?.id ?? 'untimed'}`}
                name={card.knowt.name}
                meta={metaOf(card)}
                status={statusOf(card)}
                location={card.knowt.location_note}
                mode={card.knowt.mode}
                priority={card.knowt.priority}
                shades={categoryShades(card.knowt.category)}
                onPress={() => openKnowt(card.knowt.id)}
                onComplete={() => void complete(card)}
              />
            ))
          )}

          {(upcoming ?? []).length > 0 ? (
            <View style={styles.upcoming}>
              <Text style={styles.sectionTitle}>This week</Text>
              {(upcoming ?? []).map((entry) => (
                <UpcomingRow
                  key={`${entry.knowt.id}:${entry.schedule.id}`}
                  entry={entry}
                  now={now}
                  onPress={() => openKnowt(entry.knowt.id)}
                />
              ))}
            </View>
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
    // Matches Knowts. The cards got shorter, so the breathing room between
    // them had to grow or the list would read as one block.
    gap: theme.spacing.md,
  },
  pressed: { opacity: 0.7 },
  // Sits in the lower third, above the tab bar, and stays quieter than today.
  upcoming: { marginTop: theme.spacing.xl, gap: theme.spacing.xs },
  sectionTitle: {
    marginBottom: theme.spacing.xs,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  upcomingDot: { width: 8, height: 8, borderRadius: 4 },
  upcomingName: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  upcomingFlag: {
    backgroundColor: theme.color.highlight,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  upcomingFlagText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xs,
    color: theme.color.onHighlight,
  },
  upcomingWhen: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
