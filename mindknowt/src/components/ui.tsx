import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { ChevronLeft } from './icons';
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

/**
 * Header for anything that is not a top-level tab. The back control is always
 * visible and always in the same place: the edge swipe alone is not an
 * affordance, because nothing on screen says it exists.
 *
 * `action` renders opposite the back control, for a screen that needs one thing
 * in the corner.
 */
export function SubScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  action,
}: {
  title?: string;
  subtitle?: string;
  onBack: () => void;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.subHeader}>
      <View style={styles.subHeaderTop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={12}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <ChevronLeft />
          <Text style={styles.backLabel}>{backLabel}</Text>
        </Pressable>
        {/* Its own slot, so neither control can grow across the other however
            long the back label or the action gets. */}
        {action ? <View style={styles.headerAction}>{action}</View> : null}
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
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
  subHeader: { gap: theme.spacing.xs, marginBottom: theme.spacing.lg },
  subHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    marginBottom: theme.spacing.xs,
  },
  backButton: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
  },
  headerAction: {
    flexShrink: 0,
    marginLeft: theme.spacing.md,
    alignItems: 'flex-end',
  },
  backLabel: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
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
