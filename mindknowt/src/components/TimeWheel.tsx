import { useRef } from 'react';
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
  indexFromOffset,
  partsOf,
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
 * turn every change to this screen into a twenty minute rebuild. This is three
 * snapping lists instead: the same gesture, and it costs nothing.
 *
 * Typing a time into a text field was the previous approach, and it was the
 * single worst thing about editing a knowt.
 *
 * The measurements are in `timeWheelLayout.ts` so they can be asserted. Read
 * the note there before changing `flexGrow` on a column: a vertical ScrollView
 * brings its own `flexGrow: 1`, and that is what spread the three wheels across
 * the whole screen and stopped the selected time reading as one value.
 *
 * `compact` is the same wheel at two thirds the size, for places where a time
 * is one field among many rather than the subject of the screen. It is the
 * same control deliberately: a preset that asked for a typed time while the
 * editor offered a wheel taught two different ways to say the same thing.
 */

const HOURS = Array.from({ length: 12 }, (_, i) => `${i + 1}`);
const MINUTES = Array.from({ length: 60 }, (_, i) => `${i}`.padStart(2, '0'));
const MERIDIEMS = ['am', 'pm'];

function Column({
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

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = indexFromOffset(
      event.nativeEvent.contentOffset.y,
      size,
      values.length,
    );
    if (next !== index) onIndexChange(next);
  };

  return (
    <ScrollView
      ref={ref}
      accessibilityLabel={label}
      // flexGrow and flexShrink are pinned on purpose. ScrollView composes its
      // own base style underneath this one, and that base sets both to 1, so a
      // width alone is only a flex basis and every column stretches.
      //
      // The height is pinned for the same reason, and this is the one that was
      // missing. An unpinned ScrollView takes its height from its content, and
      // the three columns hold 12, 60 and 2 values, so they resolved to three
      // different frame heights. `contentOffset` is measured from the top of
      // the frame, so the selected row landed at a different place on screen in
      // each column, and by a different amount depending on the value. That is
      // the minute reading higher than the hour next to it.
      style={{
        width,
        height: columnHeight(size),
        flexGrow: 0,
        flexShrink: 0,
      }}
      contentContainerStyle={{ paddingVertical: wheelPadding(size) }}
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

  const emit = (next: {
    hour12?: number;
    minute?: number;
    isPm?: boolean;
  }) =>
    onChange(timeFrom({ hour12, minute, isPm, ...next }));

  return (
    <View
      style={[
        styles.wheel,
        { height: columnHeight(size), width: wheelWidth(size) },
      ]}>
      {/* The selection band spans the control, not the page. It sat at
          left: 0, right: 0 of a full width parent, which drew a bar across the
          whole screen behind three wheels that were nowhere near each other. */}
      <View
        style={[
          styles.highlight,
          { top: wheelPadding(size), height: size.itemHeight },
        ]}
        pointerEvents="none"
      />
      <View style={styles.columns}>
        <Column
          label="Hour"
          size={size}
          width={size.hourWidth}
          values={HOURS}
          index={hour12 - 1}
          onIndexChange={(i) => emit({ hour12: i + 1 })}
        />
        {/* Not a column. It is the thing that makes the three wheels read as
            one time rather than three numbers. */}
        <View
          style={[
            styles.separator,
            { width: size.separatorWidth, paddingTop: wheelPadding(size) },
          ]}>
          <View style={[styles.item, { height: size.itemHeight }]}>
            <Text
              allowFontScaling={false}
              style={[
                styles.separatorText,
                { fontSize: size.fontSize, lineHeight: size.itemHeight },
              ]}>
              :
            </Text>
          </View>
        </View>
        <Column
          label="Minute"
          size={size}
          width={size.minuteWidth}
          values={MINUTES}
          index={minute}
          onIndexChange={(i) => emit({ minute: i })}
        />
        <Column
          label="Morning or afternoon"
          size={size}
          width={size.meridiemWidth}
          values={MERIDIEMS}
          index={isPm ? 1 : 0}
          onIndexChange={(i) => emit({ isPm: i === 1 })}
        />
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
    backgroundColor: theme.color.surfaceMuted,
  },
  item: { alignItems: 'center', justifyContent: 'center' },
  itemText: {
    fontFamily: theme.font.face.regular,
    color: theme.color.textMuted,
    textAlign: 'center',
    // Digits are proportional by default in this family, so "1" is narrower
    // than "0" and a two digit minute shifts as it changes. Tabular figures
    // are one width, which is what keeps 16 and 08 in the same place.
    ...theme.font.tabular,
  },
  itemTextOn: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
  },
  // Built as a row in the same stack the columns use, rather than centered on
  // the control. Centering two different ways and hoping they agree is what
  // left the colon sitting off the digits' baseline.
  separator: { alignItems: 'center' },
  separatorText: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
    textAlign: 'center',
    ...theme.font.tabular,
  },
});
