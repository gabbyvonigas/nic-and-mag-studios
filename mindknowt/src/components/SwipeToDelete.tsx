import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ACTION_WIDTH, dragTo, isHorizontal, settleTo } from './swipeGeometry';
import { claimOpen, releaseOpen } from './swipeRegistry';
import { theme } from '../theme';

/**
 * Swipe left on a row to reveal Delete.
 *
 * Built from PanResponder and Animated rather than a Swipeable, because
 * `react-native-gesture-handler` is not in this project and adding it is a
 * native dependency: a twenty minute rebuild for one gesture.
 *
 * **The row used to flash Delete and snap shut again**, and the reason is a
 * default. `onPanResponderTerminationRequest` returns true unless you say
 * otherwise, which means any other responder may take the gesture away at any
 * moment. The list this sits in is a ScrollView, and it asks. The row then got
 * `onPanResponderTerminate`, which sprang it back to zero, so the gesture was
 * being handed to the scroll view mid swipe and the row closed itself on the
 * way out. Refusing the request is the fix; blocking the native responder on
 * top of it stops the list scrolling under a swipe that has already started.
 *
 * Terminating no longer means closing either. If the gesture really is taken,
 * the row returns to whichever state it was in, rather than assuming shut.
 *
 * The row is only allowed to move left, and only as far as the button is wide.
 * The thresholds are in `swipeGeometry.ts` so they can be asserted, and which
 * row is open is in `swipeRegistry.ts` for the same reason.
 *
 * `spacing` is the gap below the row, and it belongs to this wrapper rather
 * than to the row inside it. That is not a style preference. The Delete button
 * is absolutely positioned to fill this wrapper, so a margin on the child made
 * the wrapper taller than the row it was measuring against, and the button
 * poked out below every row.
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
  // Mirrors `openRef` for rendering. The ref is what the gesture reads, because
  // a PanResponder is built once and would capture a stale state value.
  const [open, setOpen] = useState(false);

  const settle = useCallback(
    (to: number) => {
      const nowOpen = to !== 0;
      openRef.current = nowOpen;
      setOpen(nowOpen);
      Animated.spring(slide, {
        toValue: to,
        useNativeDriver: true,
        bounciness: 0,
        speed: 18,
      }).start();
    },
    [slide],
  );

  const close = useCallback(() => settle(0), [settle]);

  // Only one row open at a time, and nothing left open behind us.
  useEffect(() => {
    if (open) claimOpen(close);
    else releaseOpen(close);
  }, [open, close]);

  useEffect(() => () => releaseOpen(close), [close]);

  const responder = useRef(
    PanResponder.create({
      // A tap is not a swipe. Taking the gesture on start would eat every press
      // on the row behind it.
      onStartShouldSetPanResponder: () => false,
      // Horizontal intent only, so the list still scrolls vertically through it.
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        isHorizontal(gesture.dx, gesture.dy),
      onPanResponderMove: (_evt, gesture) => {
        slide.setValue(dragTo(openRef.current, gesture.dx));
      },
      onPanResponderRelease: (_evt, gesture) => {
        settle(settleTo(openRef.current, gesture.dx));
      },
      // The two lines that keep a swipe from being stolen by the list.
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      // If it is taken anyway, go back to where the row actually was. Assuming
      // shut is what made an open row close itself.
      onPanResponderTerminate: () =>
        settle(openRef.current ? -ACTION_WIDTH : 0),
    }),
  ).current;

  return (
    <View style={[styles.wrap, { marginBottom: spacing }]}>
      <View style={styles.actionLayer} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete"
          onPress={() => {
            close();
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
        {/* While open, a tap anywhere on the row closes it instead of opening
            the knowt. That is what "tap elsewhere" means on a row that is
            covering its own content with a delete button. */}
        {open ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close delete"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
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
