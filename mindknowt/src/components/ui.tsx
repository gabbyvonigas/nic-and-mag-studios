import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { CheckIcon, ChevronLeft } from './icons';
import { theme } from '../theme';

/**
 * The `mk.` mark: the letters, with a lime circle and a check as the period.
 *
 * Drawn rather than loaded. The supplied mark is a webp, which iOS will not
 * decode through the standard Image, and drawing it means it stays crisp at
 * any size and uses the app's own rounded face. Same reasoning as every other
 * icon here.
 */
export function MkMark({ size = 15 }: { size?: number }) {
  const dot = Math.round(size * 0.62);
  return (
    <View style={styles.mkRow} accessible accessibilityLabel="MindKnowt">
      <Text style={[styles.mkLetters, { fontSize: size }]}>mk</Text>
      <View
        style={[
          styles.mkDot,
          { width: dot, height: dot, borderRadius: dot / 2 },
        ]}>
        <CheckIcon size={Math.round(dot * 0.72)} thickness={1.8} />
      </View>
    </View>
  );
}

/**
 * The line under a screen title, on Daily, Knowts and Log.
 *
 * It replaces a bare lime rule that sat above the title. That rule was the
 * neon used as decoration, and the direction reserves the color for active
 * states, progress and key actions, so it had no business being a masthead
 * stripe. The mark carries the brand instead and the neon stays inside it.
 */
export function HeaderLockup() {
  return (
    <View style={styles.lockup}>
      <MkMark />
      <Text style={styles.lockupText}>One less thing to carry.</Text>
    </View>
  );
}

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
      <HeaderLockup />
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
  variant?: 'primary' | 'secondary' | 'quiet' | 'highlight';
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
        variant === 'highlight' && styles.buttonHighlight,
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
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: 2,
  },
  lockupText: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  mkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  mkLetters: {
    fontFamily: theme.font.face.medium,
    color: theme.color.textPrimary,
    letterSpacing: -0.4,
  },
  mkDot: {
    backgroundColor: theme.color.highlight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
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
    color: theme.color.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.md,
    color: theme.color.textSecondary,
  },
  // No border. The white against the gray page and the shadow do that job, and
  // a line drawn around a card reads as a line rather than as a card.
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
    ...theme.shadow.card,
  },
  button: {
    backgroundColor: theme.color.primary,
    borderRadius: theme.radius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  // White on the gray page, so it reads as a raised control rather than as a
  // hole. A gray fill would be indistinguishable from the page it sits on.
  buttonSecondary: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  buttonQuiet: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  buttonHighlight: { backgroundColor: theme.color.highlight },
  buttonDisabled: {
    backgroundColor: theme.color.primaryDisabled,
    borderWidth: 0,
  },
  pressed: { opacity: 0.85 },
  buttonText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.lg,
    color: theme.color.onPrimary,
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
    color: theme.color.textPrimary,
  },
  pill: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.xs,
    color: theme.color.textSecondary,
  },
});
