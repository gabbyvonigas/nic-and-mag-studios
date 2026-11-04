/**
 * The only file that speaks the Shopify Storefront API.
 *
 * Same rule as `react-native-nfc-manager` and `expo-alarm-kit`: the third party
 * lives in one file, behind the shapes in `types.ts`, and callers stay ignorant
 * of it. Shopify versions this API quarterly and retires each version after a
 * year, so confining it is not tidiness, it is the thing that makes the next
 * version bump a one file change.
 *
 * No React Native imports here, deliberately. Everything below is `fetch` and
 * plain parsing, so the parsers can be exercised off device against recorded
 * payloads.
 */
import { storefrontUrl } from './config';
import { ShopError, type Checkout, type ShopConfig, type ShopVariant } from './types';

const PRODUCT_QUERY = `
  query FreePack($handle: String!) {
    product(handle: $handle) {
      id
      title
      variants(first: 10) {
        nodes {
          id
          availableForSale
          price { amount currencyCode }
        }
      }
    }
  }
`;

const CART_MUTATION = `
  mutation StartCheckout($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart { id checkoutUrl }
      userErrors { field message }
    }
  }
`;

/** Money as Shopify sends it. */
type Money = { amount?: unknown; currencyCode?: unknown };

/**
 * Formats money for display, falling back rather than throwing.
 *
 * `Intl` is present in Hermes but this runs in tests too, and a price that
 * cannot be formatted is still a price worth showing.
 */
export function formatMoney(money: Money): string {
  const amount = Number(money.amount);
  const currency = typeof money.currencyCode === 'string' ? money.currencyCode : 'USD';
  if (!Number.isFinite(amount)) return '';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Picks the variant to put in the cart.
 *
 * The starter pack has one variant today and the shop is meant to grow more
 * SKUs, so this takes the first sellable one rather than assuming a count. A
 * product that exists with nothing sellable is a different failure from a
 * product that does not exist, and the two get different messages because they
 * need different fixes: one is a stock problem, the other is almost always a
 * product that was never published to the sales channel this token reads.
 */
export function firstSellableVariant(payload: unknown): ShopVariant {
  const product = (payload as { product?: unknown } | null)?.product as
    | { variants?: { nodes?: unknown[] } }
    | null
    | undefined;

  if (!product) {
    throw new ShopError(
      'product-missing',
      'That product is not readable with this token. The usual cause is that it is not published to the sales channel the Storefront token reads.',
    );
  }

  const nodes = Array.isArray(product.variants?.nodes) ? product.variants.nodes : [];
  const variants = nodes as {
    id?: unknown;
    availableForSale?: unknown;
    price?: Money;
  }[];

  const sellable = variants.find(
    (variant) => variant.availableForSale === true && typeof variant.id === 'string',
  );

  if (!sellable) {
    throw new ShopError(
      'sold-out',
      variants.length === 0
        ? 'That product has no variants to order.'
        : 'That product is out of stock.',
    );
  }

  return {
    id: sellable.id as string,
    available: true,
    price: formatMoney(sellable.price ?? {}),
    amount: Number(sellable.price?.amount ?? Number.NaN),
  };
}

/**
 * Pulls the checkout URL out of a cart payload.
 *
 * `userErrors` is where Shopify puts the refusals that are not transport
 * failures, and an empty `cart` with no errors at all is a shape nobody should
 * silently treat as success.
 */
export function readCheckout(payload: unknown): Checkout {
  const result = (payload as { cartCreate?: unknown } | null)?.cartCreate as
    | {
        cart?: { id?: unknown; checkoutUrl?: unknown } | null;
        userErrors?: { message?: unknown }[];
      }
    | null
    | undefined;

  const userErrors = result?.userErrors ?? [];
  if (userErrors.length > 0) {
    const message = userErrors
      .map((error) => (typeof error.message === 'string' ? error.message : ''))
      .filter(Boolean)
      .join(' ');
    throw new ShopError('rejected', message || 'Shopify would not open a cart.');
  }

  const cart = result?.cart;
  if (
    !cart ||
    typeof cart.id !== 'string' ||
    typeof cart.checkoutUrl !== 'string' ||
    !cart.checkoutUrl
  ) {
    throw new ShopError('malformed', 'Shopify returned a cart with no checkout link.');
  }

  return { cartId: cart.id, checkoutUrl: cart.checkoutUrl };
}

/** Maps a failing HTTP status to something that says what to do about it. */
export function errorForStatus(status: number): ShopError {
  if (status === 401 || status === 403) {
    return new ShopError(
      'unauthorized',
      'The Storefront token was refused. Check it is a Storefront access token for this store and that its scopes cover reading products and writing checkouts.',
    );
  }
  if (status === 404) {
    return new ShopError(
      'api-version',
      'That Storefront API version is not available on this store. Change API_VERSION in src/shop/config.ts.',
    );
  }
  if (status === 429) {
    return new ShopError('network', 'Shopify is rate limiting. Try again in a moment.');
  }
  return new ShopError('network', `Shopify answered ${status}.`);
}

/** GraphQL errors that are not user errors, which usually mean a bad query. */
export function errorForGraphQL(errors: { message?: unknown }[]): ShopError {
  const message = errors
    .map((error) => (typeof error.message === 'string' ? error.message : ''))
    .filter(Boolean)
    .join(' ');
  return new ShopError('malformed', message || 'Shopify rejected the query.');
}

async function request<T>(
  config: ShopConfig,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(storefrontUrl(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': config.token,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    // The class name is kept on purpose. A bare `String(err)` on a fetch
    // failure renders as "TypeError" or worse as "Error", which tells nobody
    // anything; see the rule in AGENTS.md.
    const name = err instanceof Error ? err.constructor.name : typeof err;
    const detail = err instanceof Error && err.message ? `: ${err.message}` : '';
    throw new ShopError('network', `Could not reach Shopify (${name}${detail}).`);
  }

  if (!response.ok) throw errorForStatus(response.status);

  const body = (await response.json()) as {
    data?: unknown;
    errors?: { message?: unknown }[];
  };

  if (Array.isArray(body.errors) && body.errors.length > 0) {
    throw errorForGraphQL(body.errors);
  }
  if (!body.data) {
    throw new ShopError('malformed', 'Shopify returned no data.');
  }

  return body.data as T;
}

/** The variant to put in the cart, looked up by the product's handle. */
export async function fetchVariant(
  config: ShopConfig,
  handle: string,
): Promise<ShopVariant> {
  const data = await request<unknown>(config, PRODUCT_QUERY, { handle });
  return firstSellableVariant(data);
}

/** Creates the cart and hands back where to pay for it. */
export async function startCheckout(
  config: ShopConfig,
  variantId: string,
  quantity = 1,
): Promise<Checkout> {
  const data = await request<unknown>(config, CART_MUTATION, {
    lines: [{ merchandiseId: variantId, quantity }],
  });
  return readCheckout(data);
}
