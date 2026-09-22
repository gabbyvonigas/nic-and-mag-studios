/**
 * Where to buy more tags.
 *
 * These are Amazon Associates links: the tag on the end is what credits a
 * purchase to our account. Amazon requires that this be disclosed wherever
 * the links appear, so anything that offers a pack shows DISCLOSURE with it.
 * That is a program rule, not a courtesy.
 */
import { Linking } from 'react-native';

export type TagPack = {
  id: string;
  /** What the choice is called where it is offered. */
  label: string;
  url: string;
};

/** Our Amazon Associates tracking ID. */
const ASSOCIATES_TAG = 'nicandmagstud-20';

/**
 * Required by the Associates program wherever these links are offered. Kept
 * next to the links themselves so the two cannot drift apart: if a new place
 * offers a pack, the disclosure is already in hand.
 */
export const DISCLOSURE =
  'As an Amazon Associate, we earn from qualifying purchases.';

export const TAG_PACKS: TagPack[] = [
  {
    id: 'ten',
    label: '10 pack',
    url: `https://www.amazon.com/dp/B09536MQGY?tag=${ASSOCIATES_TAG}`,
  },
  {
    id: 'twenty',
    label: '20 pack',
    url: `https://www.amazon.com/dp/B09538RD2W?tag=${ASSOCIATES_TAG}`,
  },
];

/**
 * Hands the link to iOS, which opens the Amazon app when it is installed and
 * Safari when it is not. Resolves false when neither can take it, so a caller
 * can say something rather than appear to do nothing.
 */
export async function openTagPack(pack: TagPack): Promise<boolean> {
  try {
    await Linking.openURL(pack.url);
    return true;
  } catch {
    return false;
  }
}
