/**
 * Loader hooks for the off-device tests.
 *
 * `node --experimental-strip-types` runs the project's TypeScript directly, so
 * the pure modules can be tested without a device, a bundler or a test
 * framework. Two things have to be taught to it: that `expo-sqlite` is not
 * available here, and that the project's relative imports carry no extension.
 */
import { register } from 'node:module';

register('./ts-resolve.mjs', import.meta.url);
