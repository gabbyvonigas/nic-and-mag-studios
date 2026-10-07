import { useCallback, useEffect, useRef } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  COMPACT,
  FULL,
  columnHeight,
  columnOffset,
  highlightTop,
  indexFromOffset,
  partsOf,
  restOffset,
  timeFrom,
  wheelPadding,
  wheelWidth,
  type WheelSize,
} from './timeWheelLayout';
import { theme } from '../theme';

/**
 * A time picker built from snapping scroll views.
 *
 * The obvious answer is the platform picker, but that means
 * `@react-native-community/datetimepicker`, which is a native module and would
 * turn every change to this screen into a twenty minute rebuild.
 *
 * Three rules hold this together, and all three were broken at some point:
 *
 *   1. Every column is the same component with the same measurements. The
 *      columns hold 12, 60 and 2 values, and nothing about their layout may
 *      depend on that. A column's height is pinned, because a ScrollView with
 *      no height takes one from its content, and three different content
 *      lengths then produce three different frames to measure offsets from.
 *   2. A column is never left resting between two values. Snapping is asked
 *      for, and then the resting offset is set outright when scrolling ends,
 *      because `snapToInterval` alone has been observed to settle off by a
 *      fraction and nothing afterwards corrects it.
 *   3. The colon is not a column. It is drawn on the selected row directly, so
 *      it cannot disagree with the digits about where that row is.
 *
 * The measurements are in `timeWheelLayout.ts` so they can be asserted off
 * device, including the one that matters: that the selected row lands in the
 * same place in all three columns, for every value.
 */

const HOURS = Array.from({ length: 12 }, (_, i) => `${i + 1}`);
const MINUTES = Array.from({ length: 60 }, (_, i) => `${i}`.padStart(2, '0'));
const MERIDIEMS = ['am', 'pm'];

/**
 * One column. Hour, minute and meridiem all use this, with nothing varying but
 * the values and the width.
 */
function WheelColumn({
  values,
  index,
  onIndexChange,
  label,
  size,
  width,
}: {
  values: string[];
  index: number;
  onIndexChange: (next: number) => void;
  label: string;
  size: WheelSize;
  width: number;
}) {
  const ref = useRef<ScrollView>(null);
  // What the column was last told to show, so an echo of our own scroll is not
  // mistaken for the person moving it.
  const settled = useRef(index);

  const scrollToIndex = useCallback(
    (next: number, animated: boolean) => {
      ref.current?.scrollTo({ x: 0, y: restOffset(size, next), animated });
    },
    [size],
  );

  // The value can change from outside: another column can rewrite the time, and
  // a screen can load one. Only move when it actually differs, or this fights
  // the finger on every render.
  useEffect(() => {
    if (index === settled.current) return;
    settled.current = index;
    scrollToIndex(index, true);
  }, [index, scrollToIndex]);

  /**
   * Both scroll-ended events go through here. Rounding to the nearest row and
   * then setting that offset outright is what keeps a column from coming to
   * rest between two values.
   */
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = indexFromOffset(
      event.nativeEvent.contentOffset.y,
      size,
      values.length,
    );
    settled.current = next;
    scrollToIndex(next, true);
    if (next !== index) onIndexChange(next);
  };

  return (
    <ScrollView
      ref={ref}
      accessibilityLabel={label}
      // flexGrow, flexShrink and height are all pinned on purpose. ScrollView
      // composes its own base style underneath this one, and that base sets
      // flexGrow and flexShrink to 1, so a width alone is only a flex basis.
      // Height has to be pinned for the same reason it is given at all: every
      // offset below is measured from the top of this frame, so a frame that
      // sizes itself to its content puts the selected row somewhere different
      // in each of the three columns.
      style={{
        width,
        height: columnHeight(size),
        flexGrow: 0,
        flexShrink: 0,
      }}
      contentContainerStyle={{ paddingVertical: wheelPadding(size) }}
      showsVerticalScrollIndicator={false}
      snapToInterval={size.itemHeight}
      snapToAlignment="start"
      disableIntervalMomentum
      decelerationRate="fast"
      // iOS adds safe area insets to a scroll view on its own unless told not
      // to, which silently shifts every offset in this control.
      contentInsetAdjustmentBehavior="never"
      automaticallyAdjustContentInsets={false}
      contentOffset={{ x: 0, y: restOffset(size, index) }}
      onMomentumScrollEnd={settle}
      // A slow drag that never gains momentum fires no momentum event, and
      // without this the value would silently fail to change.
      onScrollEndDrag={settle}>
      {values.map((value, i) => (
        <View key={value} style={[styles.item, { height: size.itemHeight }]}>
          <Text
            allowFontScaling={false}
            style={[
              styles.itemText,
              { fontSize: size.fontSize, lineHeight: size.itemHeight },
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
  const { hour12, minute, isPm } = partsOf(value);

  const emit = (next: { hour12?: number; minute?: number; isPm?: boolean }) =>
    onChange(timeFrom({ hour12, minute, isPm, ...next }));

  return (
    <View
      style={[
        styles.wheel,
        { height: columnHeight(size), width: wheelWidth(size) },
      ]}>
      {/* The selection band spans the control, not the page.
          It is outlined rather than filled. The fill it used to carry was
          `surfaceMuted`, which is the same value as the page background, so on
          any screen that is not a white card the bar was painted in the exact
          color behind it and could not be seen at all. */}
      <View
        style={[
          styles.highlight,
          { top: highlightTop(size), height: size.itemHeight },
        ]}
        pointerEvents="none"
      />

      <View style={styles.columns}>
        <WheelColumn
          label="Hour"
          size={size}
          width={size.hourWidth}
          values={HOURS}
          index={hour12 - 1}
          onIndexChange={(i) => emit({ hour12: i + 1 })}
        />
        {/* A gap the colon is drawn over, rather than a fourth column. */}
        <View style={{ width: size.separatorWidth }} />
        <WheelColumn
          label="Minute"
          size={size}
          width={size.minuteWidth}
          values={MINUTES}
          index={minute}
          onIndexChange={(i) => emit({ minute: i })}
        />
        <WheelColumn
          label="Morning or afternoon"
          size={size}
          width={size.meridiemWidth}
          values={MERIDIEMS}
          index={isPm ? 1 : 0}
          onIndexChange={(i) => emit({ isPm: i === 1 })}
        />
      </View>

      {/* Placed on the selected row by the same numbers the columns use, so it
          cannot drift off the digits' line. It is the thing that makes three
          wheels read as one time, and it is not scrollable, so making it a
          column only ever meant two ways of centering that had to agree. */}
      <View
        pointerEvents="none"
        style={[
          styles.colon,
          {
            left: columnOffset(size, 'separator'),
            width: size.separatorWidth,
            top: highlightTop(size),
            height: size.itemHeight,
          },
        ]}>
        <Text
          allowFontScaling={false}
          style={[
            styles.colonText,
            { fontSize: size.fontSize, lineHeight: size.itemHeight },
          ]}>
          :
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: { justifyContent: 'center', alignSelf: 'center' },
  columns: { flexDirection: 'row' },
  highlight: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  item: { alignItems: 'center', justifyContent: 'center' },
  itemText: {
    fontFamily: theme.font.face.regular,
    color: theme.color.textMuted,
    textAlign: 'center',
    // Digits are proportional in this family, so "1" is narrower than "0" and
    // a two digit minute shifts as it changes. Tabular figures are one width.
    ...theme.font.tabular,
  },
  itemTextOn: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
  },
  colon: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  colonText: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
    textAlign: 'center',
    ...theme.font.tabular,
  },
});
