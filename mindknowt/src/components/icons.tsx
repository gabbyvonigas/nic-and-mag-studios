import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';

/**
 * The app's icons.
 *
 * The ones that stand for a real thing (a clock, a scan, a tag, a lock) are
 * Ionicons. The rest are still drawn from plain views, because a plus, a
 * chevron and a check are two rectangles each and a glyph buys nothing.
 *
 * Ionicons costs no native rebuild, which is worth writing down because this
 * file used to say the opposite. `@expo/vector-icons` is pure JavaScript, and
 * the `expo-font` module it loads its font through is already linked: it is a
 * dependency of `expo` itself, so autolinking has always picked it up. The font
 * file is a JS asset and arrives over Metro like any other.
 *
 * Every icon keeps the same props it had when it was a drawing, so call sites
 * did not have to change. `thickness` is accepted and ignored by the Ionicons
 * backed ones, because a font has one weight per glyph.
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
        // The rotation leaves the stroke visually right of center.
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

/** A plus, for rows that add something. Two bars, same build as `ExpandSign`. */
export function PlusSign({
  size = 16,
  color = theme.color.textSecondary,
  thickness = 2,
}: {
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
      <View
        style={{
          position: 'absolute',
          width: thickness,
          height: size,
          borderRadius: thickness,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** A closed padlock, for a line about what happens to someone's details. */
export function LockIcon({
  size = 12,
  color = theme.color.textMuted,
}: {
  size?: number;
  color?: string;
  /** Accepted and ignored: a font has one weight per glyph. */
  thickness?: number;
}) {
  return <Ionicons name="lock-closed-outline" size={size} color={color} />;
}

/**
 * A knowt with a physical tag attached.
 *
 * A tag rather than the radio arcs the drawing used. Ionicons has no NFC
 * glyph, and the question this answers is whether a tag is attached, not
 * whether a radio is transmitting.
 */
export function NfcIcon({
  size = 20,
  color = theme.color.textPrimary,
}: {
  size?: number;
  color?: string;
  /** Accepted and ignored: a font has one weight per glyph. */
  thickness?: number;
}) {
  return <Ionicons name="pricetag-outline" size={size} color={color} />;
}

/**
 * A pin. A round head over a tapering stem, which is enough shape to read at
 * twelve points without becoming a drawing.
 */
export function PinIcon({
  size = 13,
  color = theme.color.textPrimary,
}: {
  size?: number;
  color?: string;
}) {
  const head = size * 0.62;
  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          width: head,
          height: head,
          borderRadius: head / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          width: Math.max(1.5, size * 0.14),
          height: size * 0.46,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/**
 * Gear. Four bars crossed at 45 degree steps make eight teeth, with a ring laid
 * over the middle to cut them back to the rim and leave the hole.
 *
 * The ring is drawn rather than filled on purpose. A solid center reads as a
 * gray blob at small sizes, not as a gear, which is exactly how the first
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

/** Scanning a tag to stop an alarm, which is the whole product. */
export function ScanIcon({
  size = 20,
  color = theme.color.textPrimary,
}: {
  size?: number;
  color?: string;
  /** Accepted and ignored: a font has one weight per glyph. */
  thickness?: number;
}) {
  return <Ionicons name="scan-outline" size={size} color={color} />;
}

/** Alarm. Used on the Alarm Only mode, and wherever a schedule has a time. */
export function AlarmIcon({
  size = 20,
  color = theme.color.textPrimary,
}: {
  size?: number;
  color?: string;
  /** Accepted and ignored: a font has one weight per glyph. */
  thickness?: number;
}) {
  return <Ionicons name="alarm-outline" size={size} color={color} />;
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

/** Points at where a row goes. For sections that are tappable as a whole. */
export function ChevronRight({
  size = 18,
  color = theme.color.textMuted,
}: {
  size?: number;
  color?: string;
}) {
  return <Ionicons name="chevron-forward" size={size} color={color} />;
}
