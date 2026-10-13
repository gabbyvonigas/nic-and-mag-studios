import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { BAND, iconSizeForText } from './iconMetrics';
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
              {/* One size for every glyph on the row, including the pair.
                  They used to shrink to 15 when there were two of them, which
                  made Scan + Alarm read as two small marks beside two large
                  ones rather than as a mark of its own. `Icon` draws a brand
                  mark and an Ionicon to the same ink height at the same size
                  and both end on the baseline, so the pair stands on one line
                  at the same weight and the same height as a single. */}
              <View style={styles.glyphs}>
                {choice.icons.map((glyph) => (
                  <Icon key={glyph} name={glyph} size={GLYPH} color={tint} />
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
 * Every glyph on the row, pair or single.
 *
 * Sized to the `lg` text band rather than to a number picked by eye, which
 * lands within half a point of the 18 the single glyphs already used, and
 * `Icon` turns that one size into the same ink height and the same baseline
 * for a brand mark and for an Ionicon alike.
 */
const GLYPH = iconSizeForText(theme.font.size.lg, BAND.ascender);

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
