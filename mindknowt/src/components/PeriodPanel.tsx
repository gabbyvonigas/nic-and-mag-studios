import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Insight } from '../history/insights';
import type { PeriodKind, PeriodSummary } from '../history/period';
import { theme } from '../theme';

/**
 * The top of the Log: what got done over the chosen span, and the one line the
 * app has earned the right to say about it.
 *
 * A dip in the trend is data. Nothing here marks a low bar as a failure, gives
 * it a different color, or counts a run of them.
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

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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
    <View style={styles.trend}>
      {summary.trend.map((bucket, index) => (
        <View key={`${bucket.label}:${index}`} style={styles.trendCell}>
          <View style={styles.trendTrack}>
            <View
              style={[
                styles.trendBar,
                {
                  height: `${Math.max(6, (bucket.completions / peak) * 100)}%`,
                  backgroundColor: bucket.current
                    ? theme.color.highlight
                    : theme.color.border,
                },
              ]}
            />
          </View>
          <Text style={styles.trendLabel}>
            {sparse && index % 5 !== 0 ? ' ' : bucket.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function PeriodPanel({
  summary,
  insight,
  onAdjustTime,
}: {
  summary: PeriodSummary;
  insight: Insight | null;
  onAdjustTime: (knowtId: string) => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.metrics}>
        <Metric value={`${summary.completions}`} label="completed" />
        <Metric
          value={summary.rate === null ? '-' : `${Math.round(summary.rate * 100)}%`}
          label="of what came up"
        />
        <Metric value={`${summary.overrides}`} label="overridden" />
      </View>

      <Trend summary={summary} />

      {summary.byCategory.length > 0 ? (
        <View style={styles.categories}>
          <Text style={styles.sectionLabel}>By category</Text>
          {summary.byCategory.map((tally) => (
            <View key={tally.categoryId ?? 'none'} style={styles.catRow}>
              <View style={[styles.catDot, { backgroundColor: tally.color }]} />
              <Text numberOfLines={1} style={styles.catName}>
                {tally.name}
              </Text>
              <View style={styles.catTrack}>
                <View
                  style={[
                    styles.catFill,
                    {
                      width: `${
                        (tally.completions /
                          Math.max(
                            1,
                            summary.byCategory[0]?.completions ?? 1,
                          )) * 100
                      }%`,
                      backgroundColor: tally.color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.catCount}>{tally.completions}</Text>
            </View>
          ))}
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

const styles = StyleSheet.create({
  panel: { gap: theme.spacing.lg },
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

  metrics: { flexDirection: 'row', gap: theme.spacing.lg },
  metric: { flex: 1, gap: 2 },
  metricValue: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.display,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  metricLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },

  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 88 },
  trendCell: { flex: 1, alignItems: 'center', gap: 4 },
  trendTrack: { height: 64, width: '100%', justifyContent: 'flex-end' },
  trendBar: { width: '100%', borderRadius: 3, minHeight: 3 },
  trendLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },

  categories: { gap: theme.spacing.sm },
  sectionLabel: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: {
    width: 88,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  catTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.border,
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

  insight: { gap: 2 },
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
