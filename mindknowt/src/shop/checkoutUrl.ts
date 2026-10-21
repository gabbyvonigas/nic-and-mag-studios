/**
 * Whether a checkout link can be handed to the system.
 *
 * Split from `checkout.ts` for the usual reason in this project: that file
 * imports React Native for `Linking`, and nothing that does can be loaded by
 * the node test runner. The rule below is the part worth asserting.
 */

/**
 * Only https, and only something with a host.
 *
 * This is not defending against Shopify, which is where the URL comes from. It
 * is defending against handing `Linking` a malformed string and getting a
 * silent no-op, which looks like a button that does nothing.
 *
 * Deliberately not checked against the store's own domain: a store with a
 * custom domain, or one on Shopify's hosted checkout, returns a URL on neither
 * host, so that check would break exactly the stores that are set up properly.
 */
export function isOpenableCheckout(url: string): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return false;
  return /^https:\/\/[^\s/]+\.[^\s/]+/i.test(trimmed);
}
