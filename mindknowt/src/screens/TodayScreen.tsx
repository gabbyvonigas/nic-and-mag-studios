import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, Pill, ScreenHeader } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  listToday,
  logCompletion,
  type TodayInstance,
} from '../db';
import { useQuery } from '../db/useQuery';
import { theme } from '../theme';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function Row({
  instance,
  onOpen,
  onComplete,
}: {
  instance: TodayInstance;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const { knowt, schedule, completedAt } = instance;
  const done = completedAt !== null;

  return (
    <Pressable onPress={onOpen} style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={[styles.rowName, done && styles.rowNameDone]}>
          {knowt.name}
        </Text>
        <Text style={styles.rowMeta}>
          {formatTime(schedule.time)}
          {schedule.label ? ` · ${schedule.label}` : ''} ·{' '}
          {describeRepeat(schedule)}
        </Text>
        {knowt.location_note ? (
          <Text style={styles.rowMeta}>{knowt.location_note}</Text>
        ) : null}
      </View>

      {done ? (
        <Pill label="Done" color={theme.color.successText} />
      ) : (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onComplete}
          style={styles.doneButton}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export function TodayScreen() {
  const navigation = useNavigation<Nav>();
  const { data, loading, reload } = useQuery(() => listToday(), []);

  const complete = async (instance: TodayInstance) => {
    await logCompletion({
      knowtId: instance.knowt.id,
      scheduleId: instance.schedule.id,
      method: 'tap',
    });
    await reload();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.content}>
        <ScreenHeader title="Today" />

        {loading ? (
          <ActivityIndicator color={theme.color.textSecondary} />
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(item) => item.schedule.id}
            renderItem={({ item }) => (
              <Row
                instance={item}
                onOpen={() =>
                  navigation.navigate('KnowtDetail', { knowtId: item.knowt.id })
                }
                onComplete={() => void complete(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <EmptyState
                message="Nothing due today."
                actionLabel="Add a knowt"
                onAction={() => navigation.navigate('AddKnowt')}
              />
            }
            showsVerticalScrollIndicator={false}
          />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  rowMain: { flex: 1, gap: 2 },
  rowName: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textPrimary,
  },
  rowNameDone: { color: theme.color.textMuted },
  rowMeta: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  separator: { height: 1, backgroundColor: theme.color.surfaceMuted },
  doneButton: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  doneText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textPrimary,
  },
});
