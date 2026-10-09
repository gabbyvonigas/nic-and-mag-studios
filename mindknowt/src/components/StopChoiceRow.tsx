import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import {
  NEEDS_TAG_NOTE,
  STOP_CHOICES,
  stopChoice,
  type StopChoice,
} from '../knowts/modes';
import { theme } from '../theme';

/**
 * The three ways a Knowt can stop, in one row.
 *
 * One component for all three screens that ask, because the question is asked
 * when a Knowt is created, when it is edited and from its own detail screen,
 * and a choice worded or sized one way on one screen and another way on the
 * next is three features as far as the person is concerned. The words are in
 * `knowts/modes.ts`, where they can be asserted.
 *
 * **The width is the constraint.** Three cards share the row, which on a 375pt
 * iPhone leaves roughly 100pt of text each, and "Scan + Alarm" measures about
 * 85pt at 14pt. That is a fit with little to spare, so three things hold it:
 * the icon sits above the label rather than beside it, so it takes none of that
 * width; the label is held to one line and allowed to shrink to 0.85 rather
 * than truncate; and `lineHeight` is fixed, so a card whose label shrank is
 * still exactly as tall as the other two.
 */
export function StopChoiceRow({
  value,
  tagged,
  onChange,
}: {
  value: StopChoice;
  /** Whether a tag is attached. Scan + Alarm cannot be chosen without one. */
  tagged: boolean;
  onChange: (next: StopChoice) => void;
}) {
  return (
    <>
      <View style={styles.row}>
        {STOP_CHOICES.map((choice) => {
          const on = value === choice.value;
          const blocked = choice.needsTag && !tagged;
          const tint = blocked
            ? theme.color.textMuted
            : on
              ? theme.color.onHighlight
              : theme.color.textSecondary;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              accessibilityHint={choice.detail}
              accessibilityState={{ selected: on, disabled: blocked }}
              disabled={blocked}
              onPress={() => onChange(choice.value)}
              style={[
                styles.card,
                on && styles.cardOn,
                blocked && styles.cardBlocked,
              ]}>
              {/* One glyph, or two smaller ones side by side for Scan +
                  Alarm, which is both. Sized so a pair occupies about the
                  same width as a single, and held in a fixed height row so
                  every card is the same height whichever it got. The mark and
                  the alarm are drawn to the same ink height at the same size
                  and both end on the baseline, so a pair stands on one line
                  and neither looks taller or lighter than the other. */}
              <View style={styles.glyphs}>
                {choice.icons.map((glyph) => (
                  <Icon
                    key={glyph}
                    name={glyph}
                    size={choice.icons.length > 1 ? 15 : 18}
                    color={tint}
                  />
                ))}
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={[
                  styles.label,
                  on && styles.labelOn,
                  blocked && styles.labelBlocked,
                ]}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* The chosen option explains itself, under the row rather than inside
          three columns a hundred points wide each.

          Emphasized by ink and size, not by weight. `fontWeight` does nothing
          useful with the rounded family: RCTFont.mm resolves the private
          family name to the regular face and then matches the weight against
          plain San Francisco, so asking for bold either changes nothing or
          silently drops the rounding. Real bold needs the SF Pro Rounded faces
          bundled through expo-font, which is native and costs a build. */}
      <Text style={styles.support}>{stopChoice(value).detail}</Text>
      {value === 'both' && !tagged ? (
        <Text style={styles.needsTag}>{NEEDS_TAG_NOTE}</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    // No horizontal padding on purpose: every point of it comes off the label,
    // and "Scan + Alarm" has none to spare.
  },
  cardOn: {
    backgroundColor: theme.color.highlight,
    borderColor: theme.color.highlight,
  },
  cardBlocked: { backgroundColor: theme.color.surfaceMuted },
  // Fixed height, so a card holding two small glyphs is exactly as tall as
  // one holding a single larger glyph and the three stay level.
  glyphs: {
    flexDirection: 'row',
    // One bottom line for both, and the pair centered as a pair.
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 3,
    height: 22,
  },
  label: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.sm,
    // Fixed, so a label that shrank to fit still leaves its card the same
    // height as the other two.
    lineHeight: 18,
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  labelOn: { color: theme.color.onHighlight },
  labelBlocked: { color: theme.color.textMuted },
  support: {
    fontFamily: theme.font.face.medium,
    fontSize: theme.font.size.md,
    lineHeight: 22,
    color: theme.color.textPrimary,
    marginTop: theme.spacing.xs,
  },
  needsTag: {
    fontFamily: theme.font.face.regular,
    fontSize: theme.font.size.sm,
    lineHeight: 19,
    color: theme.color.warningText,
  },
});
