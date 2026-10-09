import { useState, type ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from './Icon';
import { BAND, iconSizeForText } from './iconMetrics';
import { theme } from '../theme';

/**
 * Glyphs are sized to the text they stand beside, never to a number of their
 * own, so a chip or a button is exactly as tall with a glyph as without one.
 */
const CHIP_GLYPH = iconSizeForText(theme.font.size.xs, BAND.chip);
const BUTTON_GLYPH = iconSizeForText(theme.font.size.lg, BAND.ascender);

/**
 * The wordmark, as the supplied artwork.
 *
 * This was drawn in code for a while, because the brand folder held only webp
 * and iOS will not decode one through the standard Image. The file is a PNG
 * now, so the real artwork is what ships: no approximation of the check over
 * the "i", and no drift from the logo everything else uses.
 *
 * Sized by height. The width follows the artwork's own aspect ratio rather
 * than a second number that could disagree with it.
 */
const WORDMARK = require('../../assets/brand/wordmark.png');

/** The artwork's own proportions, from the file's pixel dimensions. */
const WORDMARK_ASPECT = 1352 / 769;

/**
 * The logo's height in the tab header. Only the graphic scales with this: the
 * lime rule is measured from the page name and the spacing is the header's, so
 * resizing the mark leaves everything around it where it was.
 */
const WORDMARK_HEIGHT = 31;

export function Wordmark({ height = WORDMARK_HEIGHT }: { height?: number }) {
  return (
    <Image
      accessible
      accessibilityLabel="MindKnowt"
      source={WORDMARK}
      resizeMode="contain"
      style={{ height, width: height * WORDMARK_ASPECT }}
    />
  );
}

/**
 * The top of Daily, Knowts and Log: wordmark at the left, gear at the right,
 * and a lime rule between the wordmark and the page name.
 *
 * The rule is measured rather than fixed. It matches the width of the title
 * under it, which cannot be known until the title has laid out, so the title
 * reports its width and the rule is drawn from that. A guessed width would be
 * wrong on every word.
 */
export function TabHeader({
  title,
  onSettings,
  children,
}: {
  title: string;
  onSettings: () => void;
  /** Anything that belongs beside the title, such as a Today button. */
  children?: ReactNode;
}) {
  const [titleWidth, setTitleWidth] = useState(0);

  return (
    <View style={styles.tabHeader}>
      <View style={styles.tabHeaderTop}>
        <Wordmark />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={12}
          onPress={onSettings}
          style={({ pressed }) => [styles.tabGear, pressed && styles.pressed]}>
          <Icon name="gear" role="header" />
        </Pressable>
      </View>

      <View
        style={[
          styles.tabRule,
          // Zero until the title has measured, so it never flashes at a
          // width it is about to stop having.
          { width: titleWidth },
        ]}
      />

      <View style={styles.tabTitleRow}>
        <Text
          onLayout={(event) => setTitleWidth(event.nativeEvent.layout.width)}
          style={styles.title}>
          {title}
        </Text>
        {children}
      </View>
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
  icon,
  iconColor,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'highlight';
  disabled?: boolean;
  /** A glyph left of the label, for the one action that has a mark of its own. */
  icon?: IconName;
  /** Its tint. Defaults to the label's color. */
  iconColor?: string;
}) {
  const labelColor =
    variant === 'primary' ? theme.color.onPrimary : theme.color.textPrimary;
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
      {/* An inner row, so the glyph can stand on the label's baseline while
          the pair stays centered in the button. Baseline alignment on the
          button itself would align the pair to the top of 52 points. */}
      <View style={styles.buttonInner}>
        {icon ? (
          <Icon
            name={icon}
            size={BUTTON_GLYPH}
            color={iconColor ?? labelColor}
          />
        ) : null}
        <Text
          style={[
            styles.buttonText,
            variant !== 'primary' && styles.buttonTextDark,
          ]}>
          {label}
        </Text>
      </View>
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
          <Icon name="back" role="header" />
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

/**
 * A small labeled chip.
 *
 * `icon` is for the one case that earns a glyph: the tagged state, which shows
 * the brand tag mark so the chip reads the same as the row on the Knowts list.
 *
 * It is sized to the chip's own word, cap height and a little, and never to a
 * number of its own. An 18 point glyph beside 13 point text was taller than
 * the line the text drew, so the one chip with a glyph stood about two and a
 * half points above the chips next to it and looked looser inside. Every chip
 * is now exactly as tall as its text, which is the same text everywhere.
 */
export function Pill({
  label,
  color,
  icon,
}: {
  label: string;
  color?: string;
  icon?: IconName;
}) {
  const tint = color ?? theme.color.textPrimary;
  return (
    <View style={[styles.pill, color ? { borderColor: color } : null]}>
      {icon ? <Icon name={icon} size={CHIP_GLYPH} color={tint} /> : null}
      <Text style={[styles.pillText, color ? { color } : null]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: theme.spacing.xs, marginBottom: theme.spacing.lg },
  tabHeader: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  tabHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tabGear: { paddingLeft: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  tabRule: {
    height: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.highlight,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  tabTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.sm,
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
    flexDirection: 'row',
    // The glyph stands on the word's baseline rather than floating on the
    // middle of its line box.
    alignItems: 'baseline',
    gap: theme.spacing.xs,
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
