import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data now and every intervalMs (0 = once); a new `key` (e.g. filters) reloads at once.
// Hidden tabs skip ticks to spare the gateway rate limit.
export function usePolling(load, intervalMs = 5000, key = '') {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      const data = await loadRef.current();
      setState({ data, error: null, loading: false });
    } catch (err) {
      setState((prev) => ({ ...prev, error: err.message, loading: false }));
    }
  }, []);

  useEffect(() => {
    refresh();
    if (!intervalMs) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs, key]);

  return { ...state, refresh };
}
