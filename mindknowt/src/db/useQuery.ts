import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

type State<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
};

/**
 * Runs an async read on mount and on every screen focus. Screens mutate the
 * database and navigate back, so refetching on focus is what keeps lists honest
 * without a client-side cache.
 */
export function useQuery<T>(run: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const mounted = useRef(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runRef = useCallback(run, deps);

  const reload = useCallback(async () => {
    try {
      const data = await runRef();
      if (mounted.current) setState({ data, loading: false, error: null });
    } catch (err) {
      if (mounted.current) {
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }, [runRef]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { ...state, reload };
}
