import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import {
  BAND,
  clockFaceHeight,
  iconSizeForText,
  sizeForMarkRect,
} from './iconMetrics';
import {
  STOP_CHOICES,
  missingFor,
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
  scheduled,
  onChange,
}: {
  value: StopChoice;
  /** Whether a tag is attached. Scan + Alarm needs one to be complete. */
  tagged: boolean;
  /** Whether it has a schedule. Scan + Alarm needs one of those too. */
  scheduled: boolean;
  onChange: (next: StopChoice) => void;
}) {
  const missing = missingFor(value, { tagged, scheduled });

  return (
    <>
      <View style={styles.row}>
        {STOP_CHOICES.map((choice) => {
          const on = value === choice.value;
          // No card is ever disabled. Scan + Alarm used to be, whenever there
          // was no tag, which meant the one mode that needs setting up was the
          // one mode that could not be chosen: it drew gray and the press did
          // nothing at all. Choosing it now goes and gets what it needs.
          const tint = on
            ? theme.color.onHighlight
            : theme.color.textSecondary;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="button"
              accessibilityLabel={choice.label}
              accessibilityHint={choice.detail}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(choice.value)}
              style={[styles.card, on && styles.cardOn]}>
              {/* The same clock and the same tag on all three cards, at the
                  sizes that make the face and the rectangle one height. The
                  row is baseline aligned, and both shapes end on the baseline,
                  so the pair on Scan + Alarm shares a vertical center without
                  being pushed there, sits in an even gap, and centers in the
                  card as a pair. */}
              <View style={styles.glyphs}>
                {choice.icons.map((glyph) => (
                  <Icon
                    key={glyph}
                    name={glyph}
                    size={sizeOf(glyph)}
                    color={tint}
                  />
                ))}
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                style={[styles.label, on && styles.labelOn]}>
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
      {missing ? <Text style={styles.needsTag}>{missing}</Text> : null}
    </>
  );
}

/**
 * Two sizes, so one pair of shapes comes out the same height.
 *
 * `size` sets the em box, and one size for both glyphs matched the wrong
 * thing. The alarm's bells sit above its clock face and the tag's signal
 * waves hang off the corner of its rectangle, so at a shared 17.5 the face
 * drew 12.02 points tall and the rectangle 10.54: the eye compares the face
 * and the rectangle, and they were 12 percent apart.
 *
 * The clock keeps the size it had, from the `lg` text band, and the mark is
 * sized from the height that produces: 20, which puts the rectangle at 12.05
 * against the face's 12.02. Both shapes also sit on the baseline, so equal
 * heights make equal centers, which is why the row needs no nudge to line the
 * pair up on Scan + Alarm.
 */
const CLOCK = iconSizeForText(theme.font.size.lg, BAND.ascender);
const MARK = sizeForMarkRect(clockFaceHeight(CLOCK));

/** The mark is the only glyph on this row that is not an Ionicon. */
const sizeOf = (glyph: string) => (glyph === 'knowtTag' ? MARK : CLOCK);

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
  // Fixed height, so a card holding a pair is exactly as tall as one holding
  // a single glyph and the three stay level. The gap to the label is the
  // card's own, so the three share that too.
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
