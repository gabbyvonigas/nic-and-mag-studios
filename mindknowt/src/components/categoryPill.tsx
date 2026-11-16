/**
 * One look for every pill-shaped category element in the app.
 *
 * There were four of them and they had four looks: the detail screen's chip
 * was white with a ringed dot, the Knowts filter row was white with a ringless
 * dot that made Daily invisible, the Apply set chip was a pale tint of the
 * category with no border at all, and each had its own dot size, gap and
 * padding. Nothing was wrong with any one of them on its own screen, which is
 * exactly how four of them happened.
 *
 * So the look lives here and nowhere else. A pill spreads `categoryPillShell`
 * and draws its dot with `CategoryPillDot`, and the only thing it decides for
 * itself is its height, because the jobs genuinely differ: the detail chip is
 * 21.6 points and lines up with the Mode and tag chips beside it, and a filter
 * pill is a control a thumb has to hit. Vertical padding and font size are
 * therefore each pill's own and everything else is not.
 *
 * `categorypills.test.ts` reads the three style blocks and fails if any of them
 * stops matching, so this cannot quietly become four looks again.
 */
import { View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { CategoryDot } from './KnowtCard';
import { theme, type CategoryShades } from '../theme';

/** The shared values, named so a test can read them rather than quote them. */
export const CATEGORY_PILL = {
  /** The dot's diameter. */
  dot: 7,
  /** Dot to label. */
  gap: theme.spacing.sm,
  /** Left and right. Vertical padding is each pill's own. */
  paddingHorizontal: theme.spacing.md,
  borderWidth: 1,
  /**
   * The label, for every pill and every category. 11.37 to 1 on white, which
   * is the point: a swatch drawn as text is under 4.5 for five of the seven
   * and 1.09 for Daily, so the color goes in the dot and the words do not
   * carry it.
   */
  labelColor: theme.color.textSecondary,
  /**
   * One name for the family, so the three cannot drift. All four
   * `theme.font.face` entries are the same private rounded family, so this is
   * a single source of truth rather than a visible weight.
   */
  labelFont: theme.font.face.medium,
} as const;

/** The shell: fill, border, radius and horizontal padding. */
export const categoryPillShell = {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: theme.color.surface,
  borderWidth: CATEGORY_PILL.borderWidth,
  borderColor: theme.color.border,
  borderRadius: theme.radius.pill,
  paddingHorizontal: CATEGORY_PILL.paddingHorizontal,
} as const satisfies ViewStyle;

/**
 * The dot, with the gap after it.
 *
 * `CategoryDot` rather than a rounded View, because the ring is what makes a
 * pale swatch visible instead of darkening it: Daily is the brand lime and
 * measures 1.19 against a white card, so a plain lime dot is not there at all.
 *
 * `ring` is for a pill whose fill is not white. On the selected filter pill the
 * fill is near black, where the category's own ink disappears and the darker
 * swatches go with it: burgundy measures 2.11 on it. A white hairline carries
 * the dot there the same way the ink one carries it on white.
 *
 * In a wrapper, not with `alignSelf` on the dot itself, because the detail
 * chip's row aligns on the baseline for its glyph's sake and a View with no
 * text in it would otherwise stand on that line rather than sit on it.
 */
export function CategoryPillDot({
  shades,
  ring,
}: {
  shades: CategoryShades;
  ring?: string;
}) {
  return (
    <View style={{ alignSelf: 'center', marginRight: CATEGORY_PILL.gap }}>
      <CategoryDot shades={shades} size={CATEGORY_PILL.dot} ring={ring} />
    </View>
  );
}
