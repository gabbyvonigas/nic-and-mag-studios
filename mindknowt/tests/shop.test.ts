/**
 * The shop: configuration, and what the Storefront API's answers mean.
 *
 * None of this talks to Shopify. The payloads below are the shapes the API
 * documents, and the point is that every one of them, including the ugly ones,
 * produces either a usable value or an error that says what to do.
 *
 * Run: npm test, or from this directory
 * node --experimental-strip-types --import ./register.mjs shop.test.ts
 */
import assert from 'node:assert/strict';

/** The repository, from this file's own location. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const {
  API_VERSION,
  configProblems,
  describeProblem,
  isShopDomain,
  normalizeDomain,
  readShopConfig,
  storefrontUrl,
} = await import(`${ROOT}/src/shop/config.ts`);
const {
  errorForGraphQL,
  errorForStatus,
  firstSellableVariant,
  formatMoney,
  readCheckout,
} = await import(`${ROOT}/src/shop/storefront.ts`);
const { isOpenableCheckout } = await import(`${ROOT}/src/shop/checkoutUrl.ts`);

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

/** The error a call threw, so its kind and message can be read. */
function thrown(fn: () => unknown): { kind: string; message: string } {
  try {
    fn();
  } catch (err) {
    return err as { kind: string; message: string };
  }
  throw new Error('nothing was thrown');
}

// Configuration.

check('a domain is accepted however it was pasted', () => {
  // People paste what is in front of them, which is the admin URL.
  for (const raw of [
    'nicandmag.myshopify.com',
    'https://nicandmag.myshopify.com',
    'HTTPS://NicAndMag.myshopify.com/',
    '  nicandmag.myshopify.com  ',
    'https://nicandmag.myshopify.com/admin/products',
  ]) {
    assert.equal(normalizeDomain(raw), 'nicandmag.myshopify.com', raw);
  }
});

check('a host that is not a store is rejected rather than tried', () => {
  assert.equal(isShopDomain('nicandmag.myshopify.com'), true);
  assert.equal(isShopDomain('nicandmag.com'), false);
  assert.equal(isShopDomain('myshopify.com'), false);
  assert.equal(isShopDomain(''), false);
  assert.equal(isShopDomain('nicandmag.myshopify.com.evil.test'), false);
});

check('every problem is reported at once, not one at a time', () => {
  const problems = configProblems({ domain: '', token: '' });
  assert.deepEqual([...problems].sort(), ['missing-domain', 'missing-token']);

  assert.deepEqual(configProblems({ domain: 'nope.com', token: 'x' }), [
    'bad-domain',
  ]);
  assert.deepEqual(
    configProblems({ domain: 'a.myshopify.com', token: 'tok' }),
    [],
  );
  assert.deepEqual(configProblems({ domain: 'a.myshopify.com', token: '   ' }), [
    'missing-token',
  ]);
});

check('each problem names the variable to set', () => {
  for (const problem of ['missing-domain', 'bad-domain', 'missing-token'] as const) {
    const text = describeProblem(problem);
    assert.ok(text.includes('EXPO_PUBLIC_'), text);
    assert.ok(text.length > 20, text);
  }
});

check('an unconfigured build reads as null rather than half a config', () => {
  assert.equal(readShopConfig({}), null);
  assert.equal(readShopConfig({ EXPO_PUBLIC_SHOPIFY_DOMAIN: 'a.myshopify.com' }), null);
  assert.equal(readShopConfig({ EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN: 'tok' }), null);
});

check('a configured build gives a normalized config', () => {
  const config = readShopConfig({
    EXPO_PUBLIC_SHOPIFY_DOMAIN: 'https://NicAndMag.myshopify.com/',
    EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN: '  tok  ',
  });
  assert.equal(config.domain, 'nicandmag.myshopify.com');
  assert.equal(config.token, 'tok', 'the token is trimmed');
  assert.equal(config.apiVersion, API_VERSION);
});

check('the endpoint is the documented one', () => {
  const url = storefrontUrl({
    domain: 'nicandmag.myshopify.com',
    token: 'tok',
    apiVersion: '2026-07',
  });
  assert.equal(url, 'https://nicandmag.myshopify.com/api/2026-07/graphql.json');
});

check('the API version is a quarterly Shopify version', () => {
  // It expires rather than breaks, so this is here to make the shape obvious
  // when someone bumps it.
  assert.ok(/^\d{4}-(01|04|07|10)$/.test(API_VERSION), API_VERSION);
});

// Reading a product.

const variantsPayload = (nodes: unknown[]) => ({
  product: { id: 'gid://shopify/Product/1', variants: { nodes } },
});

check('the first sellable variant is the one that goes in the cart', () => {
  const variant = firstSellableVariant(
    variantsPayload([
      { id: 'v1', availableForSale: false, price: { amount: '0.0', currencyCode: 'USD' } },
      { id: 'v2', availableForSale: true, price: { amount: '0.0', currencyCode: 'USD' } },
    ]),
  );
  assert.equal(variant.id, 'v2');
  assert.equal(variant.available, true);
  assert.equal(variant.amount, 0);
});

check('a product that is not readable says why, because the cause is nearly always the same', () => {
  // A product created in the admin but not published to the sales channel the
  // Storefront token reads comes back as null. That is the single most common
  // way this looks broken, so the message names it.
  const error = thrown(() => firstSellableVariant({ product: null }));
  assert.equal(error.kind, 'product-missing');
  assert.ok(/published/i.test(error.message), error.message);
  assert.ok(/sales channel/i.test(error.message), error.message);
});

