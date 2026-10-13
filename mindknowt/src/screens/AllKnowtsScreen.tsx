import { useCallback, useState } from 'react';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';

import { CategoryDot } from '../components/KnowtCard';
import {
  isScanOnly,
  SCAN_ONLY_META,
  SCANNED_TODAY,
} from '../knowts/scanOnly';
import { scanKnowtTag } from '../knowts/scanKnowt';
import { CategoryIcon } from '../components/CategoryIcon';
import { Icon } from '../components/Icon';
import { BAND, iconSizeForText } from '../components/iconMetrics';
import { EmptyState, TabHeader } from '../components/ui';
import { SwipeToDelete } from '../components/SwipeToDelete';
import {
  applyFilter,
  filterLabel,
  sameFilter,
  type KnowtFilter,
} from '../knowts/knowtFilter';
import { askToDelete, askToPurge, sayTagFreed } from '../knowts/deletePrompt';
import {
  completedTodayIds,
  deleteKnowt,
  listArchived,
  listDeleted,
  purgeKnowt,
  undeleteKnowt,
  listCategories,
  describeRepeat,
  formatTime,
  listKnowts,
  setPinned,
  listDrafts,
  listTagged,
  nextOccurrence,
  type CategoryGroup,
  type KnowtWithDetail,
} from '../db';
import { useQuery } from '../db/useQuery';
import { categoryShades, theme, type CategoryShades } from '../theme';
import type { RootStackParamList, TabParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type KnowtsRoute = RouteProp<TabParamList, 'AllKnowts'>;

/** What the list says when a filter has narrowed it to nothing. */
function emptyMessage(filter: KnowtFilter): string {
  if (filter.kind === 'no-schedule') return 'Every Knowt has a schedule.';
  if (filter.kind === 'no-tag') return 'Every Knowt has a tag attached.';
  if (filter.kind === 'category') return 'Nothing in this category yet.';
  return 'No Knowts yet.';
}

/** One category filter. Rendered in a horizontal strip, so it never wraps. */
function FilterChip({
  label,
  active,
  onPress,
  shades,
  quiet = false,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  shades?: CategoryShades;
  quiet?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipOn,
        quiet && styles.chipQuiet,
        pressed && styles.pressed,
      ]}>
      {shades && !active ? (
        <View style={[styles.chipDot, { backgroundColor: shades.color }]} />
      ) : null}
      <Text
        style={[
          styles.chipText,
          active && styles.chipTextOn,
          quiet && styles.chipTextQuiet,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The Knowts row: a white card with a narrow accent, not a tinted block.
 *
 * The tinted version filled each row with its category color, which made a
 * list of seven categories read as seven blocks of paint. The color is a bar
 * down the left edge now and the card is white, so the eye reads names first
 * and color second.
 */
const ROW_HEIGHT = 58;

/**
 * The mark beside a Knowt's name, sized to the name's own ascender band.
 *
 * One number rather than a role, because what it has to match is the text,
 * not the other rows' glyphs.
 */
const NAME_GLYPH = iconSizeForText(theme.font.size.md, BAND.ascender);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function clock(at: Date): string {
  const hours = at.getHours();
  const minutes = `${at.getMinutes()}`.padStart(2, '0');
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${hours < 12 ? 'am' : 'pm'}`;
}

/** The soonest moment any schedule on this knowt next fires. */
function soonestFor(knowt: KnowtWithDetail, now: Date): Date | null {
  let soonest: Date | null = null;
  for (const schedule of knowt.schedules) {
    const at = nextOccurrence(schedule, now);
    if (at && (!soonest || at < soonest)) soonest = at;
  }
  return soonest;
}

/** Short enough for the right edge of a row: a time, a day, or a date. */
/** One identity, so a render with nothing done today does not churn. */
const EMPTY_SET: ReadonlySet<string> = new Set();

function nextLabel(
  knowt: KnowtWithDetail,
  at: Date | null,
  now: Date,
  doneToday: boolean,
): string {
  // Four different things used to read "No schedule", which is why
  // "Supplements Tag Test" said one thing here and another on Daily. The pill
  // shows the next firing, and a one-off whose day has passed has none, so it
  // fell into the same label as a Knowt that never had a schedule at all.
  if (isScanOnly(knowt)) return doneToday ? SCANNED_TODAY : SCAN_ONLY_META;
  // Genuinely nothing set. A plain unscheduled Knowt, waiting for a time.
  if (knowt.schedules.length === 0) return 'No schedule';
  if (!at) {
    // It has one and there is nothing ahead: a one-off that has been, or a
    // schedule switched off. Two different answers, both true.
    return knowt.schedules.some((schedule) => schedule.enabled === 1)
      ? 'Finished'
      : 'Paused';
  }

  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);

  if (days <= 0) return clock(at);
  if (days < 7) return WEEKDAYS[at.getDay()] ?? '';
  return `${MONTHS[at.getMonth()]} ${at.getDate()}`;
}

/**
 * One Knowt, in its category's colors.
 *
 * **The colors come from the Knowt, not from the section it is sitting in.**
 * They used to be handed down by `CategorySection`, which is right while every
 * row in a section really is that category and wrong the moment one is not:
 * the Pinned section passes `categoryShades(null)`, the uncategorized gray, so
 * every pinned row was painted gray whatever it actually was. Resolving here
 * means a pinned row and the same Knowt's row in its own group cannot differ,
 * because there is only one place that decides.
 *
 * The section keeps its own shades for its header, which is why PINNED stays
 * neutral while the rows under it are not.
 */
function KnowtRow({
  knowt,
  now,
  doneToday = false,
  onPress,
  onTogglePin,
  onScan,
}: {
  knowt: KnowtWithDetail;
  now: Date;
  /** Whether its scan or check-in landed today. Only a Scan Knowt shows it. */
  doneToday?: boolean;
  onPress: () => void;
  onTogglePin: () => void;
  /** Starts the scan from the row, so a tag on the fridge needs no detour. */
  onScan?: () => void;
}) {
  const pinned = knowt.is_pinned === 1;
  const scanOnly = isScanOnly(knowt);
  const shades = categoryShades(knowt.category);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${knowt.name}${pinned ? ', pinned' : ''}`}
      accessibilityHint="Hold to pin or unpin"
      onPress={onPress}
      onLongPress={onTogglePin}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: shades.fill },
        pressed && styles.pressed,
      ]}>
      <View style={styles.rowIcon}>
        <CategoryIcon icon={knowt.category?.icon} shades={shades} size={30} />
        {/* A badge on the category icon's corner rather than a glyph in front
            of the name. In front of the name it pushed the name 15 points
            right, so a pinned row and an unpinned one did not share a left
            edge, and reserving the space in every row would have straightened
            the edge by taking those 15 points off every name instead. On the
            corner it costs nothing and sits where "pinned" belongs: on the
            thing that is pinned. */}
        {pinned ? (
          <View style={styles.rowPin}>
            <Icon name="pin" size={11} color={shades.ink} />
          </View>
        ) : null}
      </View>

      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.rowName, { color: shades.ink }]}>
            {knowt.name}
          </Text>
          {/* The brand mark, not a generic price tag, sized so its ink fills
              the name's own band: bottom on the baseline, top at the height
              of b, l and k. It used to be a 16 point box centered on the line
              box, which made it both taller than the letters and floating
              above their feet. */}
          {knowt.tag_uid ? (
            <Icon name="knowtTag" size={NAME_GLYPH} color={shades.ink} />
          ) : null}
        </View>
        {knowt.location_note ? (
          <Text numberOfLines={1} style={styles.rowWhere}>
            {knowt.location_note}
          </Text>
        ) : null}
      </View>

      {/* A Scan Knowt has no next time, so the pill that carries one on every
          other row is the control instead: one lime pill where the eye already
          looks, rather than a "Scan only" label and a bracket glyph beside it.
          Nested inside the row's Pressable, which is fine: the inner one wins
          the touch, and the row still opens everywhere else. */}
      {scanOnly && onScan ? (
        doneToday ? (
          <View style={[styles.rowPill, styles.rowPillQuiet]}>
            <Icon name="check" size={13} color={theme.color.textMuted} />
            <Text style={styles.rowDone}>{SCANNED_TODAY}</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              knowt.tag_uid
                ? `Scan ${knowt.name}`
                : `Add a Knowt Tag to scan for ${knowt.name}`
            }
            // The pill is pill sized; the touch is not. 12 on every side of a
            // 24pt pill clears 44 without making the row any taller.
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            onPress={onScan}
            style={({ pressed }) => [
              styles.rowPill,
              styles.rowPillOn,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.rowScanText}>
              {knowt.tag_uid ? 'Scan' : 'Add tag'}
            </Text>
          </Pressable>
        )
      ) : (
        <View style={styles.rowPill}>
          <Text style={[styles.rowNext, { color: shades.ink }]}>
            {nextLabel(knowt, soonestFor(knowt, now), now, doneToday)}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * A category and the knowts in it.
 *
 * Grouping came back after filters alone made a long list hard to scan. The
 * two work together: a filter narrows to one section, and without one the
 * sections are what give the list a shape.
 */
function CategorySection({
  name,
  icon,
  shades,
  knowts,
  expanded,
  onToggle,
  now,
  doneToday,
  onOpenKnowt,
  onTogglePin,
  onDelete,
  onScan,
}: {
  name: string;
  icon: string | null;
  shades: CategoryShades;
  knowts: KnowtWithDetail[];
  expanded: boolean;
  onToggle: () => void;
  now: Date;
  doneToday: ReadonlySet<string>;
  onOpenKnowt: (id: string) => void;
  onTogglePin: (knowt: KnowtWithDetail) => void;
  onDelete: (knowt: KnowtWithDetail) => void;
  onScan: (knowt: KnowtWithDetail) => void;
}) {
  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${name}, ${knowts.length}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.sectionHead, pressed && styles.pressed]}>
        <CategoryIcon icon={icon} shades={shades} size={22} />
        <Text style={[styles.sectionName, { color: shades.ink }]}>{name}</Text>
        <Text style={styles.sectionCount}>{knowts.length}</Text>
        <Icon name={expanded ? 'collapse' : 'expand'} size={14} color={theme.color.textSecondary} />
      </Pressable>

      {expanded
        ? knowts.map((knowt) => (
            <SwipeToDelete
              key={knowt.id}
              spacing={theme.spacing.sm}
              onDelete={() => onDelete(knowt)}>
              <KnowtRow
                knowt={knowt}
                now={now}
                doneToday={doneToday.has(knowt.id)}
                onPress={() => onOpenKnowt(knowt.id)}
                onTogglePin={() => onTogglePin(knowt)}
                onScan={() => onScan(knowt)}
              />
            </SwipeToDelete>
          ))
        : null}
    </View>
  );
}

