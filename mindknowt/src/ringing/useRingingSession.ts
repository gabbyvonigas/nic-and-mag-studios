import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { cancelKnowtOneShots, rearmKnowtAlarm } from '../alarms/knowtAlarms';
import { resyncAlarmsQuietly } from '../alarms/scheduleSync';
import {
  addSnooze,
  completeRinging,
  getKnowt,
  setEventNote,
  startRinging,
  updateNotes,
  type EventMethod,
  type KnowtWithDetail,
} from '../db';
import { NfcScanError, nfcReader } from '../nfc';

export type RingingMessage = {
  tone: 'warn' | 'danger';
  text: string;
};

function scanFailureText(err: unknown): RingingMessage | null {
  if (!(err instanceof NfcScanError)) {
    return {
      tone: 'danger',
      text: err instanceof Error && err.message ? err.message : String(err),
    };
  }
  switch (err.reason) {
    case 'cancelled':
      // Backing out of the sheet is not a failure; the alarm simply continues.
      return null;
    case 'wrong-tag':
      // Already shown inside the scan sheet. Repeated here because the sheet
      // is gone by the time the screen renders again.
      return { tone: 'danger', text: err.message };
    case 'timeout':
      return { tone: 'warn', text: 'No tag was detected. Hold it to the top of the phone.' };
    case 'radio-disabled':
      return { tone: 'danger', text: 'NFC is turned off. Turn it on, then scan again.' };
    case 'unsupported':
      return { tone: 'danger', text: 'This device cannot scan tags.' };
    default:
      return { tone: 'danger', text: err.message };
  }
}

/**
 * Owns one ringing session, including the part that makes the product work:
 * leaving without completing re-schedules the alarm and keeps doing so.
 */
export function useRingingSession(
  knowtId: string,
  scheduleId: string | null = null,
) {
  const [knowt, setKnowt] = useState<KnowtWithDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolved, setResolved] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<RingingMessage | null>(null);

  const mounted = useRef(true);
  const eventIdRef = useRef<string | null>(null);
  const knowtRef = useRef<KnowtWithDetail | null>(null);
  const resolvedRef = useRef(false);
  const rearmedRef = useRef(false);
  const scanningRef = useRef(false);
  const startedRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const loaded = await getKnowt(knowtId);
      knowtRef.current = loaded;
      if (mounted.current) {
        setKnowt(loaded);
        setLoading(false);
      }
      // One event per ringing session. Guarded so a re-run of this effect
      // cannot open a second event for the same firing.
      if (loaded && !startedRef.current) {
        startedRef.current = true;
        eventIdRef.current = await startRinging(loaded.id, scheduleId);
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, [knowtId, scheduleId]);

  /** Spec section 2, step 5. At most one re-fire per session. */
  const rearmIfAbandoned = useCallback(async () => {
    if (resolvedRef.current || rearmedRef.current) return;
    const current = knowtRef.current;
    if (!current) return;
    rearmedRef.current = true;
    try {
      await rearmKnowtAlarm({
        knowtId: current.id,
        title: current.name,
        minutes: current.refire_minutes,
        kind: 'refire',
      });
    } catch {
      // Losing the re-fire must not crash the screen; the alarm already rang.
      rearmedRef.current = false;
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      // Only a real backgrounding counts as walking away. iOS reports
      // 'inactive' while the system NFC sheet is up, which is the opposite of
      // abandoning the alarm.
      if (state === 'background' && !scanningRef.current) {
        void rearmIfAbandoned();
      }
    });
    return () => sub.remove();
  }, [rearmIfAbandoned]);

  const resolve = useCallback(
    async (method: EventMethod) => {
      resolvedRef.current = true;
      if (mounted.current) setResolved(true);
      if (eventIdRef.current) {
        await completeRinging(eventIdRef.current, method);
      }
      // This firing is done, so nothing armed for it should still ring. Only
      // the one-shots go: a stale re-fire, a snooze, a leftover test alarm. The
      // knowt's recurring alarm stays, because doing today's 8:00 am does not
      // cancel tomorrow's.
      const current = knowtRef.current;
      if (current) {
        try {
          await cancelKnowtOneShots(current.id);
        } catch {
          // Completion is already recorded; a failed cancel must not undo it.
        }
        // An interval or one-off schedule arms a single occurrence, and that
        // occurrence has now been used. This arms the next one.
        await resyncAlarmsQuietly();
      }
    },
    [],
  );

  const scanToStop = useCallback(async () => {
    const current = knowtRef.current;
    if (!current) return false;

    setMessage(null);
    scanningRef.current = true;
    setScanning(true);

    const expected = current.tag_uid?.toLowerCase() ?? null;
    if (!expected) {
      scanningRef.current = false;
      setScanning(false);
      setMessage({
        tone: 'danger',
        text: 'This knowt has no tag attached, so it cannot be scanned.',
      });
      return false;
    }

    try {
      // The expected UID goes down into the reader so a mismatch is rejected
      // inside the platform's own scan sheet. Never accept any-tag-will-do.
      await nfcReader.scanTag({
        prompt: `Hold your iPhone to the ${current.name} tag.`,
        expectRawUid: expected,
        expectLabel: current.name,
      });

      await resolve('scan');
      return true;
    } catch (err) {
      const failure = scanFailureText(err);
      if (failure && mounted.current) setMessage(failure);
      return false;
    } finally {
      scanningRef.current = false;
      if (mounted.current) setScanning(false);
    }
  }, [resolve]);

  /**
   * Puts the alarm off for a stated number of minutes. Deferring is not
   * completing: `completed_at` stays null, so the knowt still reads as not
   * done, but the session is resolved so the abandon path does not queue a
   * re-fire on top of the alarm this just armed.
   */
  const remindIn = useCallback(async (minutes: number) => {
    const current = knowtRef.current;
    if (!current) return;
    if (eventIdRef.current) await addSnooze(eventIdRef.current);
    resolvedRef.current = true;
    if (mounted.current) setResolved(true);
    await rearmKnowtAlarm({
      knowtId: current.id,
      title: current.name,
      minutes,
      kind: 'snooze',
    });
  }, []);

  /** The quick one. Same mechanism, using the knowt's own snooze length. */
  const snooze = useCallback(async () => {
    const current = knowtRef.current;
    if (!current) return;
    await remindIn(current.snooze_minutes);
  }, [remindIn]);

  const complete = useCallback(
    (method: Extract<EventMethod, 'tap' | 'override'>) => resolve(method),
    [resolve],
  );

  const saveKnowtNotes = useCallback(async (notes: string) => {
    const current = knowtRef.current;
    if (!current) return;
    await updateNotes(current.id, notes);
    const refreshed = await getKnowt(current.id);
    knowtRef.current = refreshed;
    if (mounted.current) setKnowt(refreshed);
  }, []);

  const saveEventNote = useCallback(async (note: string) => {
    if (!eventIdRef.current) return;
    await setEventNote(eventIdRef.current, note.trim() || null);
  }, []);

  return {
    knowt,
    loading,
    resolved,
    scanning,
    message,
    clearMessage: useCallback(() => setMessage(null), []),
    scanToStop,
    remindIn,
    snooze,
    complete,
    saveKnowtNotes,
    saveEventNote,
    rearmIfAbandoned,
  };
}
