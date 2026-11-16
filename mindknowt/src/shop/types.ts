/**
 * What the rest of the app knows about the shop.
 *
 * Same boundary as `src/alarms/types.ts` and `src/nfc/types.ts`: the Storefront
 * API is spoken in exactly one file, and callers deal in these shapes instead.
 * Shopify versions its API quarterly and deprecates each one after a year, so
 * the thing most likely to change here is the thing most worth confining.
 */

export type ShopConfig = {
  /** Bare host, e.g. `nicandmag.myshopify.com`. No scheme, no trailing slash. */
  domain: string;
  /**
   * The Storefront access token. Public by design: it reads published products
   * and creates carts, and nothing else. This is not the Admin API token, which
   * must never reach the app.
   */
  token: string;
  apiVersion: string;
};

/** Why the shop cannot be opened, in words meant for whoever is building it. */
export type ConfigProblem =
  | 'missing-domain'
  | 'missing-token'
  | 'bad-domain';

export type ShopVariant = {
  /** The Storefront GID, which is what a cart line refers to. */
  id: string;
  available: boolean;
  /** Formatted for display, e.g. "$0.00". Shopify gives amount and currency. */
  price: string;
  amount: number;
};

/** A cart that exists on Shopify and is ready to be paid for. */
export type Checkout = {
  cartId: string;
  checkoutUrl: string;
};

/**
 * Anything the shop could not do, carrying enough to act on.
 *
 * `kind` is for the app, `message` is for the person, and the class name
 * survives `String(err)`, which is the rule in AGENTS.md: a failure that
 * reaches the UI without identifying itself is its own bug.
 */
export type ShopErrorKind =
  | 'not-configured'
  | 'network'
  | 'api-version'
  | 'unauthorized'
  | 'product-missing'
  | 'sold-out'
  | 'rejected'
  | 'malformed';

export class ShopError extends Error {
  readonly kind: ShopErrorKind;

  constructor(kind: ShopErrorKind, message: string) {
    super(message);
    this.name = 'ShopError';
    this.kind = kind;
  }
}
