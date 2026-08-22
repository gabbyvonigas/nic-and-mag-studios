import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { theme } from '../theme';

export function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'quiet' && styles.buttonQuiet,
        pressed && styles.pressed,
        disabled && styles.buttonDisabled,
      ]}>
      <Text
        style={[
          styles.buttonText,
          variant !== 'primary' && styles.buttonTextDark,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Spec section 8: empty screens invite action rather than explain absence. */
export function EmptyState({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction}>
          <Text style={styles.link}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Pill({ label, color }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, color ? { borderColor: color } : null]}>
      <Text style={[styles.pillText, color ? { color } : null]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.xs, marginBottom: theme.spacing.lg },
  title: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.display,
    fontWeight: theme.font.weight.bold,
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  button: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  buttonSecondary: { backgroundColor: theme.color.surfaceMuted },
  buttonQuiet: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  buttonDisabled: { backgroundColor: theme.color.accentDisabled },
  pressed: { opacity: 0.85 },
  buttonText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.onAccent,
  },
  buttonTextDark: { color: theme.color.textPrimary },
  empty: { gap: theme.spacing.sm, paddingVertical: theme.spacing.xl },
  emptyText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textMuted,
  },
  link: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textPrimary,
  },
  pill: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    fontWeight: theme.font.weight.medium,
    color: theme.color.textSecondary,
  },
});
