/**
 * How the Log says a time and a duration.
 *
 * Separate from the panel that draws them, and free of imports, so the noon and
 * midnight cases can be asserted off device. Both are where a 12 hour clock
 * goes wrong: hour 0 and hour 12 are both "12", and only one of them is pm.
 */

/** 12am, 11am, 4pm. */
export function hourName(hour: number): string {
  const wrapped = ((Math.trunc(hour) % 24) + 24) % 24;
  if (wrapped === 0) return '12am';
  if (wrapped === 12) return '12pm';
  return wrapped < 12 ? `${wrapped}am` : `${wrapped - 12}pm`;
}

/** The peak window, which is two hours wide, so it reads as a range. */
export function hourRange(hour: number): string {
  return `${hourName(hour)} to ${hourName(hour + 2)}`;
}

/**
 * Minutes, said the way a person would say them.
 *
 * Rounded to the minute. A mean of 4.3 minutes is not more useful with the
 * decimal, and putting one there implies the number is more exact than the
 * sample behind it.
 */
export function durationLabel(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '-';
  if (minutes < 1) return 'Under a minute';

  // Rounded before the branch, not inside it. Rounding after deciding that 59.7
  // is under an hour prints "60 min", and 119.8 prints "1 hr 60 min".
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;

  const hours = Math.floor(rounded / 60);
  const rest = rounded - hours * 60;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}
