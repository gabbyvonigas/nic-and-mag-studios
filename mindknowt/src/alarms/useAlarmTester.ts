import { useCallback, useEffect, useRef, useState } from 'react';
import { alarmScheduler } from './AlarmScheduler';
import { clearLaunch, getLaunch, subscribeToLaunch } from './launchStore';
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
    useState<AlarmAuthorization>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AlarmFailure | null>(null);
  const [scheduled, setScheduled] = useState<ScheduledAlarm[]>([]);
  const [launch, setLaunch] = useState<AlarmLaunch | null>(null);

  const mounted = useRef(true);

  // The app shell is the single consumer of the native payload; read the
  // published copy rather than clearing it out from under the router.
  useEffect(() => {
    setLaunch(getLaunch());
    return subscribeToLaunch((next) => {
      if (mounted.current) setLaunch(next);
    });
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

        // React state resets on every launch, and an alarm dismissal relaunches
        // the app — so the real status must be read, not assumed. When already
        // authorized this returns immediately without prompting; it only
        // prompts when the status is genuinely notDetermined.
        const status = await alarmScheduler.requestAuthorization();
        if (mounted.current) setAuthorization(status);
      } catch (err) {
        if (!mounted.current) return;
        setAvailability('unavailable');
        setError(toFailure(err));
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, []);

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

  const dismissLaunch = useCallback(() => clearLaunch(), []);

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
    clearLaunch: dismissLaunch,
  };
}
