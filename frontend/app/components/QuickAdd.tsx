"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Plus, Search, X } from "lucide-react";
import { API } from "./Shell";
import { FoodOption, FoodOptionList, LoggedInfo, mealForNow } from "./FoodOptions";

/** Tell every open page its numbers changed (the home page and food log listen for this). */
export const DATA_CHANGED = "nutrisync-data-changed";
export const OPEN_QUICK_ADD = "nutrisync-quickadd";

const STARTERS = ["idli", "dosa", "chapati", "dal", "rice", "banana", "egg", "paneer"];

/**
 * Log a food in two taps from any screen: press Ctrl/Cmd+K (or "/"), or tap the + button on a phone.
 * It reuses the same food search and the same one-tap logging the rest of the app uses.
 */
export default function QuickAdd() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<FoodOption[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastLogged, setLastLogged] = useState<LoggedInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    window.setTimeout(() => returnFocus.current?.focus?.(), 0);
  }, []);

  const show = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    setQ("");
    setOptions(null);
    setLastLogged(null);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else show();
      } else if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        show();
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_QUICK_ADD, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_QUICK_ADD, show);
    };
  }, [open, close, show]);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // keep the page behind from scrolling while the palette is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const text = q.trim();
    if (!open || text.length < 2) {
      setOptions(null);
      setBusy(false);
      return;
    }
    const mine = ++seq.current;
    setBusy(true);
    const t = window.setTimeout(() => {
      fetch(`${API}/api/food-options?q=${encodeURIComponent(text)}&limit=8`)
        .then((r) => r.json())
        .then((d) => {
          if (mine === seq.current) {
            setOptions(d.options || []);
            setHidden(d.hidden_by_diet || 0);
          }
        })
        .catch(() => mine === seq.current && setOptions([]))
        .finally(() => mine === seq.current && setBusy(false));
    }, 220);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const onLogged = (info: LoggedInfo) => {
    setLastLogged(info);
    window.dispatchEvent(new Event(DATA_CHANGED));
  };

  return (
    <>
      {pathname !== "/chat" && (
        <button type="button" className="qa-fab" onClick={show} aria-label="Quick add a food">
          <Plus size={22} />
        </button>
      )}
      {open && (
        <div className="qa-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div className="qa-panel" role="dialog" aria-modal="true" aria-label="Quick add a food">
            <div className="qa-search">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="What did you eat? Try “idli”, “dal”, “banana”…"
                aria-label="Search foods"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="qa-close" onClick={close} aria-label="Close quick add">
                <X size={16} />
              </button>
            </div>

            <div className="qa-body">
              {lastLogged && (
                <div className="qa-done" role="status">
                  <span className="qa-done-check" aria-hidden="true">✓</span>
                  Logged <b>{lastLogged.matched_to}</b> · {Math.round(lastLogged.calories)} kcal. Add another or press Esc.
                </div>
              )}
              {options === null && !busy && (
                <div className="qa-hint">
                  <p>Search the food database, pick a portion, and it&apos;s on today&apos;s plate.</p>
                  <div className="qa-starters">
                    {STARTERS.map((s) => (
                      <button key={s} type="button" className="qa-starter" onClick={() => setQ(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {busy && options === null && (
                <div className="qa-skeleton" aria-label="Searching">
                  <span /><span /><span />
                </div>
              )}
              {options !== null && options.length === 0 && !busy && (
                <p className="qa-empty">No match for “{q.trim()}”. Try a simpler name, or ask the coach in chat.</p>
              )}
              {options !== null && options.length > 0 && (
                <FoodOptionList options={options} hiddenByDiet={hidden} defaultMeal={mealForNow()} onLogged={onLogged} />
              )}
            </div>
            <div className="qa-foot">
              <span><kbd>Esc</kbd> close</span>
              <span><kbd>Ctrl</kbd> <kbd>K</kbd> toggle</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
