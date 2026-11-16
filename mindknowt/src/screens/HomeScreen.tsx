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

import { describeError, settled } from '../alarms';
import { resyncAlarmsQuietly } from '../alarms/scheduleSync';
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
  occurrenceMoment,
  toISODate,
  undoCompletion,
  type DashboardCard,
  type DayMark,
  type EventMethod,
  type KnowtWithDetail,
  type SnoozedEntry,
  type UpcomingEntry,
} from '../db';
import { useQuery } from '../db/useQuery';
import { completeOccurrence } from '../knowts/completeOccurrence';
import { needsScan } from '../knowts/modes';
import { scanKnowtTag } from '../knowts/scanKnowt';
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
/**
 * Which half of the page a message belongs to.
 *
 * The board is at the top and Upcoming is at the bottom, and a failure has to
 * render within a screenful of the finger that caused it. One piece of state
 * rather than two, so two messages cannot be up at once saying different
 * things about the same tap.
 */
type NoticeWhere = 'board' | 'upcoming';

/**
 * What the screen has to say after completing one occurrence.
 *
 * `eventId` is what makes the Undo possible, so it is on the shape rather than
 * in a second piece of state that could get out of step with the message.
 * A failure carries no id, because there is nothing to take back.
 */
type CompletionNotice =
  | { where: NoticeWhere; tone: 'done'; text: string; eventId: string }
  | { where: NoticeWhere; tone: 'danger'; text: string };

/**
 * One occurrence this screen can finish, from a Today card or an Upcoming row.
 *
 * Both halves used to call their own completion, and only one of them asked
 * what Mode the Knowt was: a Scan + Alarm Knowt was finished by tapping the
 * ring on its Today card, with no scan and nothing said. One shape, one
 * dispatcher, so a new entry point cannot forget.
 */
type Target = {
  knowt: KnowtWithDetail;
  scheduleId: string | null;
  /** The occurrence's own moment, for one whose time has not come. */
  completedAt?: number;
  /**
   * The firing this answers, which is what stands that one alarm down and
   * leaves every other firing the same day armed.
   */
  occurrenceAt?: number;
  /** How a message names the day. */
  when: string;
  where: NoticeWhere;
};

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
  // Every card on Daily has one. The type allows null because completions and
  // pending alarms can both be schedule-less, not because a card can be.
  if (!schedule) return '';
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
 * A confirmation with an Undo, or a failure with a Dismiss.
 *
 * Rendered twice, once beside each set of controls, and only ever filled in
 * one of them.
 */
