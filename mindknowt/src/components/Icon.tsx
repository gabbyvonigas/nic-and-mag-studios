/**
 * The app's only icon.
 *
 * Every glyph in MindKnowt comes through here. Before this, icons were drawn
 * from plain views one at a time, and they drifted exactly as you would expect:
 * a filled heart next to an outlined house next to a clock with a different
 * stroke weight, all nominally the same size and none of them matching.
 *
 * So there is one set (Ionicons), one style (outline), and one place to add to.
 * Do not import Ionicons anywhere else, and do not build an icon from views.
 * If a glyph is missing, add a name to `ICONS` here.
 *
 * Sizes are named by role rather than given in points at the call site. Two
 * rows that both show a category should not be able to disagree about how big
 * a row icon is, and with a number at each call site they always eventually do.
 *
 * This costs no native rebuild. `@expo/vector-icons` is pure JavaScript and
 * `expo-font` is already linked, being a dependency of `expo` itself.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, type ImageSourcePropType } from 'react-native';

import { theme } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Supplied brand art, and the one allowed exception to "everything is an
 * Ionicon".
 *
 * It is here rather than imported at the call sites for the same reason the
 * Ionicons are: one place that knows what a name looks like, so a screen asks
 * for `knowtTag` and never for a file path. Nothing else in the app may
 * `require` these.
 *
 * Each one is a single color mask with an alpha channel, so it is tinted with
 * `tintColor` exactly as a glyph is tinted with `color`, and callers do not
 * have to know which kind they asked for. The tag mark is #111111 throughout,
 * which is `palette.ink`, so an untinted copy would already be the right color
 * on a white card; it is tinted anyway, because the list rows pass their
 * category's ink and a mask that only happens to be right is not right.
 */
const BRAND_ICONS = {
  /**
   * The MindKnowt tag mark: "this Knowt has a Knowt Tag attached".
   *
   * 512 square. The ink measures 393 by 463 and is centered to within half a
   * pixel (59 and 60 points of padding at the sides, 24 and 25 at top and
   * bottom), so centering the box centers the mark and `resizeMode="contain"`
   * keeps its proportions in any square box.
   */
  knowtTag: require('../../assets/brand/mindknowt-tag-mark.png') as ImageSourcePropType,
} as const;

/**
 * Every glyph the app uses, by what it means rather than what it looks like.
 *
 * The keys on the left are the app's vocabulary, so a category whose stored
 * icon is `house` keeps working if the glyph behind it is ever swapped.
 */
export const ICONS = {
  // Categories, keyed by the strings the database stores.
  house: 'home-outline',
  sun: 'sunny-outline',
  heart: 'heart-outline',
  clock: 'time-outline',
  sparkle: 'sparkles-outline',
  car: 'car-outline',
  gift: 'gift-outline',
  tray: 'file-tray-outline',

  // Alarm states.
  snooze: 'moon-outline',
  ringing: 'alarm-outline',
  test: 'flask-outline',

  // The things the product is about.
  alarm: 'alarm-outline',
  scan: 'scan-outline',
  tag: 'pricetag-outline',
  lock: 'lock-closed-outline',

  // Controls.
  gear: 'settings-outline',
  /** Leaving the app, for a link that opens somewhere else. */
  openLink: 'open-outline',
  plus: 'add',
  check: 'checkmark',
  /**
   * The completion control on a card, in its two states. Filled is the one
   * exception to the outline rule, and it earns it: an empty ring and a solid
   * tick is how "done" reads at a glance, and an outlined tick inside an
   * outlined ring reads as neither.
   */
  circle: 'ellipse-outline',
  circleCheck: 'checkmark-circle',
  pin: 'pin-outline',
  back: 'chevron-back',
  // Preset sets. Each one carries its own mark so a list of twenty eight is
  // scannable; the color around it comes from the set's category.
  tools: 'construct-outline',
  food: 'restaurant-outline',
  trash: 'trash-outline',
  water: 'water-outline',
  vitamins: 'nutrition-outline',
  medical: 'medkit-outline',
  recovery: 'bandage-outline',
  fitness: 'barbell-outline',
  mood: 'happy-outline',
  paw: 'paw-outline',
  leaf: 'leaf-outline',
  cash: 'cash-outline',
  briefcase: 'briefcase-outline',
  errand: 'bag-handle-outline',
  returns: 'return-up-back-outline',
  cart: 'cart-outline',
  car2: 'car-outline',
  plane: 'airplane-outline',
  shield: 'shield-checkmark-outline',
  laptop: 'laptop-outline',
  renew: 'refresh-outline',
  document: 'document-text-outline',
  snow: 'snow-outline',
  thermometer: 'thermometer-outline',
  ball: 'football-outline',
  forward: 'chevron-forward',
  expand: 'chevron-down',
  collapse: 'chevron-up',
} as const satisfies Record<string, IoniconName>;

type IoniconKey = keyof typeof ICONS;
type BrandIconName = keyof typeof BRAND_ICONS;

/**
 * Every icon the app can ask for, whichever kind it turns out to be.
 *
 * One union on purpose. A caller says what it means and `Icon` decides
 * whether that is a glyph or a piece of brand art, so swapping one for the
 * other is a change here and nowhere else.
 */
export type IconName = IoniconKey | BrandIconName;

/**
 * How big an icon is, by what it is doing.
 *
 * `row` is an icon beside a line of text in a list. `header` is one in a screen
 * or section header. `button` is one inside a tappable control. `tile` is the
 * large mark on a preset tile. `hint` is the small one next to fine print.
 */
export const ICON_SIZE = {
  hint: 12,
  row: 16,
  button: 20,
  header: 22,
  tile: 24,
} as const;

export type IconRole = keyof typeof ICON_SIZE;

export function Icon({
  name,
  role = 'row',
  size,
  color = theme.color.textPrimary,
}: {
  name: IconName;
  /** The job it is doing, which decides its size. */
  role?: IconRole;
  /** An exact size, for the rare case a role does not cover. Prefer `role`. */
  size?: number;
  color?: string;
}) {
  const box = size ?? ICON_SIZE[role];

  if (name in BRAND_ICONS) {
    return (
      <Image
        source={BRAND_ICONS[name as BrandIconName]}
        // It is a mask, so inverting it would paint the shape in the
        // background color and lose it.
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        // Square box, square source, so nothing is stretched. The box is not
        // scaled with the text size, for the same reason no other icon here
        // is: a row where one glyph grew and the next did not reads worse than
        // one where neither did. Centering still holds at any text size,
        // because a row with `alignItems: center` centers this against the
        // text's line box rather than against a fixed height.
        style={{ width: box, height: box, tintColor: color }}
      />
    );
  }

  return (
    <Ionicons
      name={ICONS[name as IoniconKey]}
      size={box}
      color={color}
    />
  );
}

/** The glyph for a category's stored icon string, falling back to a safe one. */
export function categoryIconName(icon: string | null | undefined): IconName {
  return icon && icon in ICONS ? (icon as IconName) : 'tray';
}
