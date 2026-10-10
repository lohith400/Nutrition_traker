"use client";

import { useEffect, useState } from "react";

/**
 * The current time, but only in the browser.
 *
 * The server renders pages in UTC while the visitor lives in their own time zone, so anything that
 * reads the clock while rendering ("Good morning", "Thu, 8 Oct") makes the server HTML differ from
 * the browser's and React throws a hydration error. This returns null on the server and on the very
 * first browser render (so both match), then the real time right after.
 */
export function useClientNow(refreshMs = 60_000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), refreshMs);
    return () => window.clearInterval(id);
  }, [refreshMs]);
  return now;
}
