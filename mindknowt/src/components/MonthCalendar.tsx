import { StyleSheet, Text, View, Pressable } from 'react-native';

import { ChevronLeft } from './icons';
import { monthGrid } from '../knowts/occurrences';
import { theme } from '../theme';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * A compact month, for picking the day a schedule starts on.
 *
 * Built from views like everything else here: a calendar library is a
 * dependency and a native rebuild for a grid of forty two squares.
 *
 * Two different things are drawn on a day and they must not be confused. The
 * chosen start date is a filled lime disc, because it is the one the person
 * set. Every other day the schedule will ring on carries a small dot, because
 * those are consequences of that choice rather than choices themselves. A
 * schedule that rings daily would otherwise look like forty two selections.
 *
 * The grid is always six weeks, so paging months does not move everything
 * below it up and down.
 */
export function MonthCalendar({
  month,
  selected,
  today,
  occursOn,
  onPick,
  onShiftMonth,
}: {
  /** Any date inside the month being shown. */
  month: Date;
  selected: Date;
  today: Date;
  /** Whether the schedule being built rings on a day. */
  occursOn: (day: Date) => boolean;
  onPick: (day: Date) => void;
  onShiftMonth: (delta: number) => void;
}) {
  const days = monthGrid(month);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={12}
          onPress={() => onShiftMonth(-1)}
          style={({ pressed }) => [styles.arrow, pressed && styles.pressed]}>
          <ChevronLeft size={18} color={theme.color.textSecondary} />
        </Pressable>

        <Text style={styles.title}>
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={12}
          onPress={() => onShiftMonth(1)}
          style={({ pressed }) => [
            styles.arrow,
            styles.arrowNext,
            pressed && styles.pressed,
          ]}>
          <ChevronLeft size={18} color={theme.color.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((label, i) => (
          <Text key={i} style={styles.weekLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const outside = day.getMonth() !== month.getMonth();
          const isSelected = sameDay(day, selected);
          const isToday = sameDay(day, today);
          const rings = !outside && occursOn(day);

          return (
            <Pressable
              key={day.toISOString()}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${MONTHS[day.getMonth()]} ${day.getDate()}${
                rings ? ', rings' : ''
              }`}
              onPress={() => onPick(day)}
              style={styles.cell}>
              <View
                style={[
                  styles.day,
                  isToday && !isSelected && styles.dayToday,
                  isSelected && styles.daySelected,
                ]}>
                <Text
                  style={[
                    styles.dayText,
                    outside && styles.dayTextOutside,
                    isSelected && styles.dayTextSelected,
                  ]}>
                  {day.getDate()}
                </Text>
              </View>
              {/* Kept out of the disc so the selected day can show both: it is
                  the start and it is an occurrence. */}
              <View
                style={[
                  styles.mark,
                  rings && styles.markOn,
                  rings && isSelected && styles.markOnSelected,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const CELL = 40;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  arrow: { padding: 6 },
  // The same glyph turned around, rather than a second one to keep in step.
  arrowNext: { transform: [{ rotate: '180deg' }] },
  pressed: { opacity: 0.6 },
  title: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  weekRow: { flexDirection: 'row' },
  weekLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    color: theme.color.textMuted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    height: CELL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    borderWidth: 1.5,
    borderColor: theme.color.textPrimary,
  },
  daySelected: { backgroundColor: theme.color.highlight },
  dayText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  dayTextOutside: { color: theme.color.border },
  dayTextSelected: { fontFamily: theme.font.face.medium },
  mark: {
    width: 5,
    height: 5,
    marginTop: 2,
    borderRadius: 3,
    backgroundColor: 'transparent',
  },
  markOn: { backgroundColor: theme.color.textPrimary },
  // On the lime disc a dark dot below still reads; this keeps it distinct from
  // the unselected ones without inventing a third color.
  markOnSelected: { backgroundColor: theme.color.textPrimary },
});