/**
 * Drafts and archived knowts, at the bottom.
 *
 * Small and closed by default, because neither is what the screen is for, but
 * present, because a draft that cannot be found is the same as the lost work it
 * was meant to prevent.
 */
function Stash({
  title,
  note,
  knowts,
  expanded,
  onToggle,
  onOpenKnowt,
  onHoldKnowt,
  countWhenClosed = true,
}: {
  title: string;
  note: string;
  knowts: KnowtWithDetail[];
  expanded: boolean;
  onToggle: () => void;
  onOpenKnowt: (id: string) => void;
  /** Only Deleted uses this, for the permanent one. */
  onHoldKnowt?: (id: string) => void;
  /**
   * Whether the count shows while the section is shut. Tags in use hides it:
   * a number sitting there invites reading something into it, and how many
   * tags are in play is a thing to go and look at rather than a score.
   */
  countWhenClosed?: boolean;
}) {
  if (knowts.length === 0) return null;

  return (
    <View style={styles.stash}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${title}, ${knowts.length}`}
        onPress={onToggle}
        style={({ pressed }) => [styles.stashHeader, pressed && styles.pressed]}>
        <Text style={styles.stashTitle}>{title}</Text>
        {countWhenClosed || expanded ? (
          <Text style={styles.stashCount}>{knowts.length}</Text>
        ) : null}
        <Icon name={expanded ? 'collapse' : 'expand'} size={14} color={theme.color.textSecondary} />
      </Pressable>

      {expanded ? (
        <View style={styles.stashRows}>
          <Text style={styles.stashNote}>{note}</Text>
          {knowts.map((knowt) => (
            <Pressable
              key={knowt.id}
              accessibilityRole="button"
              onPress={() => onOpenKnowt(knowt.id)}
              onLongPress={
                onHoldKnowt ? () => onHoldKnowt(knowt.id) : undefined
              }
              style={({ pressed }) => [
                styles.stashRow,
                pressed && styles.pressed,
              ]}>
              <CategoryDot shades={categoryShades(knowt.category)} />
              <Text numberOfLines={1} style={styles.stashName}>
                {knowt.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function AllKnowtsScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<KnowtsRoute>();
  const now = new Date();
  const { data: knowts, loading, reload } = useQuery(() => listKnowts(), []);
  const { data: categories, reload: reloadCategories } = useQuery(
    () => listCategories(),
    [],
  );
  const { data: tagged, reload: reloadTagged } = useQuery(() => listTagged(), []);
  const { data: deleted, reload: reloadDeleted } = useQuery(() => listDeleted(), []);
  const { data: drafts, reload: reloadDrafts } = useQuery(() => listDrafts(), []);
  const { data: archived, reload: reloadArchived } = useQuery(
    () => listArchived(),
    [],
  );
  const { data: doneToday, reload: reloadDoneToday } = useQuery(
    () => completedTodayIds(),
    [],
  );
  const scannedToday: ReadonlySet<string> = doneToday ?? EMPTY_SET;
  const [openStash, setOpenStash] = useState<Record<string, boolean>>({});
  /** A failed scan has to say why. Nothing else on this screen can fail. */
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Filters rather than groups, so the list stays one list. A shape rather
   * than a category id, because Log's gap cards open this screen on something
   * that is not a category; see `knowtFilter.ts`.
   */
  const [filter, setFilter] = useState<KnowtFilter>({ kind: 'all' });

  // Arriving from a Log card. Written on every focus with a `focus` param, so
  // tapping the same card twice narrows the list twice rather than once.
  const focus = route.params?.focus;
  const focusCategory = route.params?.categoryId;
  useFocusEffect(
    useCallback(() => {
      if (focus) setFilter({ kind: focus });
      else if (focusCategory) {
        setFilter({ kind: 'category', categoryId: focusCategory });
      }
    }, [focus, focusCategory]),
  );
  // Open is the default, so this holds only what has been shut by hand.
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});

  // Pinned first is already the query's order, so grouping preserves it inside
  // each section, which is what "pinned first, sorted with everything else"
  // means once the list has sections again.
  const visible = applyFilter(knowts ?? [], filter);

  /**
   * Pinned, at the top, above the first category.
   *
   * Absent rather than empty when nothing is pinned, the same as Upcoming on
   * Daily: a heading over no rows says less than no heading. Built from the
   * filtered list, so a filter that hides a Knowt hides it here too rather
   * than leaking it back in at the top.
   */
  const pinned = visible.filter((knowt) => knowt.is_pinned === 1);

  const sections = (() => {
    const byCategory = new Map<string, KnowtWithDetail[]>();
    for (const knowt of visible) {
      const key = knowt.category?.id ?? 'none';
      const list = byCategory.get(key);
      if (list) list.push(knowt);
      else byCategory.set(key, [knowt]);
    }

    // Categories in their own order, with the uncategorized group last.
    const ordered = (categories ?? [])
      .filter((category) => byCategory.has(category.id))
      .map((category) => ({
        key: category.id,
        name: category.name,
        icon: category.icon as string | null,
        shades: categoryShades(category),
        knowts: byCategory.get(category.id) ?? [],
      }));

    const loose = byCategory.get('none');
    if (loose) {
      ordered.push({
        key: 'none',
        name: 'Everything else',
        icon: null,
        shades: categoryShades(null),
        knowts: loose,
      });
    }
    return ordered;
  })();

  const togglePin = async (knowt: KnowtWithDetail) => {
    await setPinned(knowt.id, knowt.is_pinned !== 1);
    await reload();
  };

  /**
   * Scanning a Scan Knowt straight from its row.
   *
   * The whole point of a tag on the fridge is that you are standing at the
   * fridge, so opening the Knowt first is a detour. A Knowt with no tag yet
   * goes to its own screen instead, where attaching one lives.
   */
  const scanRow = async (knowt: KnowtWithDetail) => {
    if (!knowt.tag_uid) {
      navigation.navigate('KnowtDetail', { knowtId: knowt.id });
      return;
    }
    setNotice(null);
    const outcome = await scanKnowtTag(knowt);
    if (outcome.kind === 'failed') setNotice(outcome.message);
    if (outcome.kind === 'done') await reloadDoneToday();
  };

  const refreshAll = async () => {
    await reload();
    await reloadTagged();
    await reloadDeleted();
    await reloadArchived();
    await reloadDoneToday();
  };

  const remove = async (knowt: KnowtWithDetail) => {
    if (!(await askToDelete(knowt.name))) return;
    const { tagFreed } = await deleteKnowt(knowt.id);
    await refreshAll();
    // Said in words about the tag, because that is the part with a consequence
    // outside the app: there is a sticker somewhere that now means nothing.
    if (tagFreed) sayTagFreed();
  };

  const restore = async (knowt: KnowtWithDetail) => {
    await undeleteKnowt(knowt.id);
    await refreshAll();
  };

  const purge = async (knowt: KnowtWithDetail) => {
    if (!(await askToPurge(knowt.name))) return;
    await purgeKnowt(knowt.id);
    await refreshAll();
  };

  // A knowt renamed or archived elsewhere must not linger here as it was.
  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadCategories();
      void reloadDrafts();
      void reloadArchived();
      void reloadTagged();
      void reloadDeleted();
      // Scanning one from its own detail screen is the ordinary way to do it,
      // and coming back here has to show that it landed. Without this the row
      // still read "Scan only" until the screen remounted, which also meant a
      // day rolling over while the app was open left yesterday's Done today
      // sitting there.
      void reloadDoneToday();
    }, [
      reload,
      reloadCategories,
      reloadDrafts,
      reloadArchived,
      reloadTagged,
      reloadDoneToday,
      reloadDeleted,
    ]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Outside `content`, which carries its own horizontal padding. Nested
          inside it the header was indented twice and sat further right than
          the same header on Daily and Log. */}
      <TabHeader
        title="Knowts"
        onSettings={() => navigation.navigate('Settings')}
      />

      <View style={styles.content}>

        {/* Horizontal, because seven categories plus All never fit on one
            line at phone width, and a wrapped row of chips pushes the list
            off the screen before anyone has read anything. */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}>
            <FilterChip
              label="All"
              active={filter.kind === 'all'}
              onPress={() => setFilter({ kind: 'all' })}
            />
            {/* Only while one is on. They are destinations from Log rather
                than everyday controls, and a permanent chip for "no schedule"
                would sit there reading as a category. */}
            {filter.kind === 'no-schedule' || filter.kind === 'no-tag' ? (
              <FilterChip
                label={filterLabel(filter, categories ?? [])}
                active
                onPress={() => setFilter({ kind: 'all' })}
              />
            ) : null}
            {(categories ?? []).map((category) => (
              <FilterChip
                key={category.id}
                label={category.name}
                shades={categoryShades(category)}
                active={sameFilter(filter, {
                  kind: 'category',
                  categoryId: category.id,
                })}
                onPress={() =>
                  setFilter(
                    sameFilter(filter, {
                      kind: 'category',
                      categoryId: category.id,
                    })
                      ? { kind: 'all' }
                      : { kind: 'category', categoryId: category.id },
                  )
                }
              />
            ))}
            <FilterChip
              label="Manage"
              quiet
              active={false}
              onPress={() => navigation.navigate('Categories')}
            />
          </ScrollView>
        </View>

        {/* A scan started from a row has nowhere else to report. Only a
            failure appears: a scan that worked shows as Done today on the row
            it was started from. */}
        {notice ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => setNotice(null)}
            style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        ) : null}

        {loading ? (
          <ActivityIndicator color={theme.color.textSecondary} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
            {visible.length === 0 ? (
              <EmptyState
                message={emptyMessage(filter)}
                actionLabel={filter.kind === 'all' ? 'Add a Knowt' : undefined}
                onAction={
                  filter.kind === 'all'
                    ? () => navigation.navigate('AddKnowt')
                    : undefined
                }
              />
            ) : (
              <>
                {/* Pinned leads, and is absent rather than empty. Its Knowts
                    stay in their own category group below as well: this is a
                    shortcut to the ones you reach for, not a place they have
                    moved to, and a Knowt disappearing from Care because it was
                    pinned would be the worse surprise. */}
                {pinned.length > 0 ? (
                  <CategorySection
                    key="pinned"
                    name="Pinned"
                    icon="pin"
                    // The heading only. Neutral on purpose, because Pinned is
                    // not a category and coloring it one would claim it is.
                    // The rows under it take their own category's colors.
                    shades={categoryShades(null)}
                    knowts={pinned}
                    now={now}
                    doneToday={scannedToday}
                    expanded={!closedSections.pinned}
                    onToggle={() =>
                      setClosedSections((prev) => ({
                        ...prev,
                        pinned: !prev.pinned,
                      }))
                    }
                    onOpenKnowt={(knowtId) =>
                      navigation.navigate('KnowtDetail', { knowtId })
                    }
                    onTogglePin={(knowt) => void togglePin(knowt)}
                    onDelete={(knowt) => void remove(knowt)}
                    onScan={(knowt) => void scanRow(knowt)}
                  />
                ) : null}

                {sections.map((section) => (
                  <CategorySection
                    key={section.key}
                    name={section.name}
                    icon={section.icon}
                    shades={section.shades}
                    knowts={section.knowts}
                    now={now}
                    doneToday={scannedToday}
                    expanded={!closedSections[section.key]}
                    onToggle={() =>
                      setClosedSections((prev) => ({
                        ...prev,
                        [section.key]: !prev[section.key],
                      }))
                    }
                    onOpenKnowt={(knowtId) =>
                      navigation.navigate('KnowtDetail', { knowtId })
                    }
                    onTogglePin={(knowt) => void togglePin(knowt)}
                    onDelete={(knowt) => void remove(knowt)}
                    onScan={(knowt) => void scanRow(knowt)}
                  />
                ))}
              </>
            )}

            <Stash
              title="Tags in use"
              note="Every Knowt with a tag attached. Open one to free its tag or swap it."
              knowts={tagged ?? []}
              countWhenClosed={false}
              expanded={!!openStash.tagged}
              onToggle={() =>
                setOpenStash((prev) => ({ ...prev, tagged: !prev.tagged }))
              }
              onOpenKnowt={(knowtId) =>
                navigation.navigate('KnowtDetail', { knowtId })
              }
            />

            <Stash
              title="Drafts"
              note="Started and not finished. Opening one picks it back up."
              knowts={drafts ?? []}
              expanded={!!openStash.drafts}
              onToggle={() =>
                setOpenStash((prev) => ({ ...prev, drafts: !prev.drafts }))
              }
              onOpenKnowt={(knowtId) =>
                navigation.navigate('KnowtDetail', { knowtId })
              }
            />

            <Stash
              title="Deleted"
              note="Tap one to put it back, or hold to remove it for good."
              knowts={deleted ?? []}
              expanded={!!openStash.deleted}
              onToggle={() =>
                setOpenStash((prev) => ({ ...prev, deleted: !prev.deleted }))
              }
              onOpenKnowt={(knowtId) => {
                const knowt = (deleted ?? []).find((k) => k.id === knowtId);
                if (knowt) void restore(knowt);
              }}
              onHoldKnowt={(knowtId) => {
                const knowt = (deleted ?? []).find((k) => k.id === knowtId);
                if (knowt) void purge(knowt);
              }}
            />

            <Stash
              title="Archived"
              note="Kept, but not in the way. Nothing here rings."
              knowts={archived ?? []}
              expanded={!!openStash.archived}
              onToggle={() =>
                setOpenStash((prev) => ({ ...prev, archived: !prev.archived }))
              }
              onOpenKnowt={(knowtId) =>
                navigation.navigate('KnowtDetail', { knowtId })
              }
            />
          </ScrollView>
        )}

        {/* Add now lives in the navigation bar, reachable from every screen,
            so repeating it here would be two buttons for one action. */}
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigation.navigate('BrowseSets')}
            style={({ pressed }) => [styles.presets, pressed && styles.pressed]}>
            <Text style={styles.presetsText}>Browse Presets</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    // Clears the floating tab bar, which is drawn over the content.
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: theme.spacing.md,
  },
  pressed: { opacity: 0.6 },
  list: { flex: 1 },

  filters: { flexDirection: 'row', gap: theme.spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.surface,
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
  chipQuiet: { backgroundColor: 'transparent' },
  chipDot: { width: 7, height: 7, borderRadius: 3.5 },
  chipText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  chipTextOn: { color: theme.color.onHighlight },
  chipTextQuiet: { color: theme.color.textMuted },

  // Compact and tinted, per the reference: the category carries the color and
  // the row carries as little height as it can while staying tappable.
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    // No vertical margin. The gap below a row belongs to SwipeToDelete, which
    // measures its Delete button against this row's height; see the note there.
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.lg,
  },
  rowIcon: { backgroundColor: theme.color.surface, borderRadius: 10 },
  // Off the corner, over the row rather than over the glyph: the badge is
  // rounded, so its corner is row colored anyway and nothing is covered.
  rowPin: { position: 'absolute', top: -4, left: -4 },
  rowText: { flex: 1, gap: 1 },
  rowTitle: {
    flexDirection: 'row',
    // On the baseline, not centered. An Ionicon's ink ends on the baseline
    // and so does the mark's box, so everything on this line stands on one
    // edge, at any text size.
    alignItems: 'baseline',
    gap: theme.spacing.xs,
  },
  rowName: {
    flexShrink: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
  },
  rowWhere: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  notice: {
    backgroundColor: theme.color.dangerSurface,
    borderWidth: 1,
    borderColor: theme.color.dangerBorder,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  noticeText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.dangerText,
  },
  rowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  // The one pill on a row that is a button, so it is the one pill that is
  // filled. Same shape and height as the rest; only the color says it is live.
  rowPillOn: { backgroundColor: theme.color.highlight },
  rowPillQuiet: { backgroundColor: 'transparent' },
  rowNext: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    ...theme.font.tabular,
  },
  rowScanText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.onHighlight,
  },
  rowDone: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },

  section: { marginBottom: theme.spacing.lg },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  sectionName: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionCount: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  // A rounded tile rather than a bare glyph, so the left edge of every row has
  // the same shape to land on.
  stash: { marginTop: theme.spacing.md },
  stashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  stashTitle: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  stashCount: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  stashRows: { gap: theme.spacing.xs, paddingBottom: theme.spacing.sm },
  stashNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
    marginBottom: theme.spacing.xs,
  },
  stashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  stashName: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  // Clears the floating tab bar rather than sitting on it. The container's
  // bottom padding is the bar's own height, so anything drawn after the list
  // needs its own room underneath as well as above.
  footer: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  // Inverted so it still reads as the way in, but sized as a control rather
  // than as the conclusion of the screen.
  presets: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
  },
  presetsText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.onPrimary,
  },
});
