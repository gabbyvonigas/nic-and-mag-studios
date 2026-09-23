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

import { AlarmIcon, Chevron, ScanIcon } from '../components/icons';
import { PriorityBars } from '../components/KnowtCard';
import { Button, EmptyState, ScreenHeader } from '../components/ui';
import { requiresScan } from '../knowts/modes';
import {
  listCategories,
  listCategoryGroups,
  nextOccurrence,
  type CategoryGroup,
  type KnowtWithDetail,
} from '../db';
import { useQuery } from '../db/useQuery';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Knowts does not use the card.
 *
 * Daily and Knowts were the same card in the same stack, so the two screens
 * read as one screen shown twice. They answer different questions: Daily is
 * when, and gets the raised cards laid out as a sequence; Knowts is what you
 * have, and gets a dense list under a category rule. Rows are a uniform height
 * within this screen, which is what the shared-height rule was ever for.
 */
const ROW_HEIGHT = 52;

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
  ink,
  now,
  onPress,
  last,
}: {
  knowt: KnowtWithDetail;
  ink: string;
  now: Date;
  onPress: () => void;
  last: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={knowt.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowDivided,
        pressed && styles.pressed,
      ]}>
      {requiresScan(knowt.mode) ? (
        <ScanIcon size={13} color={ink} thickness={1.5} />
      ) : (
        <AlarmIcon size={13} color={theme.color.textMuted} thickness={1.5} />
      )}
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.rowName}>
        {knowt.name}
      </Text>
      <PriorityBars priority={knowt.priority} color={ink} size={10} />
      <Text style={styles.rowNext}>{nextLabel(soonestFor(knowt, now), now)}</Text>
    </Pressable>
  );
}

/**
 * A category and everything under it, opening and closing as one.
 *
 * Expanded is the default here, unlike Daily. This screen is the inventory:
 * opening it to six closed doors would hide the only thing it is for.
 */
function CategoryGroupView({
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
  const name = group.category?.name ?? 'Uncategorised';
  const count = group.knowts.length;

  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${count} knowt${count === 1 ? '' : 's'}`}
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.groupHeader, pressed && styles.pressed]}>
        <Text style={[styles.groupName, { color: shades.ink }]}>{name}</Text>
        <Text style={styles.groupCount}>{count}</Text>
        <Chevron direction={expanded ? 'up' : 'down'} />
      </Pressable>

      {expanded ? (
        // One rule down the whole group, rather than an accent per row. The
        // colour says which category these belong to once, not eight times.
        <View style={[styles.groupRows, { borderLeftColor: shades.color }]}>
          {group.knowts.map((knowt, index) => (
            <KnowtRow
              key={knowt.id}
              knowt={knowt}
              ink={shades.ink}
              now={now}
              last={index === group.knowts.length - 1}
              onPress={() => onOpenKnowt(knowt.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function AllKnowtsScreen() {
  const navigation = useNavigation<Nav>();
  const now = new Date();
  const { data: groups, loading, reload } = useQuery(
    () => listCategoryGroups(),
    [],
  );
  const { data: categories, reload: reloadCategories } = useQuery(
    () => listCategories(),
    [],
  );

  // Holds only what has been closed by hand, since open is the default.
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  // A knowt renamed or archived elsewhere must not linger here as it was.
  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadCategories();
    }, [reload, reloadCategories]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <ScreenHeader title="All knowts" />

        {/* Visible without being loud: one line, the colours as the signal. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Categories"
          onPress={() => navigation.navigate('Categories')}
          style={({ pressed }) => [styles.categoryBar, pressed && styles.pressed]}>
          <View style={styles.categoryDots}>
            {(categories ?? []).slice(0, 8).map((category) => (
              <View
                key={category.id}
                style={[
                  styles.categoryDot,
                  { backgroundColor: categoryShades(category).color },
                ]}
              />
            ))}
          </View>
          <Text style={styles.categoryLabel}>Categories</Text>
          <Text style={styles.categoryChevron}>›</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={theme.color.textSecondary} />
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
            {(groups ?? []).length === 0 ? (
              <EmptyState
                message="No knowts yet."
                actionLabel="Add a knowt"
                onAction={() => navigation.navigate('AddKnowt')}
              />
            ) : (
              (groups ?? []).map((group) => {
                const key = group.category?.id ?? 'none';
                return (
                  <CategoryGroupView
                    key={key}
                    group={group}
                    now={now}
                    expanded={!closed[key]}
                    onToggle={() =>
                      setClosed((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    onOpenKnowt={(knowtId) =>
                      navigation.navigate('KnowtDetail', { knowtId })
                    }
                  />
                );
              })
            )}
          </ScrollView>
        )}

        {/* Add now lives in the navigation bar, reachable from every screen,
            so repeating it here would be two buttons for one action. */}
        <View style={styles.footer}>
          <Button
            label="Browse Presets"
            onPress={() => navigation.navigate('BrowseSets')}
          />
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
  categoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  pressed: { opacity: 0.6 },
  categoryDots: { flexDirection: 'row', gap: 4 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryLabel: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  categoryChevron: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.lg,
    color: theme.color.textMuted,
  },
  list: { flex: 1 },
  group: { marginBottom: theme.spacing.lg },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  groupName: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  groupCount: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  groupRows: { borderLeftWidth: 2, paddingLeft: theme.spacing.md },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  rowName: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  rowNext: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  footer: { paddingTop: theme.spacing.md },
});
