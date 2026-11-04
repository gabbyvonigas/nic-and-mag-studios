/**
 * A category's glyph on its tinted badge.
 *
 * The glyph used to be drawn here from plain views, one `case` per category,
 * and that is where the mismatch came from: the heart was filled, the house was
 * outlined, and each had its own stroke weight. It is one Ionicon now, like
 * everything else. The badge, the tint and the sizing API are unchanged, so
 * every list that draws one did not have to move.
 */
import { StyleSheet, View } from 'react-native';

import { Icon, categoryIconName } from './Icon';
import type { CategoryShades } from '../theme/categoryColors';

export function CategoryIcon({
  icon,
  shades,
  size = 26,
  /** A solid circle in the category color with a white glyph, for tiles. */
  solid = false,
}: {
  icon: string | null | undefined;
  shades: CategoryShades;
  size?: number;
  solid?: boolean;
}) {
  return (
    <View
      style={[
        styles.badge,
        {
          width: size,
          height: size,
          borderRadius: solid ? size / 2 : size * 0.32,
          backgroundColor: solid ? shades.color : shades.fill,
        },
      ]}>
      <Icon
        name={categoryIconName(icon)}
        size={size * 0.56}
        color={solid ? '#FFFFFF' : shades.ink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
