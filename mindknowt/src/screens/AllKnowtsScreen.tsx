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
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';

import { CategoryDot } from '../components/KnowtCard';
import { ExpandSign, NfcIcon, PinIcon } from '../components/icons';
import { EmptyState, ScreenHeader } from '../components/ui';
import { SwipeToDelete } from '../components/SwipeToDelete';
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
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
const ROW_HEIGHT = 76;

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
function nextLabel(at: Date | null, now: Date): string {
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
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.accent, { backgroundColor: shades.color }]} />

      <View style={styles.rowText}>
        <View style={styles.rowTitle}>
          {pinned ? <PinIcon size={12} color={shades.ink} /> : null}
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.rowName}>
            {knowt.name}
          </Text>
          {/* Whether a tag is attached, which is not the same question as
              whether the knowt is in Scan mode. */}
          {knowt.tag_uid ? <NfcIcon size={13} color={shades.ink} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {knowt.schedules.length > 0
            ? `${formatTime(knowt.schedules[0]!.time)}, ${describeRepeat(knowt.schedules[0]!)}`
            : 'No schedule'}
        </Text>
        {knowt.location_note ? (
          <Text numberOfLines={1} style={styles.rowWhere}>
            {knowt.location_note}
          </Text>
        ) : null}
      </View>

      <Text style={styles.rowNext}>{nextLabel(soonestFor(knowt, now), now)}</Text>
    </Pressable>
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
        <ExpandSign expanded={expanded} size={14} />
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
  /** Null is All. Filters rather than groups, so the list stays one list. */
  const [filter, setFilter] = useState<string | null>(null);

  // Pinned first is already the query's order, so filtering preserves it.
  const visible = (knowts ?? []).filter(
    (knowt) => filter === null || knowt.category?.id === filter,
  );

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
      <View style={styles.content}>
        <ScreenHeader title="Knowts" />

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
              active={filter === null}
              onPress={() => setFilter(null)}
            />
            {(categories ?? []).map((category) => (
              <FilterChip
                key={category.id}
                label={category.name}
                shades={categoryShades(category)}
                active={filter === category.id}
                onPress={() =>
                  setFilter(filter === category.id ? null : category.id)
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
                message={
                  filter === null
                    ? 'No knowts yet.'
                    : 'Nothing in this category yet.'
                }
                actionLabel={filter === null ? 'Add a knowt' : undefined}
                onAction={
                  filter === null
                    ? () => navigation.navigate('AddKnowt')
                    : undefined
                }
              />
            ) : (
              visible.map((knowt) => (
                <SwipeToDelete key={knowt.id} onDelete={() => void remove(knowt)}>
                  <KnowtRow
                    knowt={knowt}
                    shades={categoryShades(knowt.category)}
                    now={now}
                    onPress={() =>
                      navigation.navigate('KnowtDetail', { knowtId: knowt.id })
                    }
                    onTogglePin={() => void togglePin(knowt)}
                  />
                </SwipeToDelete>
              ))
            )}

            <Stash
              title="Tags in use"
              note="Every knowt with a tag attached. Open one to free its tag or swap it."
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

  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    paddingRight: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.color.surface,
    ...theme.shadow.card,
  },
  // The whole of the color on a Knowts card, and the reason it reads white.
  accent: {
    width: 5,
    height: ROW_HEIGHT - theme.spacing.lg * 2,
    marginLeft: theme.spacing.md,
    borderRadius: 3,
  },
  rowText: { flex: 1, gap: 1 },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowName: {
    flexShrink: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  rowMeta: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  rowWhere: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  rowNext: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
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
