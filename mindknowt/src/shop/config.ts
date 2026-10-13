/**
 * Where the shop lives, read from the environment at bundle time.
 *
 * Same mechanism the Airtable token used: `EXPO_PUBLIC_` is what makes Expo
 * inline the value, and `.env.local` is gitignored while a plain `.env` is
 * not. Unlike that token, this one is meant to be public. A Storefront access
 * token reads published products and creates carts; it cannot read orders,
 * customers, or anything else in the store. The Admin token, which can, must
 * never be put here.
 *
 * Pure and free of React Native imports, so the validation can be asserted
 * off device.
 */
import type { ConfigProblem, ShopConfig } from './types';

/**
 * The Storefront API version this app speaks.
 *
 * Shopify ships a version each quarter and supports each for twelve months,
 * so this is a thing that expires rather than a thing that breaks. One
 * constant, bumped deliberately. An unsupported version comes back as an
 * explicit error from Shopify rather than as odd behavior, and `storefront.ts`
 * maps it to `api-version` so the message says what to do.
 */
export const API_VERSION = '2026-07';

/**
 * Trims a store domain into the bare host.
 *
 * People paste what is in front of them, which is usually the admin URL with a
 * scheme on it and sometimes a trailing slash. Accepting those is cheaper than
 * a support round trip about why the shop will not open.
 */
export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

/** A Shopify store host, which is what the Storefront endpoint is built on. */
export function isShopDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain);
}

/**
 * What is wrong with the configuration, if anything.
 *
 * Returns every problem rather than the first, so setting this up is one pass
 * instead of a game of whack-a-mole.
 */
export function configProblems(input: {
  domain: string;
  token: string;
}): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const domain = normalizeDomain(input.domain);

  if (!domain) problems.push('missing-domain');
  else if (!isShopDomain(domain)) problems.push('bad-domain');

  if (!input.token.trim()) problems.push('missing-token');

  return problems;
}

/** One line per problem, for the Dev screen. Not shown to a customer. */
export function describeProblem(problem: ConfigProblem): string {
  switch (problem) {
    case 'missing-domain':
      return 'EXPO_PUBLIC_SHOPIFY_DOMAIN is not set.';
    case 'bad-domain':
      return 'EXPO_PUBLIC_SHOPIFY_DOMAIN is not a myshopify.com host.';
    case 'missing-token':
      return 'EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN is not set.';
  }
}

/**
 * The configuration, or null when the shop is not set up.
 *
 * Null rather than a throw: a build without these values is a normal state
 * during development, and the screens that offer the shop hide themselves
 * rather than failing when they open.
 */
export function readShopConfig(env: Record<string, string | undefined>): ShopConfig | null {
  const domain = env.EXPO_PUBLIC_SHOPIFY_DOMAIN ?? '';
  const token = env.EXPO_PUBLIC_SHOPIFY_STOREFRONT_TOKEN ?? '';

  if (configProblems({ domain, token }).length > 0) return null;

  return {
    domain: normalizeDomain(domain),
    token: token.trim(),
    apiVersion: API_VERSION,
  };
}

/** The GraphQL endpoint for a store. */
export function storefrontUrl(config: ShopConfig): string {
  return `https://${config.domain}/api/${config.apiVersion}/graphql.json`;
}

/**
 * The handle of the free starter pack, which is the last segment of the
 * product's admin URL rather than an id someone has to go digging for.
 */
export const FREE_PACK_HANDLE =
  process.env.EXPO_PUBLIC_SHOPIFY_FREE_PACK_HANDLE ??
  'mindknowt-free-starter-nfc-tag-5-pack';

export const SHOP_CONFIG = readShopConfig(process.env);

export function isShopConfigured(): boolean {
  return SHOP_CONFIG !== null;
}
