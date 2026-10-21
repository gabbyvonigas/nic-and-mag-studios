import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from './CategoryIcon';
import { Icon, type IconName } from './Icon';
import type { Insight } from '../history/insights';
import type {
  PeriodKind,
  PeriodDelta,
  PeriodSummary,
  SparkMetric,
} from '../history/period';
import { sparkFor } from '../history/period';
import { trendTone } from '../history/trendTone';
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
 * A sparkline, as bars.
 *
 * Bars rather than a line because `react-native-svg` is not in this project,
 * and a polyline made of rotated segments at this size is a pile of geometry
 * to maintain for something read at a glance.
 *
 * Deliberately plain: square ends, equal widths, one flat color, every bar
 * keeping a foot so the series has a baseline. Rounded caps and a fade made it
 * read as a drawing of a chart rather than as a chart.
 */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  // A month is 31 bars in a tile a third of the screen wide, thinner than the
  // gaps between them. Sampling keeps the shape and drops the mush.
  const points =
    values.length > SPARK_BARS
      ? values.filter(
          (_, index) => index % Math.ceil(values.length / SPARK_BARS) === 0,
        )
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

/**
 * The change against the period before, or nothing at all.
 *
 * Null is drawn as null. There is no placeholder, because a tile that says
 * "No period before this" is a debug string that reached the screen, and the
 * honest rendering of "nothing to compare against" is an empty space.
 *
 * One color in both directions on purpose. A red down arrow grades the number
 * it sits under, and a quiet month is data.
 */
function Change({ value, color }: { value: number | null; color: string }) {
  if (value === null || !Number.isFinite(value)) return null;

  const percent = Math.round(value * 100);
  if (percent === 0) {
    return <Text style={[styles.change, { color }]}>0%</Text>;
  }

  return (
    <Text style={[styles.change, { color }]}>
      {percent > 0 ? '\u2191' : '\u2193'}
      {Math.abs(percent)}%
    </Text>
  );
}

function StatTile({
  value,
  label,
  tint,
  ink,
  change,
  spark,
}: {
  value: string;
  label: string;
  tint: string;
  ink: string;
  change: number | null;
  spark: number[];
}) {
  return (
    <View style={[styles.tile, { backgroundColor: tint }]}>
      <Text style={[styles.tileValue, { color: ink }]}>{value}</Text>
      <Text numberOfLines={1} style={styles.tileLabel}>
        {label}
      </Text>
      {/* Change at the left, sparkline at the right, on one line, as the
          reference has it. */}
      <View style={styles.tileFoot}>
        <Change value={change} color={ink} />
        <View style={styles.tileSpark}>
          <Sparkline values={spark} color={ink} />
        </View>
      </View>
    </View>
  );
}

/**
 * The Completed chart.
 *
 * For a week or a month this is `byWeekday`: seven bars, Monday first. It used
 * to be one bar per day of the month labeled with the date, which at a month's
 * width rendered as "1 6 1. 1. 2", thirty-one bars too thin to read with five
 * numbers clipped in half. A day is the one period where a weekday axis says
 * nothing, since a day has exactly one, so that keeps its four hour blocks.
 *
 * Every bar keeps a visible foot even at zero, so a quiet day reads as a day
 * with nothing on it rather than as a gap in the chart.
 */
