import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../theme';
import type { RootStackParamList } from './types';

/** Height of the capsule itself. */
const BAR_HEIGHT = 60;
/** Gap between the capsule and the screen edges. */
const BAR_INSET = 16;

/**
 * What a scrolling screen must add below its content so the last item is not
 * left sitting under the floating bar. The safe area inset is on top of this
 * and is added by the screen, which is the only place it is known.
 */
export const TAB_BAR_CLEARANCE = BAR_HEIGHT + BAR_INSET * 2;

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * A floating capsule rather than a bar welded to the bottom edge, with the add
 * button as a separate circle beside it. Putting add in the navigation makes it
 * reachable from every screen instead of only from the dashboard, which is
 * where it used to live as a full width button.
 */
export function CapsuleTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const rootNavigation = useNavigation<Nav>();

  return (
    <View
      // Lets touches through the padded area around the capsule, so the bar
      // does not swallow taps on the content behind it.
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, BAR_INSET) },
      ]}>
      <View style={styles.capsule}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key] ?? {};
          const label =
            typeof options?.tabBarLabel === 'string'
              ? options.tabBarLabel
              : (options?.title ?? route.name);
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={label}
              onPress={onPress}
              style={[styles.tab, focused && styles.tabActive]}>
              <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a knowt"
        onPress={() => rootNavigation.navigate('AddKnowt')}
        style={({ pressed }) => [styles.add, pressed && styles.addPressed]}>
        <Text style={styles.addGlyph}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: BAR_INSET,
  },
  capsule: {
    flex: 1,
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: theme.spacing.xs,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: theme.color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.color.border,
    shadowColor: '#0b1220',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  tab: {
    flex: 1,
    height: BAR_HEIGHT - theme.spacing.sm * 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: (BAR_HEIGHT - theme.spacing.sm * 2) / 2,
  },
  tabActive: { backgroundColor: theme.color.surfaceMuted },
  tabLabel: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  tabLabelActive: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
  },
  add: {
    width: BAR_HEIGHT,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.accent,
    shadowColor: '#0b1220',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  addPressed: { opacity: 0.85 },
  addGlyph: {
    fontFamily: theme.font.face.light,
    fontSize: 30,
    lineHeight: 34,
    color: theme.color.onAccent,
  },
});
