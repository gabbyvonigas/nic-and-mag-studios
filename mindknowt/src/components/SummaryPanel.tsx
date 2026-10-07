import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MonthSummary } from '../history/summary';
import { categoryShades, METHOD_COLORS, theme } from '../theme';

/**
 * The month in numbers, on the home screen.
 *
 * Everything here is derived from event rows the app already writes. The one
 * figure worth watching is the split between scanned, tapped and overridden:
 * it says whether the tag is doing its job, or whether the override has
 * quietly become the way the app is used.
 */


/**
 * When someone usually gets to a thing, said as a habit rather than a speed.
 *
 * This used to be a number of minutes under the words "typical time to
 * answer", which reads as a stopwatch and invites treating a slow day as a bad
 * one. The figure is about follow-through, not reaction time, so it is a
 * phrase rather than a measurement. The buckets are wide on purpose: the
 * difference between nine minutes and fourteen is not a thing worth knowing.
 */
function whenYouGetToIt(minutes: number): string {
  if (minutes < 1) return 'Right away';
  if (minutes < 15) return 'Within minutes';
  if (minutes < 60) return 'Within the hour';
  if (minutes < 360) return 'Later that day';
  return 'When you got to it';
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function Tile({
  value,
  label,
  tint,
}: {
  value: string;
  label: string;
  tint: string;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: `${tint}14` }]}>
      <Text style={[styles.tileValue, { color: tint }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/** One bar, segmented by proportion. Segments below a sliver still show. */
function StackedBar({
  parts,
}: {
  parts: { key: string; value: number; color: string }[];
}) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (total === 0) return null;

  return (
    <View style={styles.bar}>
      {parts
        .filter((part) => part.value > 0)
        .map((part) => (
          <View
            key={part.key}
            style={{
              // A minimum width, so a single override in a busy month is
              // visible rather than rounding away to nothing.
              flexGrow: Math.max(part.value / total, 0.04),
              backgroundColor: part.color,
            }}
          />
        ))}
    </View>
  );
}

function Key({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.keyItem}>
      <View style={[styles.keyDot, { backgroundColor: color }]} />
      <Text style={styles.keyValue}>{value}</Text>
      <Text style={styles.keyLabel}>{label}</Text>
    </View>
  );
}

/**
 * One of the two gap cards.
 *
 * Reads as a sentence rather than a statistic: "2 knowts without schedules".
 * Each line is held to one, because two of these sit side by side at phone
 * width and a wrapped label makes the pair different heights.
 */
