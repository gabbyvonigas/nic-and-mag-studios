/**
 * The shipped category keys, spec section 4.1. Deliberately free of imports so
 * content validation can run without pulling in the native SQLite stack.
 */
export const CATEGORY_KEYS = ['home', 'daily', 'care', 'ritual', 'go', 'admin'] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];