function Trend({ summary }: { summary: PeriodSummary }) {
  const bars = summary.range.kind === 'day' ? summary.trend : summary.byWeekday;
  const peak = Math.max(1, ...bars.map((bucket) => bucket.completions));

  return (
    <View style={styles.card}>
      <Text numberOfLines={1} style={styles.cardTitle}>
        Completion trend
      </Text>
      <View style={styles.trend}>
        {bars.map((bucket, index) => (
          <View key={`${bucket.label}:${index}`} style={styles.trendCell}>
            <View style={styles.trendTrack}>
              <View
                style={[
                  styles.trendBar,
                  {
                    height: `${Math.max(4, (bucket.completions / peak) * 100)}%`,
                    // Color marks which day is today and nothing else. The
                    // height already says how much got done, and coloring the
                    // tallest bar would turn the chart into a scoreboard.
                    backgroundColor:
                      trendTone(bucket) === 'today'
                        ? theme.color.highlight
                        : theme.color.graphMuted,
                  },
                ]}
              />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.trendLabel, bucket.current && styles.trendLabelOn]}>
              {bucket.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FactCard({
  icon,
  title,
  value,
  tint,
  note,
}: {
  /** The mark in the lime badge, which says which reading this is. */
  icon: IconName;
  title: string;
  value: string;
  /** The value's color, matching the tile above that counts the same thing. */
  tint: string;
  note: string;
}) {
  return (
    <View style={[styles.card, styles.factCard]}>
      <View style={styles.factHead}>
        <View style={styles.factBadge}>
          <Icon name={icon} size={16} color={theme.color.textPrimary} />
        </View>
        {/* Two lines of room, reserved whether or not it takes them. "Avg
            complete time" is seventeen characters of uppercase and the badge
            took 34 points off the line it used to have to itself, so it wraps
            on a 375pt screen and "Peak time" does not. Without the fixed
            height the two values would start at different heights and the
            pair would read as misaligned. */}
        <Text
          style={[styles.cardTitle, styles.factTitle]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}>
          {title}
        </Text>
      </View>
      {/* Two lines, and shrinking before either clipping or a third. At 27pt
          every one of these values is wider than half a 375pt screen, so they
          all wrap; the fixed height keeps the notes under them level. Dynamic
          Type at its largest shrinks this rather than cutting it off, which is
          what "Under a minute" needs. */}
      <Text
        style={[styles.factValue, { color: tint }]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.7}>
        {value}
      </Text>
      <Text style={styles.factNote}>{note}</Text>
    </View>
  );
}

export function PeriodPanel({
  summary,
  previous,
  insight,
  onAdjustTime,
  onOpenCategory,
}: {
  summary: PeriodSummary;
  /** The period before this one. Null while it is still loading. */
  previous: PeriodDelta | null;
  insight: Insight | null;
  onAdjustTime: (knowtId: string) => void;
  /** Opens Knowts filtered to that category, so the chevron leads somewhere. */
  onOpenCategory: (categoryId: string) => void;
}) {
  const spark = (metric: SparkMetric) => sparkFor(summary, metric);
  // The uncategorized tally is kept in the data and left off the list. It has
  // no icon, no color and no category to open, so its row was a gray strip
  // that looked like a rendering fault rather than a category.
  const named = summary.byCategory.filter((tally) => tally.categoryId !== null);

  return (
    <View style={styles.panel}>
      <View style={styles.tiles}>
        <StatTile
          value={`${summary.completions}`}
          label="Knowts completed"
          tint={theme.color.tileMint}
          ink={theme.color.tileMintInk}
          change={previous?.completions ?? null}
          spark={spark('completions')}
        />
        <StatTile
          value={
            summary.rate === null ? '-' : `${Math.round(summary.rate * 100)}%`
          }
          label="completion rate"
          tint={theme.color.tileLavender}
          ink={theme.color.tileLavenderInk}
          change={previous?.rate ?? null}
          spark={spark('rate')}
        />
        <StatTile
          value={`${summary.overrides}`}
          label="overridden"
          tint={theme.color.tilePink}
          ink={theme.color.tilePinkInk}
          change={previous?.overrides ?? null}
          spark={spark('overrides')}
        />
      </View>

      <Trend summary={summary} />

      <View style={styles.facts}>
        <FactCard
          icon="clock"
          title="Peak time"
          tint={theme.color.tileLavenderInk}
          value={summary.peakHour === null ? '-' : hourRange(summary.peakHour)}
          note={
            summary.peakHour === null
              ? 'Nothing finished yet'
              : 'When most things get done'
          }
        />
        <FactCard
          icon="stopwatch"
          title="Avg complete time"
          tint={theme.color.tileMintInk}
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

      {named.length > 0 ? (
        <View style={styles.card}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            Completion by category
          </Text>
          {named.map((tally) => {
            const shades = shadesFromHex(tally.color);
            const rate = tally.total === 0 ? 0 : tally.completions / tally.total;
            return (
              <Pressable
                key={tally.categoryId}
                accessibilityRole="button"
                accessibilityLabel={`${tally.name}, ${Math.round(rate * 100)} percent`}
                onPress={() => onOpenCategory(tally.categoryId as string)}
                style={({ pressed }) => [
                  styles.catRow,
                  pressed && styles.catRowPressed,
                ]}>
                <CategoryIcon icon={tally.icon} shades={shades} size={CAT_ICON} />
                <Text numberOfLines={1} style={styles.catName}>
                  {tally.name}
                </Text>
                <View style={styles.catTrack}>
                  <View
                    style={[
                      styles.catFill,
                      {
                        width: `${Math.max(4, rate * 100)}%`,
                        backgroundColor: tally.color,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.catCount}>{Math.round(rate * 100)}%</Text>
                <Text style={styles.catChevron}>{'\u203A'}</Text>
              </Pressable>
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

const CAT_ICON = 28;
const SPARK_HEIGHT = 18;
/** Enough to show a shape, few enough that each bar is wider than its gap. */
const SPARK_BARS = 9;

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
  tileFoot: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  tileSpark: { flex: 1, alignItems: 'flex-end' },
  change: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.xs,
  },
  spark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    height: SPARK_HEIGHT,
  },
  // Square ends, equal widths, full strength. Rounded caps and a fade read as
  // a drawing of a chart rather than as a chart.
  sparkBar: { flex: 1, borderRadius: 1.5 },

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

  trend: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 96 },
  trendCell: { flex: 1, alignItems: 'center', gap: 4 },
  trendTrack: { height: 64, width: '100%', justifyContent: 'flex-end' },
  // A touch of radius, solid fill. Square ends read as a bar code and fully
  // rounded ones as a drawing; this is a chart.
  trendBar: { width: '100%', borderRadius: 5, minHeight: 6 },
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
  // White, like every other card on this screen. They were filled pale lime to
  // say they were the readings worth looking at, and a tint across a whole
  // card is a loud way to say that; the lime is a badge now and the figure
  // carries the emphasis.
  factCard: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  factHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    // Two lines of the label, always, so the value below starts at the same
    // height on both cards.
    minHeight: 34,
  },
  // Lime, with the mark in ink: 15.9 to 1, and the only lime left on these two
  // cards.
  factBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.highlight,
  },
  factTitle: {
    flex: 1,
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  // The figure, in the color of the tile above that counts the same thing:
  // Peak time in the completion rate's purple at 7.48 to 1 on white, Avg
  // complete time in the Knowts completed green at 6.54 to 1. Both clear 4.5,
  // so neither needed a darker shade.
  factValue: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.stat,
    lineHeight: 31,
    // Two lines, reserved, for the same reason the label's height is.
    minHeight: 62,
    ...theme.font.tabular,
  },
  factNote: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    lineHeight: 15,
    // The muted gray, as on every other card now that these are white. It
    // reads 4.73 to 1 here; on the old lime tint it was 4.22, which is why it
    // used to be charcoal.
    color: theme.color.textMuted,
  },

  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    // Fixed, so every row is the same height whatever its icon draws.
    height: 40,
  },
  catRowPressed: { opacity: 0.6 },
  catName: {
    // Fixed width, so every bar starts at the same x however long the name is.
    width: 74,
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
  catChevron: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.textMuted,
  },
  catCount: {
    // Wide enough for "100%", so the chevrons line up down the column.
    width: 38,
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
