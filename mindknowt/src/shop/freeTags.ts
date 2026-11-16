/**
 * The free starter pack: what state the claim is in, and starting a checkout.
 *
 * This replaces the Airtable form. Shopify checkout collects the shipping
 * address itself, so the form, its validation and its token are gone rather
 * than ported: there is no longer anywhere in this app that handles a postal
 * address.
 *
 * What this cannot do, and the reason the state below says "opened" rather
 * than "claimed": handing checkout to Safari means the app never hears the
 * outcome. An in-app sheet does, and that is the thing to change if the
 * distinction starts to matter. Until then nothing here claims to know more
 * than it does.
 */
import { getAppMeta, setAppMeta } from '../db';
import { FREE_PACK_HANDLE, SHOP_CONFIG } from './config';
import { openCheckout } from './checkout';
import { fetchVariant, startCheckout } from './storefront';
import { ShopError } from './types';

/** Written by the old Airtable flow. Still honored, so nobody is asked twice. */
export const CLAIMED_AT = 'tag_claim_submitted_at';

/** Written when a Shopify checkout is opened for the starter pack. */
export const CHECKOUT_OPENED_AT = 'tag_checkout_opened_at';

/** Written when the offer is answered either way, so it asks only once. */
export const OFFER_ANSWERED_AT = 'tag_offer_answered_at';

export type ClaimState =
  /** Never offered, or offered and not acted on. */
  | 'unclaimed'
  /** Checkout was opened. Whether it was completed is not knowable here. */
  | 'opened'
  /** Claimed through the old Airtable form, before this existed. */
  | 'claimed';

/**
 * Reads the claim state, preferring the older record.
 *
 * Someone who claimed through the Airtable form before this shipped has
 * `CLAIMED_AT` and no Shopify record, and they must not be offered the pack
 * again. That check comes first for exactly that reason.
 */
export async function claimState(): Promise<ClaimState> {
  const [claimed, opened] = await Promise.all([
    getAppMeta(CLAIMED_AT),
    getAppMeta(CHECKOUT_OPENED_AT),
  ]);
  if (claimed !== null) return 'claimed';
  if (opened !== null) return 'opened';
  return 'unclaimed';
}

/**
 * Asked once per install. A decline counts as an answer: someone who said no
 * twice should not be asked again next launch.
 */
export async function shouldOfferTags(): Promise<boolean> {
  const [answered, state] = await Promise.all([
    getAppMeta(OFFER_ANSWERED_AT),
    claimState(),
  ]);
  return answered === null && state === 'unclaimed';
}

export async function markOfferAnswered(): Promise<void> {
  await setAppMeta(OFFER_ANSWERED_AT, new Date().toISOString());
}

/**
 * Looks up the pack, opens a cart for it, and hands checkout to iOS.
 *
 * Records that checkout was opened only after it actually opened, so a failure
 * anywhere earlier leaves the person able to try again rather than marked as
 * having had their one free pack.
 */
export async function startFreeClaim(): Promise<void> {
  if (!SHOP_CONFIG) {
    throw new ShopError(
      'not-configured',
      'The shop is not set up in this build.',
    );
  }

  const variant = await fetchVariant(SHOP_CONFIG, FREE_PACK_HANDLE);
  const checkout = await startCheckout(SHOP_CONFIG, variant.id, 1);
  await openCheckout(checkout.checkoutUrl);

  await setAppMeta(CHECKOUT_OPENED_AT, new Date().toISOString());
  await markOfferAnswered();
}
