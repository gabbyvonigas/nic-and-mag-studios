import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { theme } from '../theme';

/**
 * Pin to the top of the Knowts tab.
 *
 * Offered for every mode, not only Scan Knowt. A pinned Scan Knowt is the case
 * that needs it most, since it is scanned from the list rather than reached
 * from Daily, but nothing about pinning is specific to it and hiding the
 * control on the other two would be a rule with no reason behind it.
 *
 * `is_pinned` already existed, added at schema 13, so this needed no column
 * and no migration. What it did not have was a labeled control: the only way
 * to pin was a long press on a row, which is a shortcut rather than an
 * affordance, and a button in the detail screen's actions list next to Archive
 * and Delete, where it read as something destructive.
 */
export function PinToggle({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Pin to top of Knowts"
      accessibilityState={{ checked: pinned }}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.row,
        pinned && styles.rowOn,
        pressed && styles.pressed,
      ]}>
      <Icon
        name="pin"
        role="button"
        color={pinned ? theme.color.onHighlight : theme.color.textSecondary}
      />
      <Text style={[styles.label, pinned && styles.labelOn]}>
        Pin to top of Knowts
      </Text>
      <Icon
        name={pinned ? 'circleCheck' : 'circle'}
        role="button"
        color={pinned ? theme.color.onHighlight : theme.color.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  rowOn: {
    backgroundColor: theme.color.highlight,
    borderColor: theme.color.highlight,
  },
  pressed: { opacity: 0.7 },
  label: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    color: theme.color.textPrimary,
  },
  labelOn: { color: theme.color.onHighlight },
});
