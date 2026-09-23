import { useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { theme } from '../theme';

/**
 * A time picker built from snapping scroll views.
 *
 * The obvious answer is the platform picker, but that means
 * `@react-native-community/datetimepicker`, which is a native module and would
 * turn every change to this screen into a twenty minute rebuild. This is three
 * snapping lists instead: the same gesture, and it costs nothing.
 *
 * Typing a time into a text field was the previous approach, and it was the
 * single worst thing about editing a knowt.
 *
 * `compact` is the same wheel at two thirds the size, for places where a time
 * is one field among many rather than the subject of the screen. It is the
 * same control deliberately: a preset that asked for a typed time while the
 * editor offered a wheel taught two different ways to say the same thing.
 */

type Size = {
  itemHeight: number;
  /** Odd, so one row sits centred with equal space above and below. */
  rows: number;
  columnWidth: number;
  fontSize: number;
};

const FULL: Size = { itemHeight: 44, rows: 5, columnWidth: 72, fontSize: theme.font.size.xl };
const COMPACT: Size = { itemHeight: 32, rows: 3, columnWidth: 52, fontSize: theme.font.size.md };

const HOURS = Array.from({ length: 12 }, (_, i) => `${i + 1}`);
const MINUTES = Array.from({ length: 60 }, (_, i) => `${i}`.padStart(2, '0'));
const MERIDIEMS = ['am', 'pm'];

function padFor(size: Size): number {
  return ((size.rows - 1) / 2) * size.itemHeight;
}

function Column({
  values,
  index,
  onIndexChange,
  label,
  size,
}: {
  values: string[];
  index: number;
  onIndexChange: (next: number) => void;
  label: string;
  size: Size;
}) {
  const ref = useRef<ScrollView>(null);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.y / size.itemHeight);
    const clamped = Math.max(0, Math.min(values.length - 1, next));
    if (clamped !== index) onIndexChange(clamped);
  };

  return (
    <ScrollView
      ref={ref}
      accessibilityLabel={label}
      style={{ width: size.columnWidth }}
      contentContainerStyle={{ paddingVertical: padFor(size) }}
      showsVerticalScrollIndicator={false}
      snapToInterval={size.itemHeight}
      decelerationRate="fast"
      // Set once. The wheel owns the value after that, so scrolling it from the
      // outside on every render would fight the finger.
      contentOffset={{ x: 0, y: index * size.itemHeight }}
      onMomentumScrollEnd={settle}
      // A slow drag that never gains momentum fires no momentum event, and
      // without this the value would silently fail to change.
      onScrollEndDrag={settle}>
      {values.map((value, i) => (
        <View
          key={value}
          style={[styles.item, { height: size.itemHeight }]}>
          <Text
            style={[
              styles.itemText,
              { fontSize: size.fontSize },
              i === index && styles.itemTextOn,
            ]}>
            {value}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** Takes and returns 24 hour `HH:MM`, which is the only format ever stored. */
export function TimeWheel({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (next: string) => void;
  compact?: boolean;
}) {
  const size = compact ? COMPACT : FULL;
  const parts = value.split(':').map(Number);
  const rawHour = Number.isFinite(parts[0]) ? (parts[0] as number) : 8;
  const minute = Number.isFinite(parts[1]) ? (parts[1] as number) : 0;

  const isPm = rawHour >= 12;
  const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;

  const emit = (h12: number, m: number, pm: boolean) => {
    // 12 am is midnight and 12 pm is noon, which is the one case where the
    // obvious arithmetic is wrong.
    const hour24 = pm ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
    onChange(`${`${hour24}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`);
  };

  return (
    <View style={[styles.wheel, { height: size.itemHeight * size.rows }]}>
      <View
        style={[
          styles.highlight,
          { top: padFor(size), height: size.itemHeight },
        ]}
        pointerEvents="none"
      />
      <View style={styles.columns}>
        <Column
          label="Hour"
          size={size}
          values={HOURS}
          index={hour12 - 1}
          onIndexChange={(i) => emit(i + 1, minute, isPm)}
        />
        <Column
          label="Minute"
          size={size}
          values={MINUTES}
          index={minute}
          onIndexChange={(i) => emit(hour12, i, isPm)}
        />
        <Column
          label="Morning or afternoon"
          size={size}
          values={MERIDIEMS}
          index={isPm ? 1 : 0}
          onIndexChange={(i) => emit(hour12, minute, i === 1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: { justifyContent: 'center' },
  columns: { flexDirection: 'row', justifyContent: 'center' },
  highlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surfaceMuted,
  },
  item: { alignItems: 'center', justifyContent: 'center' },
  itemText: {
    fontFamily: theme.font.face.regular,
    color: theme.color.textMuted,
  },
  itemTextOn: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
  },
});
