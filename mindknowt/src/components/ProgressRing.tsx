import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';

/**
 * A progress ring, drawn from plain views.
 *
 * `react-native-svg` is not in this project, and adding it is a native
 * dependency, so an arc has to be built rather than drawn. The method is a
 * disc split down the middle: each half sits in a clip that shows only its
 * own side, and rotating a half out of its clip hides it. Sweeping the right
 * half from -180 to 0 fills the first half of the circle clockwise from the
 * top, then the left half does the same for the rest. A smaller circle in the
 * page color sits on top and turns the disc into a ring.
 *
 * Each half rotates about the ring's center, not its own: the center lands on
 * the clip's inner edge, so the rotation is wrapped in a translate out and
 * back. That is the part to look at first if it ever renders wrong.
 */
function Half({
  size,
  side,
  degrees,
  color,
}: {
  size: number;
  side: 'left' | 'right';
  degrees: number;
  color: string;
}) {
  const shift = side === 'right' ? -size / 4 : size / 4;

  return (
    <View
      style={[
        styles.clip,
        { width: size / 2, height: size },
        side === 'right' ? { right: 0 } : { left: 0 },
      ]}>
      <View
        style={{
          width: size / 2,
          height: size,
          backgroundColor: color,
          transform: [
            { translateX: shift },
            { rotate: `${degrees}deg` },
            { translateX: -shift },
          ],
        }}
      />
    </View>
  );
}

export function ProgressRing({
  value,
  size = 64,
  thickness = 7,
  children,
}: {
  /** 0 to 1. Anything outside is clamped rather than drawn wrong. */
  value: number;
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const progress = Math.max(0, Math.min(1, value));
  const hole = size - thickness * 2;

  // The right half carries the first 50 percent, the left half the rest.
  const rightDegrees = -180 + Math.min(progress, 0.5) * 360;
  const leftDegrees = -180 + Math.max(0, progress - 0.5) * 360;

  return (
    <View
      accessible
      accessibilityLabel={`${Math.round(progress * 100)} percent complete`}
      style={{ width: size, height: size }}>
      <View
        style={[
          styles.track,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      />
      <Half size={size} side="right" degrees={rightDegrees} color={theme.color.highlight} />
      <Half size={size} side="left" degrees={leftDegrees} color={theme.color.highlight} />
      <View
        style={[
          styles.hole,
          {
            left: thickness,
            top: thickness,
            width: hole,
            height: hole,
            borderRadius: hole / 2,
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', backgroundColor: theme.color.border },
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
  hole: {
    position: 'absolute',
    backgroundColor: theme.color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
