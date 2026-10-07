import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, categoryIconName } from '../components/Icon';
import { EmptyState, SubScreenHeader } from '../components/ui';
import { listCategories } from '../db';
import type { CategoryRow } from '../db';
import { listSets, presentedCategoryKey, setIcon } from '../sets';
import type { StarterSet } from '../sets';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The preset lists, grouped under their categories.
 *
 * The header is the Knowts screen's header, down to the tinted square, the
 * uppercase label in the category's ink and the count on the right. Two screens
 * that both group by category should not look like two different products, so
 * the measurements are copied deliberately rather than approximated.
 *
 * The tile itself is white. The only color on it is the circle on the left,
 * filled with the category's color and carrying the set's own mark in white.
 * Tinting the whole tile as well turned the list into a block of color with
 * the words fighting it.
 */
export function BrowseSetsScreen() {
  const navigation = useNavigation<Nav>();
  const sets = listSets();
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => setCategories(await listCategories()))();
    }, []),
  );

  // The category order the Knowts screen uses, which is the order the rows
  // come back in. Anything whose category is not installed sorts last.
  const groups: { category: CategoryRow | null; sets: StarterSet[] }[] = [];
  const byKey = new Map<string, StarterSet[]>();
  for (const set of sets) {
    const key = presentedCategoryKey(set) ?? '';
    const bucket = byKey.get(key);
    if (bucket) bucket.push(set);
    else byKey.set(key, [set]);
  }
  for (const category of categories ?? []) {
    const mine = byKey.get(category.key ?? '');
    if (mine && mine.length > 0) groups.push({ category, sets: mine });
  }
  const placed = new Set((categories ?? []).map((c) => c.key ?? ''));
  for (const [key, mine] of byKey) {
    if (!placed.has(key)) groups.push({ category: null, sets: mine });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader
          onBack={() => navigation.goBack()}
          title="Presets"
          subtitle="Ready-made knowts you can edit after adding."
        />

        {sets.length === 0 ? (
          <EmptyState message="No starter sets are bundled yet." />
        ) : (
          groups.map(({ category, sets: inGroup }) => {
            const shades = categoryShades(category);
            return (
              <View key={category?.id ?? 'other'} style={styles.section}>
                <View style={styles.sectionHead}>
                  <View
                    style={[styles.headBadge, { backgroundColor: shades.fill }]}>
                    <Icon
                      name={categoryIconName(category?.icon)}
                      size={13}
                      color={shades.ink}
                    />
                  </View>
                  <Text style={[styles.sectionName, { color: shades.ink }]}>
                    {category?.name ?? 'Other'}
                  </Text>
                  <Text style={styles.sectionCount}>{inGroup.length}</Text>
                </View>

                {inGroup.map((set) => {
                  const count = set.knowts.length;
                  return (
                    <Pressable
                      key={set.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${set.name}, ${count} knowt${count === 1 ? '' : 's'}`}
                      onPress={() =>
                        navigation.navigate('ApplySet', { setId: set.id })
                      }
                      style={({ pressed }) => [
                        styles.tile,
                        pressed && styles.pressed,
                      ]}>
                      <View
                        style={[
                          styles.mark,
                          { backgroundColor: shades.color },
                        ]}>
                        <Icon
                          name={setIcon(set.id)}
                          size={20}
                          color="#FFFFFF"
                        />
                      </View>

                      <View style={styles.tileMain}>
                        <Text style={styles.tileName}>{set.name}</Text>
                        {/* Two full lines, and no tail. A description cut off
                            mid word tells you less than the words it dropped. */}
                        <Text style={styles.tileDescription}>
                          {set.description}
                        </Text>
                      </View>

                      <View style={styles.tileEnd}>
                        <View style={styles.countPill}>
                          <Text style={styles.countText}>{count}</Text>
                        </View>
                        <Icon
                          name="forward"
                          size={16}
                          color={theme.color.textMuted}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  content: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  section: { marginBottom: theme.spacing.lg },
  // Copied from the Knowts screen so the two read as one app.
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  headBadge: {
    width: 22,
    height: 22,
    borderRadius: 22 * 0.32,
    alignItems: 'center',
    justifyContent: 'center',
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
    ...theme.font.tabular,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
  },
  pressed: { opacity: 0.7 },
  mark: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMain: { flex: 1, gap: 2 },
  tileName: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  tileDescription: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 18,
    color: theme.color.textSecondary,
  },
  tileEnd: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  countPill: {
    minWidth: 24,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.color.surfaceMuted,
    alignItems: 'center',
  },
  countText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
    ...theme.font.tabular,
  },
});
