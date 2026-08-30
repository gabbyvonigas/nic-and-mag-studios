import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ScreenHeader } from '../components/ui';
import { listSets } from '../sets';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function BrowseSetsScreen() {
  const navigation = useNavigation<Nav>();
  const sets = listSets();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Starter sets"
          subtitle="Ready-made knowts you can edit after adding."
        />

        {sets.length === 0 ? (
          <EmptyState message="No starter sets are bundled yet." />
        ) : (
          sets.map((set) => (
            <Pressable
              key={set.id}
              accessibilityRole="button"
              onPress={() => navigation.navigate('ApplySet', { setId: set.id })}
              style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{set.name}</Text>
                <Text style={styles.rowDescription}>{set.description}</Text>
                <Text style={styles.rowCount}>
                  {set.knowts.length} knowt{set.knowts.length === 1 ? '' : 's'}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.color.border,
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textPrimary,
  },
  rowDescription: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  rowCount: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  chevron: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xl,
    color: theme.color.textMuted,
  },
});
