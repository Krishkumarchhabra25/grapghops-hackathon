/**
 * Reusable async data hooks.
 * 
 * useFetch: runs an async function on mount, exposes { data, loading, error, refetch }.
 * usePoll: same as useFetch but re-runs on an interval. 
 *   - Pauses polling when the tab is in the background (saves server costs).
 *   - Only sets loading=true on the initial fetch (prevents UI flicker).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type FetchState<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mounted = useRef(true);
  const hasData = useRef(false);

  const run = useCallback(async () => {
    // Only trigger the loading UI spinner if we have NO data yet.
    // This prevents the page from flickering on background polls.
    if (!hasData.current) {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetcher();
      if (mounted.current) {
        setData(result);
        hasData.current = true;
      }
    } catch (e) {
      if (mounted.current) {
        setError(e instanceof Error ? e : new Error(String(e)));
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mounted.current = true;
    run();
    return () => { mounted.current = false; };
  }, [run]);

  return { data, loading, error, refetch: run };
}

export function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  deps: unknown[] = [],
): FetchState<T> {
  const state = useFetch(fetcher, deps);

  useEffect(() => {
    let intervalId: number | null = null;

    const startPolling = () => {
      if (intervalId) return;
      intervalId = window.setInterval(state.refetch, intervalMs);
    };

    const stopPolling = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is in the background — pause the server requests
        stopPolling();
      } else {
        // Tab is focused again — fetch fresh data immediately, then resume
        state.refetch();
        startPolling();
      }
    };

    // Initial start
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, state.refetch]);

  return state;
}