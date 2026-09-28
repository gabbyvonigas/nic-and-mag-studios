/**
 * The time wheel's measurements and its value arithmetic.
 *
 * Split out from the component so both can be asserted off device. The layout
 * half matters because of a real bug: a vertical `ScrollView` carries
 * `flexGrow: 1` in its own base style, and `StyleSheet.compose(baseStyle,
 * props.style)` keeps it unless the caller sets it too. A `width` on the column
 * then acts only as a flex basis, every column stretches to a third of the
 * screen, and the three wheels drift so far apart that the selected time stops
 * reading as one value. The widths here are only real if the component also
 * pins `flexGrow` to 0.
 */

export type WheelSize = {
  itemHeight: number;
  /** Odd, so one row sits centered with equal space above and below. */
  rows: number;
  hourWidth: number;
  minuteWidth: number;
  meridiemWidth: number;
  /** The colon between hour and minute. */
  separatorWidth: number;
  /**
   * Mirrors `theme.font.size.xl` and `.md`. Copied rather than imported
   * because the theme pulls in React Native for `Platform`, and nothing that
   * does can be loaded by the node test runner. If the scale moves, these move
   * with it.
   */
  fontSize: number;
};

export const FULL: WheelSize = {
  itemHeight: 44,
  rows: 5,
  hourWidth: 54,
  minuteWidth: 54,
  meridiemWidth: 46,
  separatorWidth: 14,
  fontSize: 22,
};

export const COMPACT: WheelSize = {
  itemHeight: 32,
  rows: 3,
  hourWidth: 40,
  minuteWidth: 40,
  meridiemWidth: 36,
  separatorWidth: 10,
  fontSize: 16,
};

/** The whole control's width. The three columns and the colon, nothing else. */
export function wheelWidth(size: WheelSize): number {
  return (
    size.hourWidth +
    size.separatorWidth +
    size.minuteWidth +
    size.meridiemWidth
  );
}

/** Blank rows above and below, so the first and last value can reach center. */
export function wheelPadding(size: WheelSize): number {
  return ((size.rows - 1) / 2) * size.itemHeight;
}

/** Where a column sits from the left edge of the control. */
export function columnOffset(
  size: WheelSize,
  column: 'hour' | 'separator' | 'minute' | 'meridiem',
): number {
  if (column === 'hour') return 0;
  if (column === 'separator') return size.hourWidth;
  if (column === 'minute') return size.hourWidth + size.separatorWidth;
  return size.hourWidth + size.separatorWidth + size.minuteWidth;
}

/** Which row a scroll offset has landed on, clamped to the values that exist. */
export function indexFromOffset(
  y: number,
  size: WheelSize,
  count: number,
): number {
  const raw = Math.round(y / size.itemHeight);
  // A rubber band scroll reports an offset past either end, and an offset that
  // is not a number would index nothing at all.
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(count - 1, raw));
}

export type TimeParts = { hour12: number; minute: number; isPm: boolean };

/**
 * Reads the 24 hour `HH:MM` that is the only format ever stored.
 *
 * Every caller passes a real time today, so the fallback is a guard rather
 * than a path anyone takes. It has to be a guard that fails loudly though:
 * `Number('')` is 0, so a missing hour parsed the lazy way becomes midnight,
 * and a midnight alarm nobody asked for is exactly the kind of invented
 * default this project does not ship.
 */
export function partsOf(value: string, fallbackHour = 8): TimeParts {
  const match = /^\s*(\d{1,2}):(\d{1,2})\s*$/.exec(value ?? '');
  const rawHour = match ? Number(match[1]) : Number.NaN;
  const rawMinute = match ? Number(match[2]) : Number.NaN;

  const hour24 = rawHour >= 0 && rawHour < 24 ? rawHour : fallbackHour;
  const minute = rawMinute >= 0 && rawMinute < 60 ? rawMinute : 0;

  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    isPm: hour24 >= 12,
  };
}

/** Writes it back. 12 am is midnight and 12 pm is noon, which is the one
 * case where the obvious arithmetic is wrong. */
export function timeFrom({ hour12, minute, isPm }: TimeParts): string {
  const hour24 = isPm ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12;
  return `${`${hour24}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
}
