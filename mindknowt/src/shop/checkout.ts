/**
 * Opening a checkout.
 *
 * This is the swappable surface, kept to one small file on purpose. Today it
 * hands the URL to iOS, which is what the Amazon reorder link already does and
 * what lets the whole flow be tested over Metro without a native rebuild.
 * Replacing it with an in-app sheet, either `expo-web-browser` or Shopify's
 * Checkout Sheet Kit, is a change to this file and nothing else. The rule for
 * what counts as openable lives in `checkoutUrl.ts`, which stays testable.
 *
 * Worth knowing before that swap happens: handing the URL to Safari means the
 * app never learns whether the order went through. `src/shop/freeTags.ts`
 * records that checkout was opened rather than that anything was bought, which
 * is all this surface can honestly support. A sheet reports completion, and
 * that is the real reason to move to one.
 */
import { Linking } from 'react-native';

import { isOpenableCheckout } from './checkoutUrl';
import { ShopError } from './types';

/** Hands the checkout to iOS. Throws rather than failing quietly. */
export async function openCheckout(url: string): Promise<void> {
  if (!isOpenableCheckout(url)) {
    throw new ShopError('malformed', 'That checkout link could not be opened.');
  }

  try {
    await Linking.openURL(url);
  } catch (err) {
    const name = err instanceof Error ? err.constructor.name : typeof err;
    throw new ShopError('network', `Nothing on this phone would open checkout (${name}).`);
  }
}
