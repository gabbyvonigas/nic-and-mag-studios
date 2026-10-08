import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { TIMING_OPTIONS, type Timing } from '../knowts/scanOnly';
import { theme } from '../theme';

export type { Timing };

/**
 * Two options side by side, each saying what it does.
 *
 * Only the drawing is here. The words are in `knowts/scanOnly.ts`, where they
 * can be asserted and where both editors read them from, so the choice cannot
 * be worded one way on one screen and another way on the other.
 */

export function TimingChoice({
  value,
  onChange,
}: {
  value: Timing;
  onChange: (next: Timing) => void;
}) {
  return (
    <View style={styles.row}>
      {TIMING_OPTIONS.map((option) => {
        const on = value === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.id)}
            style={[styles.card, on && styles.cardOn]}>
            <Icon
              name={option.icon}
              size={20}
              color={on ? theme.color.onHighlight : theme.color.textPrimary}
            />
            <Text style={[styles.label, on && styles.labelOn]}>
              {option.label}
            </Text>
            <Text style={[styles.detail, on && styles.detailOn]}>
              {option.detail}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  card: {
    flex: 1,
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
  },
  cardOn: {
    backgroundColor: theme.color.highlight,
    borderColor: theme.color.highlight,
  },
  label: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    color: theme.color.textPrimary,
  },
  labelOn: { color: theme.color.onHighlight },
  detail: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.xs,
    lineHeight: 17,
    color: theme.color.textMuted,
  },
  // Charcoal on the lime, where the muted gray measures 4.22 and does not
  // carry at this size.
  detailOn: { color: theme.color.textSecondary },
});
