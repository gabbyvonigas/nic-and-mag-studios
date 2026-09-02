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
 * Gear. Four bars crossed at 45 degree steps make eight teeth, with a solid
 * body over the middle and a hole punched through it.
 *
 * `holeColor` has to match whatever sits behind the icon, because the hole is
 * painted rather than cut.
 */
export function GearIcon({
  size = 20,
  color = theme.color.textSecondary,
  holeColor = theme.color.background,
}: {
  size?: number;
  color?: string;
  holeColor?: string;
}) {
  const teeth = ['0deg', '45deg', '90deg', '135deg'];

  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      {teeth.map((rotate) => (
        <View
          key={rotate}
          style={[
            styles.tooth,
            {
              width: size,
              height: size * 0.34,
              borderRadius: size * 0.07,
              backgroundColor: color,
              transform: [{ rotate }],
            },
          ]}
        />
      ))}
      <View
        style={{
          width: size * 0.74,
          height: size * 0.74,
          borderRadius: size * 0.37,
          backgroundColor: color,
        }}
      />
      <View
        style={[
          styles.hole,
          {
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: size * 0.15,
            backgroundColor: holeColor,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: { alignItems: 'center', justifyContent: 'center' },
  tooth: { position: 'absolute' },
  hole: { position: 'absolute' },
});
