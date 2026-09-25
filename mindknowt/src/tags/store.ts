/**
 * Where to buy more tags.
 *
 * This is an Amazon Associates link: the tag on the end is what credits a
 * purchase to our account. Amazon requires that this be disclosed wherever
 * the link appears, so anything that offers it shows DISCLOSURE with it.
 * That is a program rule, not a courtesy.
 *
 * It was two links, a 10 pack and a 20 pack, which needed a sheet to choose
 * between. One product that offers its own sizes does not, so the control is
 * a single row again.
 */
import { Linking } from 'react-native';

/** Our Amazon Associates tracking ID. */
const ASSOCIATES_TAG = 'nicandmagstud-20';

/**
 * Required by the Associates program wherever this link is offered. Kept next
 * to the link itself so the two cannot drift apart: if a new place offers the
 * product, the disclosure is already in hand.
 */
export const DISCLOSURE =
  'As an Amazon Associate, we earn from qualifying purchases.';

/** Timeskey NTAG215 stickers, which are what we post and what we test on. */
export const TAG_PRODUCT = {
  asin: 'B0CPHYCG2Q',
  name: 'Timeskey 10pcs NFC Tags NTAG215 Stickers',
  url: `https://www.amazon.com/dp/B0CPHYCG2Q?tag=${ASSOCIATES_TAG}`,
};

/**
 * Hands the link to iOS, which opens the Amazon app when it is installed and
 * Safari when it is not. Resolves false when neither can take it, so a caller
 * can say something rather than appear to do nothing.
 */
export async function openTagStore(): Promise<boolean> {
  try {
    await Linking.openURL(TAG_PRODUCT.url);
    return true;
  } catch {
    return false;
  }
}
