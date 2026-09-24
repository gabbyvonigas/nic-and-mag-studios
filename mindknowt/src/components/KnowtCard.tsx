import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AlarmIcon, CheckIcon, ScanIcon } from './icons';
import { requiresScan } from '../knowts/modes';
import type { KnowtMode } from '../db/types';
import { theme, type CategoryShades } from '../theme';

/**
 * The knowt card, used by Daily and anywhere else a knowt is shown as a card.
 *
 * Knowts does not use it. That screen answers a different question and gets a
 * dense row instead, so the two do not read as one screen shown twice.
 *
 * Every card is the same height wherever it appears, whatever it contains.
 * That is the point: a list of cards that grow and shrink with their content
 * reads as a jumble, and the eye cannot use position to find anything. The
 * same rule holds for the Knowts rows, at their own height.
 *
 * The cost is truncation, and it is deliberate. A card gets one line for the
 * name, one for the schedule, and one shared slot for status. When there is
 * something live to say (snoozed until, rings again at) that wins; otherwise
 * the slot shows where the thing lives. Both clip rather than wrap.
 */

/**
 * Every knowt card in the app is exactly this tall.
 *
 * It was 88, which left the three lines of text swimming in space while the
 * cards themselves ran together. The height came down and the gap between
 * cards went up: the separation belongs between them, not inside them.
 */
export const KNOWT_CARD_HEIGHT = 76;

/**
 * Three bars, filled to the level. Always visible, unlike a marker that only
 * appears when something is urgent, so the absence of urgency is legible too.
 */
export function PriorityBars({
  priority,
  color = theme.color.textMuted,
  size = 12,
}: {
  priority: number;
  color?: string;
  size?: number;
}) {
  const level = Math.max(0, Math.min(2, Math.round(priority)));
  const label = level === 2 ? 'High' : level === 1 ? 'Normal' : 'Low';

  return (
    <View
      accessible
      accessibilityLabel={`${label} priority`}
      style={styles.bars}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={{
            width: 3,
            height: size * (0.5 + index * 0.25),
            borderRadius: 2,
            backgroundColor: index <= level ? color : theme.color.border,
          }}
        />
      ))}
    </View>
  );
}

export type KnowtCardProps = {
  name: string;
  /** Time and repeat, or whatever describes when this happens. */
  meta: string;
  /** The live thing to say. Wins over `location` when present. */
  status?: string | null;
  location?: string | null;
  mode: KnowtMode;
  priority: number;
  shades: CategoryShades;
  done?: boolean;
  onPress: () => void;
  /** Omit to render the card without a completion control. */
  onComplete?: () => void;
};

export function KnowtCard({
  name,
  meta,
  status,
  location,
  mode,
  priority,
  shades,
  done = false,
  onPress,
  onComplete,
}: KnowtCardProps) {
  // One slot, not two. Status is the news; where it lives is the fallback.
  const third = status ?? location ?? null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${done ? ', done' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        done && { backgroundColor: shades.fill },
        pressed && styles.pressed,
      ]}>
      <View
        style={[
          styles.accent,
          { backgroundColor: done ? shades.ink : shades.color },
        ]}
      />

      <View style={styles.body}>
        <View style={styles.titleRow}>
          {requiresScan(mode) ? (
            <ScanIcon size={14} color={shades.ink} thickness={1.5} />
          ) : (
            <AlarmIcon size={14} color={theme.color.textMuted} thickness={1.5} />
          )}
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={[styles.name, done && styles.nameDone]}>
            {name}
          </Text>
          <PriorityBars priority={priority} color={shades.ink} />
        </View>

        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.meta}>
          {meta}
        </Text>

        {/* Rendered even when empty, so the card keeps its height. */}
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.third, status ? { color: shades.ink } : null]}>
          {third ?? ' '}
        </Text>
      </View>

      {onComplete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={done ? `${name} is done` : `Mark ${name} done`}
          hitSlop={10}
          onPress={onComplete}
          style={({ pressed }) => [styles.check, pressed && styles.pressed]}>
          <CheckIcon
            size={26}
            color={done ? shades.color : theme.color.border}
            filled={done}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: KNOWT_CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.md,
    ...theme.shadow.card,
  },
  pressed: { opacity: 0.7 },
  accent: {
    width: 4,
    height: KNOWT_CARD_HEIGHT - theme.spacing.md * 2,
    borderRadius: 2,
  },
  body: { flex: 1, justifyContent: 'center', gap: 2 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  name: {
    flex: 1,
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.lg,
    color: theme.color.textPrimary,
  },
  nameDone: {
    fontFamily: theme.font.face.regular,
    color: theme.color.textSecondary,
  },
  meta: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textSecondary,
  },
  third: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    color: theme.color.textMuted,
  },
  check: { alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
});
