import { StyleSheet, View } from 'react-native';

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

    case 'heart':
      // Two lobes and a rotated square, which is the only way to a heart
      // without a path.
      return (
        <View style={styles.center}>
          <View style={{ width: size * 0.78, height: size * 0.7 }}>
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: size * 0.44,
                height: size * 0.44,
                borderRadius: size * 0.22,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                width: size * 0.44,
                height: size * 0.44,
                borderRadius: size * 0.22,
                backgroundColor: color,
              }}
            />
            <View
              style={{
                position: 'absolute',
                left: size * 0.17,
                top: size * 0.17,
                width: size * 0.44,
                height: size * 0.44,
                backgroundColor: color,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </View>
        </View>
      );

    case 'clock':
      // Routine is time shaped, so a clock face: a ring with two hands. It was
      // drawn as `sparkle`, which is a vertical bar crossed by a horizontal
      // one, and at this size that is a plus sign and nothing else.
      return (
        <View style={styles.center}>
          <View
            style={{
              width: size * 0.82,
              height: size * 0.82,
              borderRadius: size * 0.41,
              borderWidth: bar,
              borderColor: color,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            {/* The hands meet at the center, so each is anchored there and
                runs outward rather than being centered on it. */}
            <View
              style={{
                position: 'absolute',
                width: bar,
                height: size * 0.26,
                borderRadius: bar,
                backgroundColor: color,
                top: size * 0.15,
              }}
            />
            <View
              style={{
                position: 'absolute',
                width: size * 0.2,
                height: bar,
                borderRadius: bar,
                backgroundColor: color,
                left: size * 0.41 - bar / 2,
              }}
            />
          </View>
        </View>
      );

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