check('out of stock is a different failure from missing', () => {
  // One is a stock problem and one is a setup problem; they need different fixes.
  const soldOut = thrown(() =>
    firstSellableVariant(
      variantsPayload([{ id: 'v1', availableForSale: false, price: {} }]),
    ),
  );
  assert.equal(soldOut.kind, 'sold-out');

  const noVariants = thrown(() => firstSellableVariant(variantsPayload([])));
  assert.equal(noVariants.kind, 'sold-out');
  assert.ok(/no variants/i.test(noVariants.message), noVariants.message);
});

check('a variant without an id is not sellable, whatever it claims', () => {
  const error = thrown(() =>
    firstSellableVariant(variantsPayload([{ availableForSale: true, price: {} }])),
  );
  assert.equal(error.kind, 'sold-out');
});

check('money is formatted, and unformattable money does not throw', () => {
  assert.equal(formatMoney({ amount: '0.0', currencyCode: 'USD' }), '$0.00');
  assert.equal(formatMoney({ amount: '12.5', currencyCode: 'USD' }), '$12.50');
  assert.equal(formatMoney({}), '');
  assert.equal(formatMoney({ amount: 'free', currencyCode: 'USD' }), '');
});

// Opening a cart.

check('a good cart gives its checkout link', () => {
  const checkout = readCheckout({
    cartCreate: {
      cart: { id: 'gid://shopify/Cart/1', checkoutUrl: 'https://shop.test/cart/c/1' },
      userErrors: [],
    },
  });
  assert.equal(checkout.cartId, 'gid://shopify/Cart/1');
  assert.equal(checkout.checkoutUrl, 'https://shop.test/cart/c/1');
});

check('a refusal is surfaced in Shopify own words', () => {
  const error = thrown(() =>
    readCheckout({
      cartCreate: {
        cart: null,
        userErrors: [{ field: ['lines'], message: 'The merchandise line is invalid.' }],
      },
    }),
  );
  assert.equal(error.kind, 'rejected');
  assert.ok(error.message.includes('merchandise line'), error.message);
});

check('a cart with no link is a failure, not a success', () => {
  // The shape that would otherwise sail through and produce a dead button.
  for (const payload of [
    { cartCreate: { cart: null, userErrors: [] } },
    { cartCreate: { cart: { id: 'c', checkoutUrl: '' }, userErrors: [] } },
    { cartCreate: { cart: { id: 'c' }, userErrors: [] } },
    { cartCreate: null },
    {},
  ]) {
    const error = thrown(() => readCheckout(payload));
    assert.equal(error.kind, 'malformed', JSON.stringify(payload));
  }
});

// What the failures tell you.

check('a refused token says it is the Storefront token that is wrong', () => {
  for (const status of [401, 403]) {
    const error = errorForStatus(status);
    assert.equal(error.kind, 'unauthorized');
    assert.ok(/Storefront/i.test(error.message), error.message);
  }
});

check('a 404 is read as the API version, which is what it means here', () => {
  // The endpoint path carries the version, so an unsupported one is a 404 on a
  // URL that is otherwise correct. Without this it reads as a dead store.
  const error = errorForStatus(404);
  assert.equal(error.kind, 'api-version');
  assert.ok(error.message.includes('API_VERSION'), error.message);
});

check('rate limiting is temporary and says so', () => {
  const error = errorForStatus(429);
  assert.equal(error.kind, 'network');
  assert.ok(/again/i.test(error.message), error.message);
});

check('every error carries a class name through String()', () => {
  // The rule in AGENTS.md: a failure that reaches the UI without identifying
  // itself is its own bug.
  for (const error of [errorForStatus(500), errorForGraphQL([])]) {
    assert.equal((error as Error).name, 'ShopError');
    assert.ok(String(error).startsWith('ShopError'), String(error));
    assert.ok((error as Error).message.length > 0, 'an empty message');
  }
});

check('a GraphQL error keeps what Shopify said', () => {
  const error = errorForGraphQL([{ message: 'Field "nope" does not exist.' }]);
  assert.equal(error.kind, 'malformed');
  assert.ok(error.message.includes('does not exist'), error.message);
});

// Opening the link.

check('only a real https link is handed to the system', () => {
  assert.equal(isOpenableCheckout('https://shop.test/cart/c/1'), true);
  assert.equal(isOpenableCheckout('https://nicandmag.com/checkout'), true);
  assert.equal(isOpenableCheckout('http://shop.test/cart'), false, 'not https');
  assert.equal(isOpenableCheckout(''), false);
  assert.equal(isOpenableCheckout('   '), false);
  assert.equal(isOpenableCheckout('shop.test/cart'), false, 'no scheme');
  assert.equal(isOpenableCheckout('javascript:alert(1)'), false);
});

check('a custom checkout domain is still openable', () => {
  // A store with its own domain returns a URL on neither myshopify.com nor
  // the app's own host. Checking against the store domain would break exactly
  // the stores that are set up properly.
  assert.equal(isOpenableCheckout('https://shop.nicandmag.com/checkouts/abc'), true);
  assert.equal(isOpenableCheckout('https://checkout.shopify.com/c/1'), true);
});

console.log(`\n${passed} checks passed`);
