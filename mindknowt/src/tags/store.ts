/**
 * Where to buy more tags.
 *
 * These are plain Amazon product links today. Associates tagged versions of
 * the same two URLs go in here when that account exists, and nothing else has
 * to change: callers only ever see the pack list.
 */
import { Linking } from 'react-native';

export type TagPack = {
  id: string;
  /** What the choice is called where it is offered. */
  label: string;
  url: string;
};

export const TAG_PACKS: TagPack[] = [
  { id: 'ten', label: '10 pack', url: 'https://www.amazon.com/dp/B09536MQGY' },
  { id: 'twenty', label: '20 pack', url: 'https://www.amazon.com/dp/B09538RD2W' },
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