function GapCard({
  count,
  noun,
  onPress,
}: {
  count: number;
  noun: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${count} Knowt${count === 1 ? '' : 's'} without ${noun}`}
      onPress={onPress}
      style={({ pressed }) => [styles.gap, pressed && styles.gapPressed]}>
      <Text style={styles.gapCount}>{count}</Text>
      <Text numberOfLines={1} style={styles.gapLabel}>
        knowt{count === 1 ? '' : 's'} without
      </Text>
      <Text numberOfLines={1} style={styles.gapLabel}>
        {noun}
      </Text>
    </Pressable>
  );
}

export function SummaryPanel({
  summary,
  gaps,
}: {
  summary: MonthSummary;
  /** The two gap cards. Omitted where the panel is not the Log. */
  gaps?: {
    withoutTag: number;
    withoutSchedule: number;
    onOpenUntagged: () => void;
    onOpenUnscheduled: () => void;
  };
}) {
  const { byMethod } = summary;
  const anyMethod = byMethod.scan + byMethod.tap + byMethod.override > 0;

  if (summary.completions === 0 && summary.missed === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Nothing recorded this month yet. It fills in as you go.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.tiles}>
        <Tile
          value={`${summary.completions}`}
          label="done this month"
          tint={METHOD_COLORS.scan}
        />
        <Tile
          value={summary.rate === null ? 'n/a' : percent(summary.rate)}
          label="of what was due"
          tint={METHOD_COLORS.tap}
        />
        <Tile
          value={`${summary.activeDays}`}
          label={`of ${summary.daysElapsed || summary.daysInMonth} days`}
          tint={METHOD_COLORS.override}
        />
      </View>

      {anyMethod ? (
        <>
          <StackedBar
            parts={[
              { key: 'scan', value: byMethod.scan, color: METHOD_COLORS.scan },
              { key: 'tap', value: byMethod.tap, color: METHOD_COLORS.tap },
              {
                key: 'override',
                value: byMethod.override,
                color: METHOD_COLORS.override,
              },
            ]}
          />
          <View style={styles.keyRow}>
            <Key color={METHOD_COLORS.scan} label="scanned" value={byMethod.scan} />
            <Key color={METHOD_COLORS.tap} label="tapped" value={byMethod.tap} />
            <Key
              color={METHOD_COLORS.override}
              label="overridden"
              value={byMethod.override}
            />
          </View>
        </>
      ) : null}

      {/* The by-category breakdown lives once, in the period panel above,
          where it carries the icon badges. Two lists of the same numbers on one
          screen made the second one read as a different measure. */}

      {/* The two gaps, side by side. A tag is what makes a knowt scannable
          and a schedule is what makes it ring, so a knowt missing either is
          the one thing on this screen worth acting on. Lime because it is an
          invitation rather than a scold, and each card opens the list already
          narrowed to what it counted, so the number is a way in rather than a
          fact to read. */}
      {gaps ? (
        <View style={styles.gapRow}>
          <GapCard
            count={gaps.withoutTag}
            noun="a tag attached"
            onPress={gaps.onOpenUntagged}
          />
          <GapCard
            count={gaps.withoutSchedule}
            noun="schedules"
            onPress={gaps.onOpenUnscheduled}
          />
        </View>
      ) : null}

      {summary.medianResponseMinutes !== null || summary.snoozes > 0 ? (
        <>
          <Text style={styles.listTitle}>Follow-through</Text>
          <View style={styles.pairRow}>
          {summary.medianResponseMinutes !== null ? (
            <View style={styles.pair}>
              <Text style={styles.pairValue}>
                {whenYouGetToIt(summary.medianResponseMinutes)}
              </Text>
              <Text style={styles.pairLabel}>when you usually get to it</Text>
            </View>
          ) : null}
          {summary.snoozes > 0 ? (
            <View style={styles.pair}>
              <Text style={styles.pairValue}>{summary.snoozes}</Text>
              <Text style={styles.pairLabel}>
                time{summary.snoozes === 1 ? '' : 's'} put off
              </Text>
            </View>
          ) : null}
          </View>
        </>
      ) : null}

      {/* The weekday chart that was here is now the Completion trend card
          in the period panel above, Monday first. Two charts of the same
          seven numbers on one screen made the second one read as a
          different measure. `byWeekday` is still on the summary; nothing
          else needs it drawn twice. */}

      {summary.mostSnoozed.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.listTitle}>Put off most</Text>
          {summary.mostSnoozed.slice(0, 3).map((entry) => (
            <View key={entry.knowtId} style={styles.listRow}>
              <View
                style={[
                  styles.listDot,
                  { backgroundColor: categoryShades(entry.category).color },
                ]}
              />
              <Text numberOfLines={1} style={styles.listName}>
                {entry.name}
              </Text>
              <Text style={styles.listValue}>
                {entry.snoozes} snooze{entry.snoozes === 1 ? '' : 's'}
              </Text>
            </View>
          ))}
          <Text style={styles.listHint}>
            Something snoozed every day is usually set at the wrong time.
          </Text>
        </View>
      ) : null}


      {summary.missed > 0 ? (
        <Text style={styles.missed}>
          {summary.missed} went by without being done.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gapRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  gap: {
    flex: 1,
    backgroundColor: theme.color.highlight,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  gapPressed: { opacity: 0.85 },
  gapCount: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.display,
    color: theme.color.onHighlight,
  },
  gapLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 18,
    color: theme.color.onHighlight,
  },
  panel: { gap: theme.spacing.md },
  empty: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  emptyText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  tiles: { flexDirection: 'row', gap: theme.spacing.sm },
  tile: {
    flex: 1,
    borderRadius: theme.radius.xl,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    gap: 2,
  },
  tileValue: {
    fontFamily: theme.font.face.bold,
    fontSize: 26,
    letterSpacing: -0.5,
  },
  tileLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  bar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: theme.color.surfaceMuted,
  },
  keyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  keyDot: { width: 8, height: 8, borderRadius: 4 },
  keyValue: {
    fontFamily: theme.font.face.bold,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  keyLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  pairRow: { flexDirection: 'row', gap: theme.spacing.xl },
  pair: { gap: 2 },
  pairValue: {
    fontFamily: theme.font.face.bold,
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
  },
  pairLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  list: { gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  listTitle: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  listDot: { width: 8, height: 8, borderRadius: 4 },
  listName: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  listValue: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  listHint: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  missed: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
});
