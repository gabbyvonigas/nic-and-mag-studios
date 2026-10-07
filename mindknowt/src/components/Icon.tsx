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

import { theme } from '../theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

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

  // The things the product is about.
  alarm: 'alarm-outline',
  scan: 'scan-outline',
  tag: 'pricetag-outline',
  lock: 'lock-closed-outline',

  // Controls.
  gear: 'settings-outline',
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

export type IconName = keyof typeof ICONS;

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
  return (
    <Ionicons
      name={ICONS[name]}
      size={size ?? ICON_SIZE[role]}
      color={color}
    />
  );
}

/** The glyph for a category's stored icon string, falling back to a safe one. */
export function categoryIconName(icon: string | null | undefined): IconName {
  return icon && icon in ICONS ? (icon as IconName) : 'tray';
}
