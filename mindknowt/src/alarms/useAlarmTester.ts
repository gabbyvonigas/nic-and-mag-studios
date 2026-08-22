import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { alarmScheduler } from './AlarmScheduler';
import {
  AlarmError,
  type AlarmAuthorization,
  type AlarmFailureReason,
  type AlarmLaunch,
  type ScheduledAlarm,
} from './types';

export type AlarmAvailability = 'checking' | 'ready' | 'unavailable';

export type AlarmFailure = {
  reason: AlarmFailureReason;
  message: string;
};

function toFailure(err: unknown): AlarmFailure {
  if (err instanceof AlarmError) {
    return { reason: err.reason, message: err.message };
  }
  return {
    reason: 'unknown',
    message: err instanceof Error && err.message ? err.message : String(err),
  };
}

/**
 * Test harness state for the AlarmKit path. Talks only to the AlarmScheduler
 * interface, so it is platform-agnostic; Metro picks the implementation.
 */
export function useAlarmTester() {
  const [availability, setAvailability] = useState<AlarmAvailability>('checking');
  const [authorization, setAuthorization] =
    useState<AlarmAuthorization>('notDetermined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AlarmFailure | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledAlarm[]>([]);
  const [launch, setLaunch] = useState<AlarmLaunch | null>(null);

  const mounted = useRef(true);

  const checkLaunch = useCallback(async () => {
    const next = await alarmScheduler.consumeLaunch();
    // Reading clears it natively, so only overwrite when something arrived.
    if (next && mounted.current) setLaunch(next);
  }, []);

  useEffect(() => {
    mounted.current = true;

    (async () => {
      try {
        if (!(await alarmScheduler.isAvailable())) {
          if (mounted.current) setAvailability('unavailable');
          return;
        }
        await alarmScheduler.configure();
        if (mounted.current) setAvailability('ready');
        await checkLaunch();
      } catch (err) {
        if (!mounted.current) return;
        setAvailability('unavailable');
        setError(toFailure(err));
      }
    })();

    // The alarm can fire while the app is already running, so re-check on every
    // return to the foreground, not just on mount.
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void checkLaunch();
    });

    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, [checkLaunch]);

  const authorize = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const status = await alarmScheduler.requestAuthorization();
      if (mounted.current) setAuthorization(status);
    } catch (err) {
      if (mounted.current) setError(toFailure(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const scheduleIn = useCallback(async (minutes: number) => {
    setError(null);
    setBusy(true);
    try {
      const firesAt = new Date(Date.now() + minutes * 60_000);
      const alarm = await alarmScheduler.scheduleAt({
        title: 'MindKnowt test alarm',
        firesAt,
        // Stands in for a knowt id — this is what must survive the launch.
        payload: `test-${minutes}m`,
      });
      if (mounted.current) setScheduled((prev) => [alarm, ...prev]);
    } catch (err) {
      if (mounted.current) setError(toFailure(err));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const cancel = useCallback(async (id: string) => {
    setError(null);
    try {
      await alarmScheduler.cancel(id);
      if (mounted.current) {
        setScheduled((prev) => prev.filter((a) => a.id !== id));
      }
    } catch (err) {
      if (mounted.current) setError(toFailure(err));
    }
  }, []);

  const clearLaunch = useCallback(() => setLaunch(null), []);

  return {
    availability,
    authorization,
    busy,
    error,
    scheduled,
    launch,
    authorize,
    scheduleIn,
    cancel,
    clearLaunch,
  };
}
