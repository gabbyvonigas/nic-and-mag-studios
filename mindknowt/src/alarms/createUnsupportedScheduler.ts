import { AlarmError, type AlarmScheduler } from './types';

/**
 * Scheduler for platforms with no implementation yet. Reports unavailable
 * rather than throwing on probe, so the UI renders an explanatory state.
 */
export function createUnsupportedScheduler(note: string): AlarmScheduler {
  return {
    async isAvailable() {
      return false;
    },
    async configure() {
      // Nothing to wire up.
    },
    async requestAuthorization() {
      return 'unavailable' as const;
    },
    async scheduleAt(): Promise<never> {
      throw new AlarmError('unsupported', note);
    },
    async cancel() {
      // No alarm can exist.
    },
    async listScheduled() {
      return [];
    },
    async consumeLaunch() {
      return null;
    },
  };
}
