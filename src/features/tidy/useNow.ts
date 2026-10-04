import { useEffect, useState } from 'react';

/** The time, refreshed every `ms` while `on` (for honest elapsed clocks). */
export function useNow(on: boolean, ms = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [on, ms]);
  return now;
}
