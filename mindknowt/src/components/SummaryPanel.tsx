import { StyleSheet, Text, View } from 'react-native';

import type { MonthSummary } from '../history/summary';
import type { KnowtWithDetail } from '../db';
import { categoryShades, METHOD_COLORS, theme } from '../theme';

/**
 * The month in numbers, on the home screen.
 *
 * Everything here is derived from event rows the app already writes. The one
 * figure worth watching is the split between scanned, tapped and overridden:
 * it says whether the tag is doing its job, or whether the override has
 * quietly become the way the app is used.
 */

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Minutes read as minutes until they stop being readable that way. */
function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'under a minute';
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hr`;
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

export function SummaryPanel({
  summary,
  tagged,
}: {
  summary: MonthSummary;
  /** Knowts currently holding a tag. Omitted where the panel is not the Log. */
  tagged?: KnowtWithDetail[];
}) {
  const { byMethod } = summary;
  const anyMethod = byMethod.scan + byMethod.tap + byMethod.override > 0;
  const busiest = Math.max(...summary.byWeekday, 1);
  const anyWeekday = summary.byWeekday.some((n) => n > 0);

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
                        backgroundColor: shades.mark,
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

      {/* Deliberately the one dark block in a panel of white tiles. Tags are
          the thing that makes this app work, so the section that counts them
          should not look like another statistic. */}
      {tagged && tagged.length > 0 ? (
        <View style={styles.tags}>
          <View style={styles.tagsHead}>
            <Text style={styles.tagsCount}>{tagged.length}</Text>
            <Text style={styles.tagsLabel}>
              knowt{tagged.length === 1 ? '' : 's'} with a tag attached
            </Text>
          </View>
          {tagged.map((knowt) => (
            <View key={knowt.id} style={styles.tagRow}>
              <View
                style={[
                  styles.tagDot,
                  { backgroundColor: categoryShades(knowt.category).color },
                ]}
              />
              <Text numberOfLines={1} style={styles.tagName}>
                {knowt.name}
              </Text>
              <Text numberOfLines={1} style={styles.tagWhere}>
                {knowt.location_note ?? 'no place noted'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {summary.medianResponseMinutes !== null || summary.snoozes > 0 ? (
        <View style={styles.pairRow}>
          {summary.medianResponseMinutes !== null ? (
            <View style={styles.pair}>
              <Text style={styles.pairValue}>
                {formatMinutes(summary.medianResponseMinutes)}
              </Text>
              <Text style={styles.pairLabel}>typical time to answer</Text>
            </View>
          ) : null}
          {summary.snoozes > 0 ? (
            <View style={styles.pair}>
              <Text style={styles.pairValue}>{summary.snoozes}</Text>
              <Text style={styles.pairLabel}>
                snooze{summary.snoozes === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {anyWeekday ? (
        <View style={styles.weekRow}>
          {summary.byWeekday.map((count, index) => (
            <View key={index} style={styles.weekCol}>
              <View style={styles.weekTrack}>
                <View
                  style={[
                    styles.weekFill,
                    {
                      // Proportional to the busiest day, so the shape of the
                      // week reads even when the numbers are small.
                      height: `${count === 0 ? 0 : Math.max(8, (count / busiest) * 100)}%`,
                      backgroundColor: METHOD_COLORS.scan,
                    },
                  ]}
                />
              </View>
              <Text style={styles.weekLabel}>{WEEKDAYS[index]}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {summary.mostSnoozed.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.listTitle}>Put off most</Text>
          {summary.mostSnoozed.slice(0, 3).map((entry) => (
            <View key={entry.knowtId} style={styles.listRow}>
              <View
                style={[
                  styles.listDot,
                  { backgroundColor: categoryShades(entry.category).mark },
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

      {summary.missedKnowts.length > 0 ? (
        <View style={styles.list}>
          <Text style={styles.listTitle}>Went by</Text>
          {summary.missedKnowts.slice(0, 3).map((entry) => (
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
                {entry.misses} time{entry.misses === 1 ? '' : 's'}
              </Text>
            </View>
          ))}
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
  tags: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  tagsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
  },
  tagsCount: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.display,
    color: theme.color.highlight,
  },
  tagsLabel: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.onPrimary,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagName: {
    flex: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.md,
    color: theme.color.onPrimary,
  },
  tagWhere: {
    flexShrink: 1,
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.border,
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
  weekRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    height: 72,
    marginTop: theme.spacing.xs,
  },
  weekCol: { flex: 1, alignItems: 'center', gap: theme.spacing.xs },
  weekTrack: {
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
    backgroundColor: theme.color.surfaceMuted,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  weekFill: { borderRadius: theme.radius.sm },
  weekLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
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
