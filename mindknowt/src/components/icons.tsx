import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';

/**
 * Icons drawn from plain views.
 *
 * There is no icon font in this project, and adding one pulls in expo-font,
 * which is native and would turn every JS-only change into a twenty minute
 * rebuild. Unicode glyphs are not an option either: the obvious gear and
 * chevron characters get replaced by colour emoji on iOS, which breaks both the
 * look and the no-emoji rule. So they are shapes.
 */

/** Back chevron. A square with two borders, turned on its corner. */
export function ChevronLeft({
  size = 12,
  color = theme.color.textPrimary,
  thickness = 2,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderLeftWidth: thickness,
        borderBottomWidth: thickness,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
        // The rotation leaves the stroke visually right of centre.
        marginRight: size * 0.25,
      }}
    />
  );
}

/**
 * Expand control: a plus when closed, a minus when open.
 *
 * Two bars, with the upright hidden when open, so the horizontal stays put and
 * only the vertical comes and goes. That reads as one control changing state
 * rather than as two different marks swapped in and out.
 */
export function ExpandSign({
  expanded,
  size = 16,
  color = theme.color.textSecondary,
  thickness = 2,
}: {
  expanded: boolean;
  size?: number;
  color?: string;
  thickness?: number;
}) {
  return (
    <View
      accessible={false}
      style={[styles.iconBox, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          width: size,
          height: thickness,
          borderRadius: thickness,
          backgroundColor: color,
        }}
      />
      {expanded ? null : (
        <View
          style={{
            position: 'absolute',
            width: thickness,
            height: size,
            borderRadius: thickness,
            backgroundColor: color,
          }}
        />
      )}
    </View>
  );
}

/**
 * Gear. Four bars crossed at 45 degree steps make eight teeth, with a ring laid
 * over the middle to cut them back to the rim and leave the hole.
 *
 * The ring is drawn rather than filled on purpose. A solid centre reads as a
 * grey blob at small sizes, not as a gear, which is exactly how the first
 * version of this looked. There is no circle behind it and no shadow: this is
 * a quiet corner control, not a floating button.
 *
 * `holeColor` has to match whatever sits behind the icon, because the hole is
 * painted rather than cut.
 */
export function GearIcon({
  size = 22,
  color = theme.color.textPrimary,
  holeColor = theme.color.background,
}: {
  size?: number;
  color?: string;
  holeColor?: string;
}) {
  const teeth = ['0deg', '45deg', '90deg', '135deg'];
  const rim = size * 0.68;

  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      {teeth.map((rotate) => (
        <View
          key={rotate}
          style={[
            styles.absolute,
            {
              width: size,
              height: size * 0.3,
              borderRadius: size * 0.06,
              backgroundColor: color,
              transform: [{ rotate }],
            },
          ]}
        />
      ))}
      <View
        style={[
          styles.absolute,
          {
            width: rim,
            height: rim,
            borderRadius: rim / 2,
            borderWidth: size * 0.15,
            borderColor: color,
            backgroundColor: holeColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  absolute: { position: 'absolute' },
});

/**
 * Scan mark, in the shape iOS uses for scanning: four corner brackets framing
 * a subject. Built from four L shapes, each a square with two borders, rotated
 * into position, with wave arcs in the middle standing for the tag being read.
 */
export function ScanIcon({
  size = 20,
  color = theme.color.textPrimary,
  thickness = 2,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  const arm = size * 0.32;
  const corners = [
    { top: 0, left: 0, rotate: '0deg' },
    { top: 0, right: 0, rotate: '-90deg' },
    { bottom: 0, right: 0, rotate: '180deg' },
    { bottom: 0, left: 0, rotate: '90deg' },
  ];

  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      {corners.map((corner, index) => {
        const { rotate, ...position } = corner;
        return (
          <View
            key={index}
            style={[
              styles.absolute,
              position,
              {
                width: arm,
                height: arm,
                borderLeftWidth: thickness,
                borderTopWidth: thickness,
                borderColor: color,
                transform: [{ rotate }],
              },
            ]}
          />
        );
      })}
      {/* Two bars for the signal between the brackets. */}
      <View
        style={{
          width: thickness,
          height: size * 0.34,
          borderRadius: thickness,
          backgroundColor: color,
          marginRight: size * 0.12,
        }}
      />
      <View
        style={[
          styles.absolute,
          {
            width: thickness,
            height: size * 0.2,
            borderRadius: thickness,
            backgroundColor: color,
            marginLeft: size * 0.14,
          },
        ]}
      />
    </View>
  );
}

/**
 * Alarm mark. A bell is not honestly drawable from rectangles, so this is a
 * clock face instead: a ring with two hands. It reads as "it rings at a time",
 * which is what Alarm Only means.
 */
export function AlarmIcon({
  size = 20,
  color = theme.color.textPrimary,
  thickness = 2,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.86,
          height: size * 0.86,
          borderRadius: size * 0.43,
          borderWidth: thickness,
          borderColor: color,
        }}
      />
      {/* Hour hand, upright. */}
      <View
        style={[
          styles.absolute,
          {
            width: thickness,
            height: size * 0.26,
            backgroundColor: color,
            borderRadius: thickness,
            marginBottom: size * 0.26,
          },
        ]}
      />
      {/* Minute hand, to the right. */}
      <View
        style={[
          styles.absolute,
          {
            width: size * 0.22,
            height: thickness,
            backgroundColor: color,
            borderRadius: thickness,
            marginLeft: size * 0.22,
          },
        ]}
      />
    </View>
  );
}

/** Outlined circle with a tick. Replaces the Done pill on cards. */
export function CheckIcon({
  size = 24,
  color = theme.color.textPrimary,
  thickness = 2,
  filled = false,
}: {
  size?: number;
  color?: string;
  thickness?: number;
  filled?: boolean;
}) {
  const tickColor = filled ? theme.color.onAccent : color;

  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View
        style={[
          styles.absolute,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: thickness,
            borderColor: color,
            backgroundColor: filled ? color : 'transparent',
          },
        ]}
      />
      {/* The tick: a corner turned on its side, the short arm down-left. */}
      <View
        style={{
          width: size * 0.36,
          height: size * 0.2,
          borderLeftWidth: thickness,
          borderBottomWidth: thickness,
          borderColor: tickColor,
          transform: [{ rotate: '-45deg' }],
          marginTop: -size * 0.06,
        }}
      />
    </View>
  );
}
