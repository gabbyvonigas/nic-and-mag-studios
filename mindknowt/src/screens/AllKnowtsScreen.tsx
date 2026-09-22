import { useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';

import { KnowtCard } from '../components/KnowtCard';
import { Button, EmptyState, ScreenHeader } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  listCategories,
  listKnowts,
  type KnowtWithDetail,
} from '../db';
import { useQuery } from '../db/useQuery';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Group = { name: string; color: string | null; knowts: KnowtWithDetail[] };

function groupByCategory(knowts: KnowtWithDetail[]): Group[] {
  const groups = new Map<string, Group>();
  for (const knowt of knowts) {
    const name = knowt.category?.name ?? 'Uncategorised';
    const existing = groups.get(name);
    if (existing) {
      existing.knowts.push(knowt);
    } else {
      groups.set(name, {
        name,
        color: knowt.category?.color ?? null,
        knowts: [knowt],
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function AllKnowtsScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, reload } = useQuery(() => listKnowts(), []);
  const { data: categories, reload: reloadCategories } = useQuery(
    () => listCategories(),
    [],
  );

  // A knowt renamed or archived elsewhere must not linger here as it was.
  useFocusEffect(
    useCallback(() => {
      void reload();
      void reloadCategories();
    }, [reload, reloadCategories]),
  );
  const groups = groupByCategory(data ?? []);

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
            {groups.length === 0 ? (
              <EmptyState
                message="No knowts yet."
                actionLabel="Add a knowt"
                onAction={() => navigation.navigate('AddKnowt')}
              />
            ) : (
              groups.map((group) => (
                <View key={group.name} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupName}>{group.name}</Text>
                    <Text style={styles.groupCount}>{group.knowts.length}</Text>
                  </View>

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
                      shades={categoryShades(knowt.category)}
                      onPress={() =>
                        navigation.navigate('KnowtDetail', { knowtId: knowt.id })
                      }
                    />
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* Add now lives in the navigation bar, reachable from every screen,
            so repeating it here would be two buttons for one action. */}
        <Button
          label="Browse sets"
          variant="secondary"
          onPress={() => navigation.navigate('BrowseSets')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    // Clears the floating tab bar, which is drawn over the content.
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: theme.spacing.md,
  },
  list: { flex: 1 },
  group: { marginBottom: theme.spacing.lg },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  groupName: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  groupCount: {
    fontFamily: theme.font.mono,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
});
