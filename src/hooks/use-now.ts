import { useEffect, useState } from "react";

/** Current time, refreshed every `intervalMs` so time-based labels (urgency, time left) stay live. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
