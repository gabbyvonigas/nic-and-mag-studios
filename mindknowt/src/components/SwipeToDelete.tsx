import { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { theme } from '../theme';

/**
 * Swipe left on a row to reveal Delete.
 *
 * Built from PanResponder and Animated rather than a Swipeable, because
 * `react-native-gesture-handler` is not in this project and adding it is a
 * native dependency: a twenty minute rebuild for one gesture. This is the same
 * gesture with the same feel and costs nothing.
 *
 * The row is only allowed to move left, and only as far as the button is wide.
 * Past halfway it settles open, otherwise it springs shut, so a half-hearted
 * swipe never leaves the row in a state nobody asked for.
 */
const ACTION_WIDTH = 96;
const OPEN_AT = ACTION_WIDTH / 2;

export function SwipeToDelete({
  onDelete,
  children,
}: {
  onDelete: () => void;
  children: React.ReactNode;
}) {
  const slide = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const settle = (to: number) => {
    openRef.current = to !== 0;
    Animated.spring(slide, {
      toValue: to,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  const responder = useRef(
    PanResponder.create({
      // Horizontal intent only, so the list still scrolls vertically through it.
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_evt, gesture) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        const next = Math.min(0, Math.max(-ACTION_WIDTH, base + gesture.dx));
        slide.setValue(next);
      },
      onPanResponderRelease: (_evt, gesture) => {
        const base = openRef.current ? -ACTION_WIDTH : 0;
        const next = base + gesture.dx;
        settle(next < -OPEN_AT ? -ACTION_WIDTH : 0);
      },
      onPanResponderTerminate: () => settle(0),
    }),
  ).current;

  return (
    <View style={styles.wrap}>
      <View style={styles.actionLayer} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete"
          onPress={() => {
            settle(0);
            onDelete();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
      </View>

      <Animated.View
        {...responder.panHandlers}
        style={{ transform: [{ translateX: slide }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  actionLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  action: {
    width: ACTION_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.xl,
    backgroundColor: theme.color.dangerSurface,
    borderWidth: 1,
    borderColor: theme.color.dangerBorder,
  },
  pressed: { opacity: 0.7 },
  actionText: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.dangerText,
  },
});
