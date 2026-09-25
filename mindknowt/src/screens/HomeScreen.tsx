import { useCallback, useRef, useState } from 'react';
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
import { ProgressRing } from '../components/ProgressRing';
import { EmptyState, HeaderLockup } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  listDashboard,
  listWeekMarks,
  logCompletion,
  toISODate,
  type DashboardCard,
  type DayMark,
} from '../db';
import { useQuery } from '../db/useQuery';
import {
  progressCount,
  progressLine,
  stanceFor,
} from '../knowts/dayProgress';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';
import { isClaimConfigured } from '../tags/claim';
import { shouldOfferTags } from '../tags/offer';
import type { RootStackParamList } from '../navigation/types';
import { categoryShades, theme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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

function midnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whole days from today, negative for the past. */
function offsetFromToday(date: Date, now: Date): number {
  return Math.round(
    (midnight(date).getTime() - midnight(now).getTime()) / 86_400_000,
  );
}

function longDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function clock(at: number | Date): string {
  const date = at instanceof Date ? at : new Date(at);
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
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
  return `${formatTime(schedule.time)}, ${describeRepeat(schedule)}`;
}

/**
 * Seven days, the one being read highlighted, with a dot per category that has
 * something due. The dots are what make an empty looking day distinguishable
 * from one nobody has scrolled to yet.
 */
function DateStrip({
  marks,
  selectedIso,
  todayIso,
  onPick,
}: {
  marks: DayMark[];
  selectedIso: string;
  todayIso: string;
  onPick: (date: Date) => void;
}) {
  return (
    <View style={styles.strip}>
      {marks.map((mark) => {
        const selected = mark.iso === selectedIso;
        const isToday = mark.iso === todayIso;
        return (
          <Pressable
            key={mark.iso}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={longDate(mark.date)}
            onPress={() => onPick(mark.date)}
            style={styles.stripCell}>
            <Text style={styles.stripInitial}>
              {DAY_INITIALS[mark.date.getDay()]}
            </Text>
            <View style={[styles.stripDay, selected && styles.stripDayOn]}>
              <Text
                style={[
                  styles.stripNumber,
                  selected && styles.stripNumberOn,
                  !selected && isToday && styles.stripNumberToday,
                ]}>
                {mark.date.getDate()}
              </Text>
            </View>
            {/* Rendered even when empty so the row never changes height. */}
            <View style={styles.stripDots}>
              {mark.colors.map((color) => (
                <View
                  key={color}
                  style={[styles.stripDot, { backgroundColor: color }]}
                />
              ))}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const now = new Date();
  const todayIso = toISODate(now);

  // Which day is being read. Daily is one day at a time, and the strip is how
  // you reach the others, which is what replaced the week ahead list.
  const [selected, setSelected] = useState<Date>(() => midnight(new Date()));
  const selectedIso = toISODate(selected);
  const offset = offsetFromToday(selected, now);
  const stance = stanceFor(offset);

  const { data: board, loading, reload } = useQuery(
    () => listDashboard(selected),
    [selectedIso],
  );
  const { data: marks, reload: reloadMarks } = useQuery(
    () => listWeekMarks(selected),
    [selectedIso],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadMarks();
    }, [reload, reloadMarks]),
  );

  // The free tags are offered once, on the first Daily screen someone sees.
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
    await reloadMarks();
  };

  const openKnowt = (knowtId: string) =>
    navigation.navigate('KnowtDetail', { knowtId });

  const cards = board?.today ?? [];
  // Completing sends a knowt to Log, so it leaves the list. The counts above
  // still come from the full board, which is what keeps them honest.
  const remaining = cards.filter((card) => card.completedAt === null);
  const total = board?.total ?? 0;
  const done = board?.done ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <Text style={styles.title}>
              {stance === 'today' ? 'Today' : DAY_NAMES[selected.getDay()]}
            </Text>
            <Text style={styles.date}>{longDate(selected)}</Text>
            <HeaderLockup />
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
      </View>

      <DateStrip
        marks={marks ?? []}
        selectedIso={selectedIso}
        todayIso={todayIso}
        onPick={(date) => setSelected(midnight(date))}
      />

      {loading ? (
        <ActivityIndicator color={theme.color.textSecondary} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}>
          {/* On the page, not inside a colored card. */}
          <View style={styles.progress}>
            <ProgressRing value={total === 0 ? 0 : done / total} size={62}>
              <Text style={styles.ringText}>{total === 0 ? '0' : done}</Text>
            </ProgressRing>
            <View style={styles.progressText}>
              <Text style={styles.progressCount}>
                {progressCount(done, total)}
              </Text>
              <Text style={styles.progressLine}>
                {progressLine(done, total, stance)}
              </Text>
            </View>
          </View>

          {remaining.length === 0 ? (
            <EmptyState
              message={
                total > 0
                  ? 'Everything on this day is done. It is all in Log.'
                  : 'Nothing scheduled.'
              }
              actionLabel={total > 0 ? undefined : 'Add a knowt'}
              onAction={
                total > 0 ? undefined : () => navigation.navigate('AddKnowt')
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
                // Only today can be checked off. Completing while reading
                // Thursday would write the completion at the moment of the tap,
                // which is a different day and a lie in the log.
                onComplete={
                  stance === 'today' ? () => void complete(card) : undefined
                }
              />
            ))
          )}
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
    paddingBottom: theme.spacing.sm,
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
  pressed: { opacity: 0.7 },

  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  stripCell: { alignItems: 'center', gap: 4, flex: 1 },
  stripInitial: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  stripDay: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripDayOn: { backgroundColor: theme.color.highlight },
  stripNumber: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  stripNumberOn: { color: theme.color.onHighlight },
  // Today, when you are reading some other day, so it can be found again.
  stripNumberToday: { fontFamily: theme.font.face.medium },
  stripDots: { flexDirection: 'row', gap: 3, height: 5 },
  stripDot: { width: 5, height: 5, borderRadius: 2.5 },

  content: {
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  ringText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  progressText: { flex: 1, gap: 2 },
  progressCount: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  progressLine: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
