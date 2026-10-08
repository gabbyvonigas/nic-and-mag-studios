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
import { isScanOnly, SCAN_ONLY_META } from '../knowts/scanOnly';
import { CategoryIcon } from '../components/CategoryIcon';
import { Icon } from '../components/Icon';
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
function nextLabel(
  knowt: KnowtWithDetail,
  at: Date | null,
  now: Date,
): string {
  // Scan-only is asked first, because its pill is not about a date. "No
  // schedule" is true of it and useless: it names what the Knowt lacks rather
  // than what it is, and it reads identically to a Knowt someone forgot to
  // finish setting up. A paused schedule keeps "No schedule", which is the
  // honest thing to say about one.
  if (isScanOnly(knowt)) return SCAN_ONLY_META;
  if (!at) return 'No schedule';

  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);

  if (days <= 0) return clock(at);
  if (days < 7) return WEEKDAYS[at.getDay()] ?? '';
  return `${MONTHS[at.getMonth()]} ${at.getDate()}`;
}

function KnowtRow({
  knowt,
  shades,
  now,
  onPress,
  onTogglePin,
}: {
  knowt: KnowtWithDetail;
  shades: CategoryShades;
  now: Date;
  onPress: () => void;
  onTogglePin: () => void;
}) {
  const pinned = knowt.is_pinned === 1;

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
      </View>

      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          {pinned ? <Icon name="pin" size={11} color={shades.ink} /> : null}
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.rowName, { color: shades.ink }]}>
            {knowt.name}
          </Text>
          {knowt.tag_uid ? <Icon name="tag" size={12} color={shades.ink} /> : null}
        </View>
        {knowt.location_note ? (
          <Text numberOfLines={1} style={styles.rowWhere}>
            {knowt.location_note}
          </Text>
        ) : null}
      </View>

      <View style={styles.rowPill}>
        <Text style={[styles.rowNext, { color: shades.ink }]}>
          {nextLabel(knowt, soonestFor(knowt, now), now)}
        </Text>
      </View>
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
  onOpenKnowt,
  onTogglePin,
  onDelete,
}: {
  name: string;
  icon: string | null;
  shades: CategoryShades;
  knowts: KnowtWithDetail[];
  expanded: boolean;
  onToggle: () => void;
  now: Date;
  onOpenKnowt: (id: string) => void;
  onTogglePin: (knowt: KnowtWithDetail) => void;
  onDelete: (knowt: KnowtWithDetail) => void;
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
                shades={shades}
                now={now}
                onPress={() => onOpenKnowt(knowt.id)}
                onTogglePin={() => onTogglePin(knowt)}
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
  const [openStash, setOpenStash] = useState<Record<string, boolean>>({});
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

  const refreshAll = async () => {
    await reload();
    await reloadTagged();
    await reloadDeleted();
    await reloadArchived();
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
    }, [
      reload,
      reloadCategories,
      reloadDrafts,
      reloadArchived,
      reloadTagged,
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
              sections.map((section) => (
                <CategorySection
                  key={section.key}
                  name={section.name}
                  icon={section.icon}
                  shades={section.shades}
                  knowts={section.knowts}
                  now={now}
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
                />
              ))
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
  rowText: { flex: 1, gap: 1 },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
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
  rowPill: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
  },
  rowNext: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    ...theme.font.tabular,
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
