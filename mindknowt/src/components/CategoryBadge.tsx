/**
 * A category as an Ionicons glyph on a tinted rounded tile.
 *
 * Keyed on the category key rather than the `icon` string the row carries.
 * Those strings name the hand drawn glyphs in `CategoryIcon`, which still
 * draws the small badges in the lists; this is the larger, cleaner mark the
 * preset tiles use, and mapping it from the key means a category whose drawn
 * icon is renamed does not quietly lose its tile glyph.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import type { CategoryShades } from '../theme/categoryColors';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const BY_KEY: Record<string, IoniconName> = {
  home: 'home-outline',
  daily: 'sunny-outline',
  care: 'heart-outline',
  ritual: 'repeat-outline',
  go: 'car-outline',
  admin: 'briefcase-outline',
  seasonal: 'leaf-outline',
};

/** A category with no key, or one added by hand, still gets a mark. */
const FALLBACK: IoniconName = 'grid-outline';

export function categoryGlyph(key: string | null | undefined): IoniconName {
  return (key && BY_KEY[key]) || FALLBACK;
}

export function CategoryBadge({
  categoryKey,
  shades,
  size = 44,
}: {
  categoryKey: string | null | undefined;
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
          borderRadius: size * 0.3,
          backgroundColor: shades.fill,
        },
      ]}>
      <Ionicons
        name={categoryGlyph(categoryKey)}
        size={size * 0.52}
        color={shades.ink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
