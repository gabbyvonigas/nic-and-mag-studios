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

import { Chevron } from '../components/icons';
import { KnowtCard } from '../components/KnowtCard';
import { Button, EmptyState, ScreenHeader } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  listCategories,
  listCategoryGroups,
  type CategoryGroup,
} from '../db';
import { useQuery } from '../db/useQuery';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

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
}: {
  group: CategoryGroup;
  expanded: boolean;
  onToggle: () => void;
  onOpenKnowt: (id: string) => void;
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
        <View style={[styles.groupDot, { backgroundColor: shades.color }]} />
        <Text style={[styles.groupName, { color: shades.ink }]}>{name}</Text>
        <Text style={styles.groupCount}>{count}</Text>
        <Chevron direction={expanded ? 'up' : 'down'} />
      </Pressable>

      {expanded ? (
        <View style={styles.groupCards}>
          {group.knowts.map((knowt) => (
            <KnowtCard
              key={knowt.id}
              name={knowt.name}
              meta={
                knowt.schedules.length > 0
                  ? `${formatTime(knowt.schedules[0]!.time)}, ${describeRepeat(knowt.schedules[0]!)}`
                  : 'No schedule'
              }
              location={knowt.location_note}
              mode={knowt.mode}
              priority={knowt.priority}
              shades={shades}
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
  groupDot: { width: 10, height: 10, borderRadius: 5 },
  groupName: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
  },
  groupCount: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  // The separation between cards lives here, not inside them.
  groupCards: { gap: theme.spacing.md, marginTop: theme.spacing.xs },
  footer: { paddingTop: theme.spacing.md },
});
