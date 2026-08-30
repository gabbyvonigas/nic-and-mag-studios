import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

/**
 * Press-and-hold for a fixed duration. Releasing early resets to zero, so the
 * hold has to be deliberate and uninterrupted.
 *
 * TODO(native): add expo-haptics on start, completion and cancel. It is a
 * native module, so it waits for the next build that needs one anyway.
 */
export function HoldToConfirm({
  label,
  holdMs,
  disabled,
  onComplete,
}: {
  label: string;
  holdMs: number;
  disabled?: boolean;
  onComplete: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);

  const start = () => {
    if (disabled) return;
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      // Animating width cannot run on the native driver.
      useNativeDriver: false,
    });
    animation.current.start(({ finished }) => {
      if (finished) {
        progress.setValue(0);
        onComplete();
      }
    });
  };

  const cancel = () => {
    animation.current?.stop();
    animation.current = null;
    progress.setValue(0);
  };

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={`Hold for ${Math.round(holdMs / 1000)} seconds`}
      onPressIn={start}
      onPressOut={cancel}
      disabled={disabled}
      style={[styles.container, disabled && styles.disabled]}>
      <Animated.View style={[styles.fill, { width }]} />
      <Text style={[styles.label, disabled && styles.labelDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.dangerBorder,
    backgroundColor: theme.color.dangerSurface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  disabled: {
    borderColor: theme.color.border,
    backgroundColor: theme.color.surfaceMuted,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: theme.color.dangerBorder,
  },
  label: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.dangerText,
  },
  labelDisabled: { color: theme.color.textMuted },
});