function NoticeBanner({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: CompletionNotice;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <View
      style={[
        styles.skipNotice,
        notice.tone === 'danger' && styles.skipNoticeDanger,
      ]}>
      <Text
        style={[
          styles.skipNoticeText,
          notice.tone === 'danger' && styles.skipNoticeDangerText,
        ]}>
        {notice.text}
      </Text>
      <Pressable
        accessibilityRole="button"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={notice.tone === 'done' ? onUndo : onDismiss}
        style={({ pressed }) => [
          styles.skipNoticeAction,
          pressed && styles.pressed,
        ]}>
        <Text style={styles.skipNoticeActionText}>
          {notice.tone === 'done' ? 'Undo' : 'Dismiss'}
        </Text>
      </Pressable>
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
  onComplete,
  notice,
  onUndo,
  onDismiss,
  now,
}: {
  entries: UpcomingEntry[];
  expanded: boolean;
  onToggle: () => void;
  onOpen: (knowtId: string) => void;
  onComplete: (entry: UpcomingEntry) => void;
  notice: CompletionNotice | null;
  onUndo: () => void;
  onDismiss: () => void;
  now: Date;
}) {
  // The notice belongs to this section, so it goes when the section does. It
  // cannot outlive the rows it is about.
  if (entries.length === 0 && !notice) return null;

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

      {/* Directly under the heading, above the rows that raise it. The section
          renders last on the page, so a message anywhere else would be a
          screen away from the finger that caused it. */}
      {notice ? (
        <NoticeBanner notice={notice} onUndo={onUndo} onDismiss={onDismiss} />
      ) : null}

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
                {/* Two lines, so the control beside them has room. On one line
                    the name was down to about 60 points at 390, which is three
                    or four characters and an ellipsis. */}
                <View style={styles.upcomingText}>
                  <Text numberOfLines={1} style={styles.upcomingName}>
                    {entry.knowt.name}
                  </Text>
                  <Text style={styles.upcomingWhen}>
                    {whenLabel(entry.at, now)}
                  </Text>
                </View>

                {/* The same control a Today row carries: an open ring, 26
                    points, in the border gray, with the same 10 point hit
                    slop. Nested inside the row's Pressable, the same as the
                    scan pill on the Knowts list: the inner one wins the touch,
                    so the ring completes the occurrence and the rest of the
                    row still opens the Knowt.

                    What a tap does depends on the Mode, and the label says
                    which before anyone finds out. A scan Mode has no way to be
                    marked done from here: the ring opens the reader and only a
                    read of this Knowt's own tag records anything. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    needsScan(entry.knowt)
                      ? `Scan the tag to mark ${entry.knowt.name} done for ${whenLabel(entry.at, now)}`
                      : `Mark ${entry.knowt.name} done for ${whenLabel(entry.at, now)}`
                  }
                  accessibilityHint="The Knowt keeps its other days"
                  hitSlop={10}
                  onPress={() => onComplete(entry)}
                  style={({ pressed }) => [
                    styles.upcomingCheck,
                    pressed && styles.pressed,
                  ]}>
                  <Icon name="circle" size={26} color={theme.color.border} />
                </Pressable>
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
  const [notice, setNotice] = useState<CompletionNotice | null>(null);
  // A ref rather than state: it guards the next tap, and nothing renders it.
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadMarks();
      void reloadUpcoming();
      void reloadSnoozed();
      // An Undo offered before leaving the screen is not an Undo on coming
      // back to it: the rows have been read again and the message would be
      // about a state nobody is looking at any more.
      setNotice(null);
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

  /**
   * Today's card. It is recorded now, so it needs no `completedAt`, but it
   * still has to say which of the day's firings it answered.
   */
  const cardTarget = (card: DashboardCard): Target => {
    const firing = card.schedule
      ? occurrenceMoment(card.schedule, now)
      : null;
    return {
      knowt: card.knowt,
      scheduleId: card.schedule?.id ?? null,
      occurrenceAt: firing?.getTime(),
      when: 'today',
      where: 'board',
    };
  };

  /** An Upcoming row. Its occurrence is days out and has to be stamped. */
  const upcomingTarget = (entry: UpcomingEntry): Target => ({
    knowt: entry.knowt,
    scheduleId: entry.schedule.id,
    completedAt: entry.at.getTime(),
    occurrenceAt: entry.at.getTime(),
    when: whenLabel(entry.at, now),
    where: 'upcoming',
  });

  /**
   * Skipping one occurrence of a recurring Knowt.
   *
   * The same completion path as everything else, so the Log, the reconciler
   * and Daily all read one row. Two things make it mean this occurrence and no
   * other: the schedule id, without which a completion identifies no firing
   * and stands no alarm down, and `completedAt` set to the occurrence's own
   * moment, which is where the day it covers is read from.
   */
  const skipOccurrence = async (
    target: Target,
    method: Extract<EventMethod, 'tap' | 'scan'>,
  ) => {
    const written = await settled(
      completeOccurrence({
        knowtId: target.knowt.id,
        scheduleId: target.scheduleId,
        method,
        completedAt: target.completedAt,
        occurrenceAt: target.occurrenceAt,
      }),
    );
    if (!written.ok) {
      setNotice({
        where: target.where,
        tone: 'danger',
        text: `That could not be recorded. ${describeError(written.error)}`,
      });
      return;
    }
    setNotice({
      where: target.where,
      tone: 'done',
      eventId: written.value,
      text: `${method === 'scan' ? 'Scanned' : 'Marked'} ${target.knowt.name} ${
        method === 'scan' ? 'for' : 'done for'
      } ${target.when}. Its other days are unchanged.`,
    });
    await refreshBoard();
  };

  /**
   * What the ring on an Upcoming row does, which depends on the Mode.
   *
   * Alarm Only records the completion outright. A scan Mode cannot: it opens
   * the reader, and only a read of this Knowt's own tag records anything, so
   * there is no way to mark one done from Upcoming without scanning. The UID
   * goes down into the reader, so a wrong tag is refused inside the platform's
   * own sheet and nothing is written.
   *
   * One scan at a time. The reader's sheet is modal, but the tap that opens it
   * is not, and two scans racing would write two completions for one firing.
   */
  const completeTarget = async (target: Target) => {
    if (busy.current) return;
    setNotice(null);

    if (!needsScan(target.knowt)) {
      await skipOccurrence(target, 'tap');
      return;
    }

    busy.current = true;
    try {
      const outcome = await scanKnowtTag(
        target.knowt,
        target.scheduleId
          ? {
              scheduleId: target.scheduleId,
              completedAt: target.completedAt,
              occurrenceAt: target.occurrenceAt,
            }
          : undefined,
      );
      // Backing out of the sheet is not a failure, and the copy for every
      // reason that is one lives in `nfc/failureText.ts`.
      if (outcome.kind === 'canceled') return;
      if (outcome.kind === 'failed') {
        setNotice({ where: target.where, tone: 'danger', text: outcome.message });
        return;
      }
      setNotice({
        where: target.where,
        tone: 'done',
        eventId: outcome.eventId,
        text: `Scanned ${target.knowt.name} for ${target.when}. Its other days are unchanged.`,
      });
      await refreshBoard();
    } finally {
      busy.current = false;
    }
  };

  /**
   * Putting it back.
   *
   * Deleting the row is the whole of it: nothing is stored to say a day was
   * skipped, so the sync that follows asks the same question of the same table
   * and arms the occurrence again, as long as its time is still ahead.
   */
  const undoSkip = async (taken: CompletionNotice) => {
    if (taken.tone !== 'done') return;
    setNotice(null);
    const undone = await settled(undoCompletion(taken.eventId));
    if (!undone.ok) {
      setNotice({
        where: taken.where,
        tone: 'danger',
        text: `That could not be undone. ${describeError(undone.error)}`,
      });
      return;
    }
    await resyncAlarmsQuietly();
    await refreshBoard();
  };

  /** Everything a completion or an undo changes on this screen. */
  const refreshBoard = async () => {
    await reload();
    await reloadMarks();
    await reloadUpcoming();
    await reloadSnoozed();
  };

  const openKnowt = (knowtId: string) =>
    navigation.navigate('KnowtDetail', { knowtId });

  const cards = board?.today ?? [];
  // Completing sends a knowt to Log, so it leaves the list. The counts above
  // still come from the full board, which is what keeps them honest, and a
  // scan-only card is on the board like any other, so it counts in both.
  const remaining = cards.filter((card) => card.completedAt === null);
  const total = board?.total ?? 0;
  const done = board?.done ?? 0;

  const renderCard = (card: DashboardCard) => {
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
        // Only today can be checked off. Completing while reading Thursday
        // would write the completion at the moment of the tap, which is a
        // different day and a lie in the log.
        onComplete={
          stance === 'today'
            ? () => void completeTarget(cardTarget(card))
            : undefined
        }
      />
    );
  };

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

          {/* Above the cards, which is where the rings that raise it are. The
              board is at the top of the page and Upcoming is at the bottom, so
              one banner between them would be a screen away from one of them. */}
          {notice?.where === 'board' ? (
            <NoticeBanner
              notice={notice}
              onUndo={() => void undoSkip(notice)}
              onDismiss={() => setNotice(null)}
            />
          ) : null}

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
            remaining.map(renderCard)
          )}

          {/* Last, under the day's own list. It is reference rather than work,
              so today's cards come first; on a day that is already clear there
              is nothing above it anyway, which is where it used to be the only
              thing that rendered. */}
          {showUpcoming({
            total,
            stance,
            upcomingCount: upcoming?.length ?? 0,
          }) || notice?.where === 'upcoming' ? (
            <UpcomingSection
              entries={upcoming ?? []}
              expanded={upcomingOpen}
              onToggle={() => setUpcomingOpen((open) => !open)}
              onOpen={openKnowt}
              onComplete={(entry) => void completeTarget(upcomingTarget(entry))}
              notice={notice?.where === 'upcoming' ? notice : null}
              onUndo={() => void (notice && undoSkip(notice))}
              onDismiss={() => setNotice(null)}
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
  upcomingText: { flex: 1, gap: 1 },
  upcomingName: {
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
  // The same as `check` on a Today card, so the ring sits where the eye
  // already looks for it.
  upcomingCheck: { alignItems: 'center', justifyContent: 'center' },
  skipNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.highlightPale,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  skipNoticeDanger: {
    backgroundColor: theme.color.dangerSurface,
    borderColor: theme.color.dangerBorder,
  },
  skipNoticeText: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.textPrimary,
  },
  skipNoticeDangerText: { color: theme.color.dangerText },
  skipNoticeAction: { paddingHorizontal: theme.spacing.xs, paddingVertical: 2 },
  skipNoticeActionText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
});
