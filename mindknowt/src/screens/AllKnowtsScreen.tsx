import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, Pill, ScreenHeader } from '../components/ui';
import { listKnowts, type KnowtWithDetail } from '../db';
import { useQuery } from '../db/useQuery';
import { theme } from '../theme';
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
  const { data, loading } = useQuery(() => listKnowts(), []);
  const groups = groupByCategory(data ?? []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <ScreenHeader title="All knowts" />

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
                    <Pressable
                      key={knowt.id}
                      onPress={() =>
                        navigation.navigate('KnowtDetail', { knowtId: knowt.id })
                      }
                      style={styles.row}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowName}>{knowt.name}</Text>
                        {knowt.location_note ? (
                          <Text style={styles.rowMeta}>{knowt.location_note}</Text>
                        ) : null}
                      </View>
                      <Pill
                        label={knowt.mode}
                        color={group.color ?? undefined}
                      />
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        )}

        <Button label="Add a knowt" onPress={() => navigation.navigate('AddKnowt')} />
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
    paddingBottom: theme.spacing.lg,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.color.surfaceMuted,
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  rowMeta: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
});
