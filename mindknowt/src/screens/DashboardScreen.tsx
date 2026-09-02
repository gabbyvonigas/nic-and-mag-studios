import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '../components/ui';
import {
  describeRepeat,
  formatTime,
  listDashboard,
  logCompletion,
  type DashboardCard,
} from '../db';
import { useQuery } from '../db/useQuery';
import { TAB_BAR_CLEARANCE } from '../navigation/CapsuleTabBar';
import type { RootStackParamList } from '../navigation/types';
import { categoryShades, theme, type CategoryShades } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function formatClock(at: number): string {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  const suffix = hours < 12 ? 'am' : 'pm';
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${minutes} ${suffix}`;
}

function todayLabel(now: Date): string {
  const days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const months = [
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
  return `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}`;
}

/**
 * The line that answers "what is this thing waiting on". A snooze or a re-fire
 * is the important case: before this existed there was no way to tell a knowt
 * that had been put off from one that had never rung.
 */
function statusOf(card: DashboardCard): string | null {
  if (card.completedAt) return `Done at ${formatClock(card.completedAt)}`;
  if (!card.pending) return null;

  switch (card.pending.kind) {
    case 'snooze':
      return `Snoozed until ${formatClock(card.pending.fires_at)}`;
    case 'refire':
      return `Rings again at ${formatClock(card.pending.fires_at)}`;
    case 'test':
      return `Test alarm at ${formatClock(card.pending.fires_at)}`;
    case 'scheduled':
      // The card already shows the schedule time, so repeating it is noise.
      return null;
    default:
      return null;
  }
}

function KnowtCard({
  card,
  shades,
  onOpen,
  onComplete,
}: {
  card: DashboardCard;
  shades: CategoryShades;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const { knowt, schedule } = card;
  const done = card.completedAt !== null;
  const status = statusOf(card);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${knowt.name}${done ? ', done' : ''}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.card,
        done && { backgroundColor: shades.fill },
        pressed && styles.cardPressed,
      ]}>
      <View
        style={[
          styles.accent,
          { backgroundColor: done ? shades.ink : shades.color },
        ]}
      />

      <View style={styles.cardBody}>
        <Text style={[styles.cardName, done && styles.cardNameDone]}>
          {knowt.name}
        </Text>

        <Text style={styles.cardMeta}>
          {schedule
            ? `${formatTime(schedule.time)}${
                schedule.label ? `, ${schedule.label}` : ''
              }, ${describeRepeat(schedule)}`
            : 'Any time today'}
        </Text>

        {knowt.location_note ? (
          <Text style={styles.cardMeta}>{knowt.location_note}</Text>
        ) : null}

        {status ? (
          <Text style={[styles.cardStatus, { color: shades.ink }]}>{status}</Text>
        ) : null}
      </View>

      {done ? (
        // Not colour alone: the word carries the state for anyone who cannot
        // see the tint.
        <View style={[styles.doneTag, { backgroundColor: shades.color }]}>
          <Text style={styles.doneTagText}>Done</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mark ${knowt.name} done`}
          hitSlop={8}
          onPress={onComplete}
          style={({ pressed }) => [styles.doneButton, pressed && styles.cardPressed]}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

export function DashboardScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { data, loading, reload } = useQuery(() => listDashboard(), []);

  const complete = async (card: DashboardCard) => {
    await logCompletion({
      knowtId: card.knowt.id,
      scheduleId: card.schedule?.id ?? null,
      method: 'tap',
    });
    await reload();
  };

  const sections = (data?.sections ?? []).map((section) => ({
    category: section.category,
    shades: categoryShades(section.category?.key),
    title: section.category?.name ?? 'Everything else',
    data: section.cards,
  }));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily</Text>
        <Text style={styles.date}>{todayLabel(new Date())}</Text>
        {data && data.total > 0 ? (
          <Text style={styles.progress}>
            {data.done} of {data.total} done
          </Text>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.textSecondary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(card) =>
            `${card.knowt.id}:${card.schedule?.id ?? 'untimed'}`
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <View
                style={[styles.sectionDot, { backgroundColor: section.shades.color }]}
              />
              <Text style={[styles.sectionTitle, { color: section.shades.ink }]}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item, section }) => (
            <KnowtCard
              card={item}
              shades={section.shades}
              onOpen={() =>
                navigation.navigate('KnowtDetail', { knowtId: item.knowt.id })
              }
              onComplete={() => void complete(item)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: TAB_BAR_CLEARANCE + insets.bottom },
          ]}
          ListEmptyComponent={
            <EmptyState
              message="Nothing due today."
              actionLabel="Add a knowt"
              onAction={() => navigation.navigate('AddKnowt')}
            />
          }
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />
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
    gap: 2,
  },
  title: {
    fontFamily: theme.font.face.bold,
    fontSize: theme.font.size.display,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  date: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  progress: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  listContent: {
    paddingHorizontal: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  sectionDot: { width: 8, height: 8, borderRadius: 4 },
  sectionTitle: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.lg,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.lg,
    shadowColor: '#0b1220',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  cardPressed: { opacity: 0.7 },
  accent: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  cardBody: { flex: 1, gap: 3 },
  cardName: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  cardNameDone: {
    fontFamily: theme.font.face.regular,
    color: theme.color.textSecondary,
  },
  cardMeta: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  cardStatus: {
    marginTop: 2,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
  },
  doneButton: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  doneButtonText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  doneTag: {
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  doneTagText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.onAccent,
  },
});
