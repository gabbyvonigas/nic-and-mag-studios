import type { AlarmLaunch } from './types';

/**
 * `consumeLaunch()` clears the payload natively on read, so exactly one caller
 * may invoke it. The app shell owns that call and publishes the result here;
 * anything else that cares (the router, the dev harness) subscribes instead of
 * reading the native side again.
 */
type Listener = (launch: AlarmLaunch | null) => void;

let current: AlarmLaunch | null = null;
const listeners = new Set<Listener>();

export function publishLaunch(launch: AlarmLaunch | null): void {
  current = launch;
  for (const listener of listeners) listener(current);
}

export function getLaunch(): AlarmLaunch | null {
  return current;
}

export function clearLaunch(): void {
  publishLaunch(null);
}

export function subscribeToLaunch(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
