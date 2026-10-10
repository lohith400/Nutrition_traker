"use client";

import { useEffect, useRef, useState } from "react";
import { API } from "./Shell";

/**
 * Wakes the server the moment the site opens and, only if that is slow, explains what is happening.
 *
 * Free hosting puts the API to sleep after ~15 idle minutes and the first request then takes up to a
 * minute. Rather than letting every screen sit empty with no explanation, this pings /health straight
 * away (so the wake-up starts while the visitor is still looking at the page), shows a calm "warming
 * up" note if it takes longer than a couple of seconds, and confirms when the kitchen is open.
 * It also re-pings when the tab comes back after a long break.
 */
type Phase = "quiet" | "waking" | "ready" | "stuck";

const SHOW_AFTER_MS = 2200;
const GIVE_UP_MS = 120_000;
const RE_WARM_AFTER_MS = 5 * 60_000;

export default function WarmUp() {
  const [phase, setPhase] = useState<Phase>("quiet");
  const run = useRef(0);
  const wasWaking = useRef(false);
  const hiddenAt = useRef<number | null>(null);

  function warm() {
    const mine = ++run.current;
    const started = Date.now();
    wasWaking.current = false;
    const showTimer = window.setTimeout(() => {
      if (mine === run.current) {
        wasWaking.current = true;
        setPhase("waking");
      }
    }, SHOW_AFTER_MS);

    const attempt = async () => {
      if (mine !== run.current) return;
      try {
        const res = await fetch(`${API}/health`, { cache: "no-store" });
        if (res.ok) {
          window.clearTimeout(showTimer);
          if (mine !== run.current) return;
          if (wasWaking.current) {
            setPhase("ready");
            window.setTimeout(() => mine === run.current && setPhase("quiet"), 2200);
          } else {
            setPhase("quiet");
          }
          return;
        }
      } catch {
        /* server still starting: try again below */
      }
      if (Date.now() - started > GIVE_UP_MS) {
        window.clearTimeout(showTimer);
        if (mine === run.current) setPhase("stuck");
        return;
      }
      window.setTimeout(attempt, 2500);
    };
    void attempt();
  }

  useEffect(() => {
    warm();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > RE_WARM_AFTER_MS) {
        hiddenAt.current = null;
        warm();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      run.current++;
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "quiet") return null;

  return (
    <div className={`warmup warmup-${phase}`} role="status" aria-live="polite">
      <svg className="warmup-pot" viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
        <path className="steam s1" d="M17 14c-2-3 2-4 0-7" />
        <path className="steam s2" d="M24 14c-2-3 2-4 0-7" />
        <path className="steam s3" d="M31 14c-2-3 2-4 0-7" />
        <path d="M10 21h28v8a9 9 0 0 1-9 9H19a9 9 0 0 1-9-9z" className="pot-body" />
        <path d="M8 21h32" className="pot-lid" />
        <path d="M10 25H6m32 0h4" className="pot-handle" />
      </svg>
      <div className="warmup-text">
        {phase === "waking" && (
          <>
            <b>Warming up the kitchen…</b>
            <span>The free server naps when idle. This can take up to a minute, and only happens once.</span>
          </>
        )}
        {phase === "ready" && (
          <>
            <b>The kitchen is open.</b>
            <span>Everything is ready.</span>
          </>
        )}
        {phase === "stuck" && (
          <>
            <b>Can&apos;t reach the server yet.</b>
            <span>
              Check your connection, then{" "}
              <button type="button" className="warmup-retry" onClick={() => { setPhase("waking"); warm(); }}>
                try again
              </button>
              .
            </span>
          </>
        )}
      </div>
      {phase === "waking" && <span className="warmup-bar" aria-hidden="true" />}
    </div>
  );
}
