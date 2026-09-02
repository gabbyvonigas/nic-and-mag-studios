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
 * Gear. Four bars crossed at 45 degree steps make eight teeth, with a ring laid
 * over the middle to cut them back to the rim and leave the hole.
 *
 * The ring is drawn rather than filled on purpose. A solid centre reads as a
 * grey blob at small sizes, not as a gear, which is exactly how the first
 * version of this looked.
 *
 * `holeColor` has to match whatever sits behind the icon, because the hole is
 * painted rather than cut.
 */
export function GearIcon({
  size = 16,
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
