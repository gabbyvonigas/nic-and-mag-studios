import { StyleSheet, Text, View } from 'react-native';

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

export function SummaryPanel({ summary }: { summary: MonthSummary }) {
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

      {summary.byCategory.length > 0 ? (
        <View style={styles.categories}>
          {summary.byCategory.map((tally) => {
            const shades = categoryShades(tally.category);
            return (
              <View key={tally.category?.id ?? 'none'} style={styles.catRow}>
                <Text
                  numberOfLines={1}
                  style={[styles.catName, { color: shades.ink }]}>
                  {tally.category?.name ?? 'No category'}
                </Text>
                <View style={styles.catTrack}>
                  <View
                    style={[
                      styles.catFill,
                      {
                        width: `${Math.max(3, tally.share * 100)}%`,
                        backgroundColor: shades.color,
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

      {summary.missed > 0 ? (
        <Text style={styles.missed}>
          {summary.missed} went by without being done.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  categories: { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  catName: {
    width: 78,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
  },
  catTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.surfaceMuted,
    overflow: 'hidden',
  },
  catFill: { height: 8, borderRadius: 4 },
  catCount: {
    width: 24,
    textAlign: 'right',
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  missed: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
});
