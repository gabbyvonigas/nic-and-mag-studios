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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/ui';
import { loadMonthSummary } from '../db';
import { useQuery } from '../db/useQuery';
import type { MonthSummary } from '../history/summary';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';
import type { RootStackParamList } from '../navigation/types';
import { categoryShades, theme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function CategoryBars({ summary }: { summary: MonthSummary }) {
  return (
    <View style={styles.bars}>
      {summary.byCategory.map((tally) => {
        const shades = categoryShades(tally.category);
        const name = tally.category?.name ?? 'No category';
        return (
          <View key={tally.category?.id ?? 'none'} style={styles.barRow}>
            <View style={styles.barHead}>
              <Text style={[styles.barName, { color: shades.ink }]}>{name}</Text>
              <Text style={styles.barCount}>{tally.completions}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    // Always visible, even at a tiny share, so a category that
                    // did happen never reads as one that did not.
                    width: `${Math.max(3, tally.share * 100)}%`,
                    backgroundColor: shades.color,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function LogScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const { data, loading, reload } = useQuery(
    () => loadMonthSummary(year, month),
    [year, month],
  );

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const step = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  // Nothing has happened in the future, so there is nothing to look at there.
  const atCurrentMonth =
    year === today.getFullYear() && month === today.getMonth();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Log</Text>
        <View style={styles.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            hitSlop={12}
            onPress={() => step(-1)}>
            <Text style={styles.stepArrow}>{'‹'}</Text>
          </Pressable>
          <Text style={styles.stepLabel}>
            {MONTHS[month]} {year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            accessibilityState={{ disabled: atCurrentMonth }}
            disabled={atCurrentMonth}
            hitSlop={12}
            onPress={() => step(1)}>
            <Text style={[styles.stepArrow, atCurrentMonth && styles.stepArrowOff]}>
              {'›'}
            </Text>
          </Pressable>
        </View>
      </View>

      {loading || !data ? (
        <ActivityIndicator color={theme.color.textSecondary} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}>
          {data.completions === 0 && data.missed === 0 ? (
            <EmptyState
              message={
                atCurrentMonth
                  ? 'Nothing recorded this month yet.'
                  : 'Nothing was recorded that month.'
              }
              actionLabel={atCurrentMonth ? 'Go to today' : undefined}
              onAction={
                atCurrentMonth
                  ? () => navigation.navigate('Tabs', { screen: 'Daily' })
                  : undefined
              }
            />
          ) : (
            <>
              <View style={styles.statRow}>
                <Stat value={`${data.completions}`} label="done" />
                <Stat
                  value={data.rate === null ? 'n/a' : percent(data.rate)}
                  label="of what was due"
                />
                <Stat
                  value={`${data.activeDays}`}
                  label={`of ${data.daysElapsed || data.daysInMonth} days`}
                />
              </View>

              <Text style={styles.sectionTitle}>How they were finished</Text>
              <View style={styles.methods}>
                <Text style={styles.method}>
                  <Text style={styles.methodValue}>{data.byMethod.scan}</Text>
                  {' scanned'}
                </Text>
                <Text style={styles.method}>
                  <Text style={styles.methodValue}>{data.byMethod.tap}</Text>
                  {' tapped'}
                </Text>
                <Text style={styles.method}>
                  <Text style={styles.methodValue}>{data.byMethod.override}</Text>
                  {' overridden'}
                </Text>
              </View>
              {data.missed > 0 ? (
                <Text style={styles.missed}>
                  {data.missed} went by without being done.
                </Text>
              ) : null}

              {data.byCategory.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Where the time went</Text>
                  <CategoryBars summary={data} />
                </>
              ) : null}

              {data.streaks.length > 0 ? (
                <>
                  <Text style={styles.sectionTitle}>Streaks</Text>
                  {data.streaks.slice(0, 6).map((streak) => {
                    const shades = categoryShades(streak.category);
                    const live = streak.current >= 2;
                    return (
                      <Pressable
                        key={streak.knowtId}
                        accessibilityRole="button"
                        onPress={() =>
                          navigation.navigate('KnowtDetail', {
                            knowtId: streak.knowtId,
                          })
                        }
                        style={({ pressed }) => [
                          styles.streak,
                          pressed && styles.pressed,
                        ]}>
                        <View
                          style={[
                            styles.streakDot,
                            { backgroundColor: shades.color },
                          ]}
                        />
                        <Text style={styles.streakName}>{streak.name}</Text>
                        <Text style={[styles.streakValue, { color: shades.ink }]}>
                          {live
                            ? `${streak.current} in a row`
                            : `best ${streak.best}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Text style={styles.hint}>
                    A streak counts the days a knowt was actually due, so a
                    weekday knowt is not broken by the weekend.
                  </Text>
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.background },
  header: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    fontFamily: theme.font.face.bold,
    fontSize: theme.font.size.display,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  stepArrow: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    width: 24,
    textAlign: 'center',
  },
  stepArrowOff: { color: theme.color.textMuted },
  stepLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  content: {
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  statRow: { flexDirection: 'row', gap: theme.spacing.sm },
  stat: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: 2,
    shadowColor: '#0b1220',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  statValue: {
    fontFamily: theme.font.face.bold,
    fontSize: 28,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  sectionTitle: {
    marginTop: theme.spacing.xl,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg },
  method: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  methodValue: {
    fontFamily: theme.font.face.bold,
    color: theme.color.textPrimary,
  },
  missed: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  bars: { gap: theme.spacing.md },
  barRow: { gap: theme.spacing.xs },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  barName: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
  },
  barCount: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.surfaceMuted,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4 },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  pressed: { opacity: 0.7 },
  streakDot: { width: 8, height: 8, borderRadius: 4 },
  streakName: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  streakValue: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
  },
  hint: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
});
