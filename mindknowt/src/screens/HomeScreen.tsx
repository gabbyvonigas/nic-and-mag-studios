import { useCallback, useEffect, useRef, useState } from 'react';
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

import { CategoryIcon } from '../components/CategoryIcon';
import { Icon } from '../components/Icon';
import { KnowtCard } from '../components/KnowtCard';
import { ProgressRing } from '../components/ProgressRing';
import { EmptyState, TabHeader } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  listDashboard,
  listSnoozed,
  listUpcoming,
  listWeekMarks,
  toISODate,
  type DashboardCard,
  type DayMark,
  type SnoozedEntry,
  type UpcomingEntry,
} from '../db';
import { useQuery } from '../db/useQuery';
import { completeOccurrence } from '../knowts/completeOccurrence';
import {
  progressCount,
  progressLine,
  showUpcoming,
  stanceFor,
} from '../knowts/dayProgress';
import { cardStatus } from '../knowts/cardStatus';
import { showSnoozed, snoozeCountdown } from '../knowts/snoozed';
import { midnight, offsetInDays, shiftWeeks } from '../knowts/weekStrip';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';
import { isShopConfigured } from '../shop/config';
import { shouldOfferTags } from '../shop/freeTags';
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

function longDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function clock(at: number | Date): string {
  const date = at instanceof Date ? at : new Date(at);
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

/** When something later is due, said the way a person would. */
function whenLabel(at: Date, now: Date): string {
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);

  if (days === 1) return `Tomorrow, ${clock(at)}`;
  if (days < 7) return `${DAY_NAMES[at.getDay()]}, ${clock(at)}`;
  return `${MONTHS[at.getMonth()]} ${at.getDate()}`;
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
  onShiftWeek,
}: {
  marks: DayMark[];
  selectedIso: string;
  todayIso: string;
  onPick: (date: Date) => void;
  onShiftWeek: (delta: number) => void;
}) {
  return (
    <View style={styles.stripRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous week"
        hitSlop={10}
        onPress={() => onShiftWeek(-1)}>
        <Icon name="back" size={16} color={theme.color.textSecondary} />
      </Pressable>

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
              {/* Today keeps a ring whatever is selected, so it can always be
                  found again; the filled day is the one being read. */}
              <View
                style={[
                  styles.stripDay,
                  isToday && !selected && styles.stripDayToday,
                  selected && styles.stripDayOn,
                ]}>
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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next week"
        hitSlop={10}
        onPress={() => onShiftWeek(1)}>
        <Icon name="forward" size={16} color={theme.color.textSecondary} />
      </Pressable>
    </View>
  );
}

/**
 * What is snoozed right now.
 *
 * Directly under the strip, because a snoozed knowt has left the list below
 * and this is the only thing on the screen that says where it went. It is
 * absent rather than empty when nothing is snoozed, and it is only on today:
 * the countdown is against the clock, not against the day being read.
 */
function SnoozedSection({
  entries,
  onOpen,
}: {
  entries: SnoozedEntry[];
  onOpen: (knowtId: string) => void;
}) {
  return (
    <View style={styles.snoozed}>
      <Text style={styles.snoozedTitle}>
        Snoozed{entries.length > 1 ? ` (${entries.length})` : ''}
      </Text>
      {entries.map((entry) => {
        const shades = categoryShades(entry.knowt.category);
        return (
          <Pressable
            key={entry.knowt.id}
            accessibilityRole="button"
            accessibilityLabel={`${entry.knowt.name}, ${snoozeCountdown(entry.minutesLeft)}`}
            onPress={() => onOpen(entry.knowt.id)}
            style={({ pressed }) => [
              styles.snoozedRow,
              pressed && styles.pressed,
            ]}>
            <CategoryIcon
              icon={entry.knowt.category?.icon}
              shades={shades}
              size={24}
            />
            <Text numberOfLines={1} style={styles.snoozedName}>
              {entry.knowt.name}
            </Text>
            <Text style={styles.snoozedWhen}>
              {snoozeCountdown(entry.minutesLeft)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * What is next, once today is finished.
 *
 * Only appears when there is nothing left to do, so the screen has something
 * to say other than being empty. Collapsible, because it is a glance forward
 * rather than the point of the page.
 */
function UpcomingSection({
  entries,
  expanded,
  onToggle,
  onOpen,
  now,
}: {
  entries: UpcomingEntry[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (knowtId: string) => void;
  now: Date;
}) {
  if (entries.length === 0) return null;

  return (
    <View style={styles.upcoming}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.upcomingHead, pressed && styles.pressed]}>
        <Text style={styles.upcomingTitle}>Upcoming</Text>
        <Icon name={expanded ? 'collapse' : 'expand'} size={14} color={theme.color.textSecondary} />
      </Pressable>

      {expanded
        ? entries.map((entry) => {
            const shades = categoryShades(entry.knowt.category);
            return (
              <Pressable
                key={`${entry.knowt.id}:${entry.schedule.id}`}
                accessibilityRole="button"
                onPress={() => onOpen(entry.knowt.id)}
                style={({ pressed }) => [
                  styles.upcomingRow,
                  pressed && styles.upcomingRowPressed,
                ]}>
                <CategoryIcon
                  icon={entry.knowt.category?.icon}
                  shades={shades}
                  size={24}
                />
                <Text numberOfLines={1} style={styles.upcomingName}>
                  {entry.knowt.name}
                </Text>
                <Text style={styles.upcomingWhen}>
                  {whenLabel(entry.at, now)}
                </Text>
              </Pressable>
            );
          })
        : null}
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
  const offset = offsetInDays(selected, now);
  const stance = stanceFor(offset);

  // A countdown that only moves when the screen is reopened is a countdown
  // that is wrong most of the time it is being looked at. Half a minute is
  // fine: the labels are in whole minutes, so anything finer would redraw the
  // same text.
  const [tick, setTick] = useState(0);

  // `tick` is in here on purpose. The board carries each card's pending alarm,
  // and a card has to stop saying "Snoozed until 1:25 pm" at 1:25 pm rather
  // than the next time someone opens the tab. Keyed on the day alone, it did
  // not move at all while the screen was open.
  const { data: board, loading, reload } = useQuery(
    () => listDashboard(selected),
    [selectedIso, tick],
  );
  const { data: marks, reload: reloadMarks } = useQuery(
    () => listWeekMarks(selected),
    [selectedIso],
  );
  const { data: upcoming, reload: reloadUpcoming } = useQuery(
    () => listUpcoming(),
    [],
  );

  const { data: snoozed, reload: reloadSnoozed } = useQuery(
    () => listSnoozed(),
    [tick],
  );
  const snoozedEntries = snoozed ?? [];
  const snoozedOn = showSnoozed({ count: snoozedEntries.length, stance });

  // Anything with a countdown on it keeps the timer running: the section under
  // the strip, and any card showing a snooze or a re-fire. Tying it to the
  // section alone meant a snoozed card went stale whenever the section was
  // hidden. Off on other days, where nothing counts down.
  const live =
    stance === 'today' &&
    (snoozedEntries.length > 0 ||
      (board?.today ?? []).some(
        (card) => card.pending && card.pending.fires_at > now.getTime(),
      ));

  useEffect(() => {
    // A timer running behind Knowts and Log would wake the database every half
    // minute for nobody.
    if (!live) return;
    const timer = setInterval(() => setTick((value) => value + 1), 30_000);
    return () => clearInterval(timer);
  }, [live]);
  const [upcomingOpen, setUpcomingOpen] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadMarks();
      void reloadUpcoming();
      void reloadSnoozed();
    }, [reload, reloadMarks, reloadUpcoming, reloadSnoozed]),
  );

  // The free tags are offered once, on the first Daily screen someone sees.
  const offered = useRef(false);
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (offered.current || !isShopConfigured()) return;
        offered.current = true;
        if (await shouldOfferTags()) {
          navigation.navigate('ClaimTags', { prompt: true });
        }
      })();
    }, [navigation]),
  );

  const complete = async (card: DashboardCard) => {
    // Naming the schedule is what stands the alarm down. Without it the 9:00 am
    // alarm went on ringing for a card checked off at seven.
    await completeOccurrence({
      knowtId: card.knowt.id,
      scheduleId: card.schedule?.id ?? null,
      method: 'tap',
    });
    await reload();
    await reloadMarks();
    await reloadUpcoming();
    await reloadSnoozed();
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
      <TabHeader
        title={stance === 'today' ? 'Today' : DAY_NAMES[selected.getDay()] ?? ''}
        onSettings={() => navigation.navigate('Settings')}>
        {stance === 'today' ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            onPress={() => setSelected(midnight(new Date()))}
            style={({ pressed }) => [styles.todayPill, pressed && styles.pressed]}>
            <Text style={styles.todayPillText}>Today</Text>
          </Pressable>
        )}
      </TabHeader>

      <Text style={styles.date}>{longDate(selected)}</Text>

      <DateStrip
        marks={marks ?? []}
        selectedIso={selectedIso}
        todayIso={todayIso}
        onPick={(date) => setSelected(midnight(date))}
        onShiftWeek={(delta) =>
          setSelected((current) => shiftWeeks(current, delta))
        }
      />

      {snoozedOn ? (
        <SnoozedSection entries={snoozedEntries} onOpen={openKnowt} />
      ) : null}

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
              {/* A finished day says so with a mark rather than a number.
                  Partial progress keeps the count, because there the number
                  is the thing worth knowing. */}
              {total > 0 && done >= total ? (
                <Icon name="check" size={24} color={theme.color.textPrimary} />
              ) : (
                <Text style={styles.ringText}>{total === 0 ? '0' : done}</Text>
              )}
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

          {/* A finished day says nothing. The ring already shows a check and
              Upcoming is sitting right below this, so a line explaining that
              the day is done was the third thing on screen saying it. A day
              with nothing on it still gets the invitation, because there the
              only useful thing is a way to add something. */}
          {remaining.length === 0 ? (
            total > 0 ? null : (
              <EmptyState
                message="Nothing scheduled."
                actionLabel="Add a Knowt"
                onAction={() => navigation.navigate('AddKnowt')}
              />
            )
          ) : (
            remaining.map((card) => {
              const live = cardStatus(card, now.getTime(), clock);
              return (
              <KnowtCard
                key={`${card.knowt.id}:${card.schedule?.id ?? 'untimed'}`}
                name={card.knowt.name}
                meta={metaOf(card)}
                status={live?.text ?? null}
                statusIcon={live?.icon ?? null}
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
              );
            })
          )}

          {/* Last, under the day's own list. It is reference rather than work,
              so today's cards come first; on a day that is already clear there
              is nothing above it anyway, which is where it used to be the only
              thing that rendered. */}
          {showUpcoming({
            total,
            stance,
            upcomingCount: upcoming?.length ?? 0,
          }) ? (
            <UpcomingSection
              entries={upcoming ?? []}
              expanded={upcomingOpen}
              onToggle={() => setUpcomingOpen((open) => !open)}
              onOpen={openKnowt}
              now={now}
            />
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  date: {
    paddingHorizontal: theme.spacing.xl,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  todayPill: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
  },
  todayPillText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  pressed: { opacity: 0.7 },

  stripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  stripArrow: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xl,
    color: theme.color.textMuted,
  },
  strip: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
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
  stripDayToday: {
    borderWidth: 1.5,
    borderColor: theme.color.textPrimary,
  },
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

  snoozed: {
    marginHorizontal: theme.spacing.xl,
    // The same gap the scrolling content puts between its own sections, so the
    // card reads as the next thing down rather than as part of the week strip
    // it was sitting against. One wrapper holds every snoozed Knowt, so the
    // spacing does not change when there are two or more.
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
    gap: theme.spacing.xs,
  },
  snoozedTitle: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  snoozedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: 5,
  },
  snoozedName: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  snoozedWhen: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  upcoming: { marginTop: theme.spacing.lg, gap: theme.spacing.xs },
  upcomingHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
  },
  upcomingTitle: {
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
    paddingVertical: theme.spacing.sm,
    // Half strength, the white card included, so the whole row sits back from
    // today's work rather than competing with it. On the View rather than in
    // the colors, so the icon, the text and the card all fade together.
    opacity: 0.5,
  },
  // Pressing goes the other way, up to full strength, so a row that is being
  // touched is the one row on the page at full opacity. Halving 0.5 again
  // would have made the feedback read as the row switching off.
  upcomingRowPressed: { opacity: 1 },
  upcomingName: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  upcomingWhen: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    ...theme.font.tabular,
  },
});
