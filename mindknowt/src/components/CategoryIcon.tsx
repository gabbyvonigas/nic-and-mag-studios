import { StyleSheet, View } from 'react-native';

import { clockParts, heartParts } from './glyphGeometry';
import type { CategoryShades } from '../theme';
import { theme } from '../theme';

/**
 * A small mark per category, drawn from views.
 *
 * `categories.icon` has held names like house, heart and gift since the first
 * seed and nothing has ever rendered them. These are those names, as simple
 * geometry: no icon font, because that means expo-font and a native rebuild
 * for a handful of glyphs.
 *
 * They are deliberately plain. A drawn heart at fourteen points is a shape,
 * not an illustration, and trying for detail at this size reads as noise. If
 * literal icons matter later, bundling a font is the honest way to get them.
 */
function Glyph({ name, color, size }: { name: string; color: string; size: number }) {
  const bar = Math.max(1.5, size * 0.14);

  switch (name) {
    case 'house':
      return (
        <View style={styles.center}>
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: size * 0.34,
              borderRightWidth: size * 0.34,
              borderBottomWidth: size * 0.3,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: color,
            }}
          />
          <View
            style={{
              width: size * 0.5,
              height: size * 0.32,
              backgroundColor: color,
              borderBottomLeftRadius: 2,
              borderBottomRightRadius: 2,
            }}
          />
        </View>
      );

    case 'sun':
      return (
        <View style={styles.center}>
          <View
            style={{
              width: size * 0.5,
              height: size * 0.5,
              borderRadius: size * 0.25,
              backgroundColor: color,
            }}
          />
        </View>
      );

    case 'heart': {
      // Two lobes and a square on its point, which is the only way to a heart
      // without a path. The measurements are whole points from
      // `heartParts`, because rounding each of them separately is what made
      // this lean; see the note there.
      const h = heartParts(size);
      const lobe = {
        position: 'absolute' as const,
        top: 0,
        width: h.lobe.size,
        height: h.lobe.size,
        borderRadius: h.lobe.radius,
        backgroundColor: color,
      };
      return (
        <View style={styles.center}>
          <View style={{ width: h.box.width, height: h.box.height }}>
            <View style={[lobe, { left: h.lobe.leftX }]} />
            <View style={[lobe, { left: h.lobe.rightX }]} />
            <View
              style={{
                position: 'absolute',
                left: h.wedge.x,
                top: h.wedge.y,
                width: h.wedge.size,
                height: h.wedge.size,
                backgroundColor: color,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </View>
        </View>
      );
    }

    case 'clock': {
      // A plain circle clock: a ring and two hands. Not an alarm clock, which
      // at this size is a circle with two bumps on it.
      const c = clockParts(size, bar);
      const hand = { position: 'absolute' as const, backgroundColor: color };
      return (
        <View style={{ width: c.box, height: c.box }}>
          <View
            style={{
              position: 'absolute',
              left: c.ring.offset,
              top: c.ring.offset,
              width: c.ring.size,
              height: c.ring.size,
              borderRadius: c.ring.size / 2,
              borderWidth: c.ring.border,
              borderColor: color,
            }}
          />
          {/* Outside the ring on purpose. Inside it these are measured
              against the ring's content box, which the border has already
              inset, so both hands sat low and left of the middle. */}
          <View
            style={[
              hand,
              {
                left: c.hand.minute.x,
                top: c.hand.minute.y,
                width: c.hand.minute.width,
                height: c.hand.minute.height,
                borderRadius: c.ring.border,
              },
            ]}
          />
          <View
            style={[
              hand,
              {
                left: c.hand.hour.x,
                top: c.hand.hour.y,
                width: c.hand.hour.width,
                height: c.hand.hour.height,
                borderRadius: c.ring.border,
              },
            ]}
          />
        </View>
      );
    }

    case 'sparkle':
      // Four long points and four short ones. The long pair alone was a plus
      // sign, which is what sent Routine off to its own clock glyph.
      return (
        <View style={styles.center}>
          {[
            { w: bar, h: size * 0.8, deg: '0deg' },
            { w: bar, h: size * 0.8, deg: '90deg' },
            { w: bar * 0.8, h: size * 0.46, deg: '45deg' },
            { w: bar * 0.8, h: size * 0.46, deg: '135deg' },
          ].map((arm, i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                width: arm.w,
                height: arm.h,
                borderRadius: arm.w,
                backgroundColor: color,
                transform: [{ rotate: arm.deg }],
              }}
            />
          ))}
        </View>
      );

    case 'car':
      return (
        <View style={styles.center}>
          <View
            style={{
              width: size * 0.74,
              height: size * 0.32,
              borderRadius: size * 0.12,
              backgroundColor: color,
            }}
          />
          <View style={styles.wheels}>
            <View
              style={{
                width: size * 0.18,
                height: size * 0.18,
                borderRadius: size * 0.09,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                width: size * 0.18,
                height: size * 0.18,
                borderRadius: size * 0.09,
                backgroundColor: color,
              }}
            />
          </View>
        </View>
      );

    case 'gift':
      return (
        <View style={styles.center}>
          <View
            style={{
              width: size * 0.66,
              height: size * 0.62,
              borderRadius: 3,
              backgroundColor: color,
            }}
          />
        </View>
      );

    case 'tray':
    default:
      return (
        <View style={styles.center}>
          <View
            style={{
              width: size * 0.7,
              height: size * 0.5,
              borderRadius: 3,
              borderWidth: bar * 0.8,
              borderColor: color,
            }}
          />
        </View>
      );
  }
}

/** The glyph on a tinted rounded badge, which is how it reads as an icon. */
export function CategoryIcon({
  icon,
  shades,
  size = 26,
}: {
  icon: string | null | undefined;
  shades: CategoryShades;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          backgroundColor: shades.fill,
        },
      ]}>
      <Glyph name={icon ?? 'tray'} color={shades.ink} size={size * 0.62} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  wheels: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: -2,
  },
});
