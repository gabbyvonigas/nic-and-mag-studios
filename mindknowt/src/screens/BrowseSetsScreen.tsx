import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, categoryIconName } from '../components/Icon';
import { EmptyState, SubScreenHeader } from '../components/ui';
import { listCategories } from '../db';
import type { CategoryRow } from '../db';
import { groupSetsByCategory, listSets, setIcon } from '../sets';
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

  // Grouped in `sets/presentation.ts`, which also decides the React key. The
  // screen inventing one is how seven groups ended up sharing `other` on the
  // first render, before the categories had loaded.
  const groups = groupSetsByCategory(sets, categories ?? []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SubScreenHeader
          onBack={() => navigation.goBack()}
          title="Presets"
          subtitle="Ready-made Knowts you can edit after adding."
        />

        {sets.length === 0 ? (
          <EmptyState message="No starter sets are bundled yet." />
        ) : (
          groups.map(({ category, key: groupKey, sets: inGroup }) => {
            const shades = categoryShades(category);
            return (
              <View key={groupKey} style={styles.section}>
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
                      accessibilityLabel={`${set.name}, ${count} Knowt${count === 1 ? '' : 's'}`}
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
                        <View style={styles.tileTop}>
                          <Text style={styles.tileName}>{set.name}</Text>
                          <View style={styles.countPill}>
                            <Text style={styles.countText}>{count}</Text>
                          </View>
                          <Icon
                            name="forward"
                            size={16}
                            color={theme.color.textMuted}
                          />
                        </View>
                        {/* Full width under the top row rather than squeezed
                            between the mark and the pill. In the narrow column
                            a description of seventy characters ran to three
                            lines, and there is no tail to cut: a description
                            trimmed mid word tells you less than the words it
                            dropped. */}
                        <Text style={styles.tileDescription}>
                          {set.description}
                        </Text>
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
    alignItems: 'flex-start',
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
  tileMain: { flex: 1, gap: 3 },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tileName: {
    flex: 1,
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
