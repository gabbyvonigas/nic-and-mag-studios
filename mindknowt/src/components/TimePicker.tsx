import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Platform, StyleSheet, View } from 'react-native';

import { dateFromTime, timeFromDate } from './timeOfDay';
import { theme } from '../theme';

/**
 * Picking a time, with the system's own wheel.
 *
 * This replaces a picker built from three snapping `ScrollView`s. That one was
 * cheaper than a native dependency, and it cost more in the end: it drifted out
 * of alignment, it stole touches from the page around it, and finally it froze
 * the app outright. The freeze was a loop of its own making. Settling bound
 * `onMomentumScrollEnd` to a handler that called `scrollTo` with
 * `animated: true`, and on iOS an animated `scrollTo` ends by firing
 * `onMomentumScrollEnd`, so every settle scheduled another one and it never
 * converged. Three columns did it at once.
 *
 * A native control has none of those failure modes, because none of this is our
 * code any more. Snapping, the am and pm wrap, the touch target and the
 * scrolling are UIKit's.
 *
 * What that costs is styling. `UIDatePicker` in spinner mode draws its own
 * type: the family and the size are not ours to set, so the app's rounded font
 * does not reach it. `textColor` is honored on iOS and is set to the app's ink,
 * and the surface it sits on is ours. That is the whole of the control we have,
 * and it is worth it.
 */
export function TimePicker({
  value,
  onChange,
  compact = false,
}: {
  /** 24 hour `HH:MM`, which is the only format ever stored. */
  value: string;
  onChange: (next: string) => void;
  /** Tighter, for places where a time is one field among many. */
  compact?: boolean;
}) {
  const handle = (_event: DateTimePickerEvent, next?: Date) => {
    // Canceling on Android reports no date. On iOS a spinner always has one.
    if (!next) return;
    onChange(timeFromDate(next));
  };

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      <DateTimePicker
        value={dateFromTime(value)}
        mode="time"
        display="spinner"
        onChange={handle}
        // The app is light only, so the picker must not follow a dark system
        // setting and render white on white.
        themeVariant="light"
        textColor={theme.color.textPrimary}
        accessibilityLabel="Time"
        style={compact ? styles.pickerCompact : styles.picker}
      />
    </View>
  );
}

/**
 * The height the spinner is given.
 *
 * Set rather than left to the control. An unsized `UIDatePicker` inside a
 * `ScrollView` reports a height the scroll view then fights over, which is
 * where the page grabbing touches came from.
 */
const FULL_HEIGHT = 196;
const COMPACT_HEIGHT = 140;

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
    // Its own surface, so the spinner reads as a field rather than as a hole in
    // the page. The control draws no background of its own.
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    paddingVertical: Platform.OS === 'ios' ? theme.spacing.xs : 0,
  },
  compact: { backgroundColor: 'transparent' },
  picker: { height: FULL_HEIGHT },
  pickerCompact: { height: COMPACT_HEIGHT },
});
