import { useRef } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ACTION_WIDTH, dragTo, isHorizontal, settleTo } from './swipeGeometry';
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
 * The thresholds are in `swipeGeometry.ts` so they can be asserted.
 *
 * `spacing` is the gap below the row, and it belongs to this wrapper rather
 * than to the row inside it. That is not a style preference. The Delete button
 * is absolutely positioned to fill this wrapper, so a margin on the child made
 * the wrapper taller than the row it was measuring against, and the button
 * poked out below every row: a pale pink rounded rectangle sitting under a
 * pale pink row, which read as each row being drawn twice.
 */
export function SwipeToDelete({
  onDelete,
  spacing = 0,
  children,
}: {
  onDelete: () => void;
  /** Gap below the row. Owned here; the child must carry no vertical margin. */
  spacing?: number;
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
        isHorizontal(gesture.dx, gesture.dy),
      onPanResponderMove: (_evt, gesture) => {
        slide.setValue(dragTo(openRef.current, gesture.dx));
      },
      onPanResponderRelease: (_evt, gesture) => {
        settle(settleTo(openRef.current, gesture.dx));
      },
      onPanResponderTerminate: () => settle(0),
    }),
  ).current;

  return (
    <View style={[styles.wrap, { marginBottom: spacing }]}>
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
  // Clipped, so the button can only ever be seen through the gap the row
  // leaves as it slides. The radius matches the row's.
  wrap: {
    justifyContent: 'center',
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
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
    borderRadius: theme.radius.lg,
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
