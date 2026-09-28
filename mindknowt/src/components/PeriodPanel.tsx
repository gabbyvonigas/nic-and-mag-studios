import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from './CategoryIcon';
import type { Insight } from '../history/insights';
import type {
  PeriodKind,
  PeriodDelta,
  PeriodSummary,
  SparkMetric,
} from '../history/period';
import { sparkFor } from '../history/period';
import { durationLabel, hourRange } from '../history/periodLabels';
import { shadesFromHex, theme } from '../theme';

/**
 * The top of the Log: what got done over the chosen span, and the one line the
 * app has earned the right to say about it.
 *
 * A dip in the trend is data. Nothing here marks a low bar as a failure, gives
 * it a different color, or counts a run of them. The change indicators are the
 * place that rule is easiest to break, so they use one muted color whichever
 * way they point.
 */

export function PeriodToggle({
  value,
  onChange,
}: {
  value: PeriodKind;
  onChange: (kind: PeriodKind) => void;
}) {
  const options: { key: PeriodKind; label: string }[] = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ];

  return (
    <View style={styles.toggle}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            style={[styles.toggleCell, active && styles.toggleCellOn]}>
            <Text style={[styles.toggleText, active && styles.toggleTextOn]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A sparkline, as very thin bars.
 *
 * Bars rather than a line for the same reason the ring is built from views:
 * `react-native-svg` is not in this project, and a polyline made of rotated
 * segments at this size is a pile of geometry to maintain for something read at
 * a glance. Every bar keeps a foot so the line has a baseline to sit on.
 */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  // A month is 31 bars in a tile a third of the screen wide, which is thinner
  // than the gap between them. Sampling keeps the shape and drops the mush.
  const points =
    values.length > 16
      ? values.filter((_, index) => index % Math.ceil(values.length / 16) === 0)
      : values;

  return (
    <View style={styles.spark}>
      {points.map((value, index) => (
        <View
          key={index}
          style={[
            styles.sparkBar,
            {
              height: Math.max(2, Math.round(value * SPARK_HEIGHT)),
              backgroundColor: color,
            },
          ]}
        />
      ))}
    </View>
  );
}

/** The percent change against the period before, or nothing to compare to. */
function Change({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return <Text style={styles.changeFlat}>No period before this</Text>;
  }
  if (Math.round(value * 100) === 0) {
    return <Text style={styles.changeFlat}>Level</Text>;
  }

  const up = value > 0;
  return (
    <Text style={styles.change}>
      {up ? '↑' : '↓'}
      {Math.abs(Math.round(value * 100))}%
    </Text>
  );
}

function StatTile({
  value,
  label,
  tint,
  change,
  spark,
}: {
  value: string;
  label: string;
  tint: string;
  change: number | null;
  spark: number[];
}) {
  return (
    <View style={[styles.tile, { backgroundColor: tint }]}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      <View style={styles.tileFoot}>
        <Change value={change} />
        <Sparkline values={spark} color={theme.color.textPrimary} />
      </View>
    </View>
  );
}

/**
 * The trend, as bars.
 *
 * Every bar keeps a visible foot even at zero, so an empty day reads as a day
 * with nothing on it rather than as a gap in the chart.
 */
function Trend({ summary }: { summary: PeriodSummary }) {
  const peak = Math.max(1, ...summary.trend.map((bucket) => bucket.completions));
  // A month of bars is too many to label one by one.
  const sparse = summary.trend.length > 14;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Completed</Text>
      <View style={styles.trend}>
        {summary.trend.map((bucket, index) => (
          <View key={`${bucket.label}:${index}`} style={styles.trendCell}>
            <View style={styles.trendTrack}>
              <View
                style={[
                  styles.trendBar,
                  {
                    height: `${Math.max(4, (bucket.completions / peak) * 100)}%`,
                    // Lime throughout, with today darker rather than a
                    // different color, so the accent is the chart and not a
                    // judgment about which day was good.
                    backgroundColor: bucket.current
                      ? theme.color.primary
                      : theme.color.highlight,
                  },
                ]}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.trendLabel, bucket.current && styles.trendLabelOn]}>
              {sparse && index % 5 !== 0 ? ' ' : bucket.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FactCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <View style={[styles.card, styles.factCard]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factNote}>{note}</Text>
    </View>
  );
}

export function PeriodPanel({
  summary,
  previous,
  insight,
  onAdjustTime,
}: {
  summary: PeriodSummary;
  /** The period before this one. Null while it is still loading. */
  previous: PeriodDelta | null;
  insight: Insight | null;
  onAdjustTime: (knowtId: string) => void;
}) {
  const spark = (metric: SparkMetric) => sparkFor(summary, metric);
  const top = summary.byCategory[0]?.completions ?? 1;

  return (
    <View style={styles.panel}>
      <View style={styles.tiles}>
        <StatTile
          value={`${summary.completions}`}
          label="completed"
          tint={theme.color.tileMint}
          change={previous?.completions ?? null}
          spark={spark('completions')}
        />
        <StatTile
          value={
            summary.rate === null ? '-' : `${Math.round(summary.rate * 100)}%`
          }
          label="of what came up"
          tint={theme.color.tileLavender}
          change={previous?.rate ?? null}
          spark={spark('rate')}
        />
        <StatTile
          value={`${summary.overrides}`}
          label="overridden"
          tint={theme.color.tilePeach}
          change={previous?.overrides ?? null}
          spark={spark('overrides')}
        />
      </View>

      <Trend summary={summary} />

      <View style={styles.facts}>
        <FactCard
          title="Peak time"
          value={summary.peakHour === null ? '-' : hourRange(summary.peakHour)}
          note={
            summary.peakHour === null
              ? 'Nothing finished yet'
              : 'When most things get done'
          }
        />
        <FactCard
          title="Average time to complete"
          value={
            summary.averageMinutes === null
              ? '-'
              : durationLabel(summary.averageMinutes)
          }
          note={
            summary.averageMinutes === null
              ? 'Nothing has rung yet'
              : 'From ringing to done'
          }
        />
      </View>

      {summary.byCategory.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>By category</Text>
          {summary.byCategory.map((tally) => {
            const shades = shadesFromHex(tally.color);
            return (
              <View key={tally.categoryId ?? 'none'} style={styles.catRow}>
                <CategoryIcon icon={tally.icon} shades={shades} size={26} />
                <Text numberOfLines={1} style={styles.catName}>
                  {tally.name}
                </Text>
                <View style={styles.catTrack}>
                  <View
                    style={[
                      styles.catFill,
                      {
                        width: `${Math.max(4, (tally.completions / Math.max(1, top)) * 100)}%`,
                        backgroundColor: tally.color,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.catCount}>{tally.completions}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* One line, no card, no border. It is an observation, not a statistic,
          and giving it a tile would make it compete with the numbers above. */}
      {insight ? (
        <View style={styles.insight}>
          <Text style={styles.insightText}>{insight.text}</Text>
          {insight.action ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Adjust the time for ${insight.action.knowtName}`}
              onPress={() => onAdjustTime(insight.action!.knowtId)}>
              <Text style={styles.insightAction}>Adjust time</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const SPARK_HEIGHT = 16;

const styles = StyleSheet.create({
  panel: { gap: theme.spacing.md },
  toggle: {
    flexDirection: 'row',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.pill,
    padding: 3,
  },
  toggleCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
  },
  toggleCellOn: { backgroundColor: theme.color.highlight },
  toggleText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  toggleTextOn: { color: theme.color.onHighlight },

  tiles: { flexDirection: 'row', gap: theme.spacing.sm },
  tile: {
    flex: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: 1,
  },
  tileValue: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xl,
    color: theme.color.textPrimary,
    letterSpacing: -0.4,
  },
  tileLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    lineHeight: 15,
    color: theme.color.textSecondary,
  },
  tileFoot: { marginTop: theme.spacing.sm, gap: 4 },
  change: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
  changeFlat: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  spark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    height: SPARK_HEIGHT,
  },
  sparkBar: { flex: 1, borderRadius: 1, opacity: 0.45 },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  cardTitle: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 92 },
  trendCell: { flex: 1, alignItems: 'center', gap: 5 },
  trendTrack: { height: 66, width: '100%', justifyContent: 'flex-end' },
  trendBar: { width: '100%', borderRadius: 4, minHeight: 3 },
  trendLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  trendLabelOn: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
  },

  facts: { flexDirection: 'row', gap: theme.spacing.sm },
  factCard: { flex: 1, gap: theme.spacing.xs },
  factValue: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  factNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    lineHeight: 15,
    color: theme.color.textMuted,
  },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  catName: {
    width: 78,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  catTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.surfaceMuted,
    overflow: 'hidden',
  },
  catFill: { height: 6, borderRadius: 3 },
  catCount: {
    minWidth: 20,
    textAlign: 'right',
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },

  insight: { gap: 2, paddingHorizontal: theme.spacing.xs },
  insightText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    lineHeight: 22,
    color: theme.color.textSecondary,
  },
  insightAction: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
});
