/**
 * Whether to show the free tags offer, and the record of having answered it.
 *
 * The offer used to be a permanent row in Settings, which is the wrong shape
 * for something everyone is entitled to exactly once: it sat there looking
 * unclaimed forever. It is a prompt now, shown once, and Settings keeps an
 * entry only so it can be found again on purpose.
 */
import { getAppMeta, setAppMeta } from '../db';

/** Written after Airtable confirms the row. */
export const CLAIMED_AT = 'tag_claim_submitted_at';

/** Written when the offer is answered either way, so it asks only once. */
export const OFFER_ANSWERED_AT = 'tag_offer_answered_at';

/**
 * Asked once per install. A decline counts as an answer: someone who said no
 * twice should not be asked again next launch.
 */
export async function shouldOfferTags(): Promise<boolean> {
  const [answered, claimed] = await Promise.all([
    getAppMeta(OFFER_ANSWERED_AT),
    getAppMeta(CLAIMED_AT),
  ]);
  return answered === null && claimed === null;
}

export async function markOfferAnswered(): Promise<void> {
  await setAppMeta(OFFER_ANSWERED_AT, new Date().toISOString());
}
