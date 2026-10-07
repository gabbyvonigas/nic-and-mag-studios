import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryBadge } from '../components/CategoryBadge';
import { ChevronRight } from '../components/icons';
import { EmptyState, SubScreenHeader } from '../components/ui';
import { listCategories } from '../db';
import type { CategoryRow } from '../db';
import { listSets, setCategoryKey } from '../sets';
import { categoryShades, theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The preset lists, as tiles.
 *
 * This was three lines of gray text per row, twenty eight times, which read as
 * a wall rather than a menu. A set belongs to a category, so the category is
 * what the tile is built from: its glyph on its own tint, and the count as a
 * pill. Scanning for the one you want is then a matter of color, not reading.
 *
 * The tint is the category's `fill`, the soft end of the palette. Nothing here
 * invents a color.
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

  // Keyed lookup, so each tile finds its category without a query per row.
  const byKey = new Map((categories ?? []).map((c) => [c.key ?? '', c]));

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
          sets.map((set) => {
            const key = setCategoryKey(set);
            const category = key ? (byKey.get(key) ?? null) : null;
            const shades = categoryShades(category);
            const count = set.knowts.length;

            return (
              <Pressable
                key={set.id}
                accessibilityRole="button"
                accessibilityLabel={`${set.name}, ${count} knowt${count === 1 ? '' : 's'}`}
                onPress={() => navigation.navigate('ApplySet', { setId: set.id })}
                style={({ pressed }) => [
                  styles.tile,
                  { backgroundColor: shades.fill },
                  pressed && styles.pressed,
                ]}>
                <CategoryBadge categoryKey={key} shades={shades} size={42} />

                <View style={styles.tileMain}>
                  <Text style={styles.tileName}>{set.name}</Text>
                  <Text style={styles.tileDescription} numberOfLines={2}>
                    {set.description}
                  </Text>
                </View>

                <View style={styles.tileEnd}>
                  <View style={[styles.countPill, { borderColor: shades.ink }]}>
                    <Text style={[styles.countText, { color: shades.ink }]}>
                      {count}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={shades.ink} />
                </View>
              </Pressable>
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
    gap: theme.spacing.sm,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  pressed: { opacity: 0.7 },
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
  // Outlined rather than filled: the tile is already tinted, and a second
  // filled shape on top of it turns the row into a traffic light.
  countPill: {
    minWidth: 26,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
  countText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xs,
    ...theme.font.tabular,
  },
});
