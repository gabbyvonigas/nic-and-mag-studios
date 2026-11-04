/**
 * Resolves what the project writes to what node can load.
 *
 * `expo-sqlite` becomes the `node:sqlite` stub, so migrations can be exercised
 * against a real database, and a project-relative import with no extension is
 * retried with `.ts`, which is how every file in `src/` is written.
 */
const PROJECT = new URL('../src/', import.meta.url).href;
const STUB = new URL('./expo-sqlite-stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === 'expo-sqlite') return { url: STUB, shortCircuit: true };
  try {
    return await next(specifier, context);
  } catch (err) {
    const fromProject = (context.parentURL ?? '').startsWith(PROJECT);
    if (fromProject && specifier.startsWith('.') && !specifier.endsWith('.ts')) {
      return next(`${specifier}.ts`, context);
    }
    throw err;
  }
}
