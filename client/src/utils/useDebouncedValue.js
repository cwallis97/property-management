import { useEffect, useState } from "react";

// Returns `value` after it has stopped changing for `delay` ms. Used by
// Global Search so the API is hit ~200ms after the user pauses typing,
// not on every keystroke. Cancellation of the actual in-flight request is
// a separate concern (AbortController in the caller) — this only paces
// when a new request is allowed to start.
export function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
