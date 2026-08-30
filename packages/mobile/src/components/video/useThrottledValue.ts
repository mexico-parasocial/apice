import { useEffect, useRef, useState } from "react";

/**
 * Returns `true` only when `value` stays true for at least `delayMs`.
 * Borrowed from Bluesky's useThrottledValue — prevents spinner flicker when
 * buffering resolves faster than a human can perceive it.
 */
export function useThrottledValue(value: boolean, delayMs: number): boolean {
  const [throttled, setThrottled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (value && !throttled) {
      timerRef.current = setTimeout(() => setThrottled(true), delayMs);
    } else if (!value) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setThrottled(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, throttled, delayMs]);

  return throttled;
}
