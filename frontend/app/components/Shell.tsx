"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Activity, AlarmClock, Bell, ChevronRight, Home, Leaf, MessageCircle, ShoppingCart, Sparkles, Utensils } from "lucide-react";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type NavKey = "overview" | "log" | "plans" | "grocery" | "reminders" | "progress" | "chat" | "profile";

const NAV: { key: NavKey; label: string; href: string; Icon: typeof Home }[] = [
  { key: "overview", label: "Overview", href: "/", Icon: Home },
  { key: "log", label: "Food log", href: "/log", Icon: Utensils },
  { key: "plans", label: "Meal plans", href: "/meal-plans", Icon: Leaf },
  { key: "grocery", label: "Grocery", href: "/grocery", Icon: ShoppingCart },
  { key: "reminders", label: "Reminders", href: "/reminders", Icon: AlarmClock },
  { key: "progress", label: "Progress", href: "/progress", Icon: Activity },
];

type Pattern = { pattern_type: string; description: string; detected_on: string };
type ReminderEvent = { id: number; title: string; message: string; fired_at: string };

type ShellProps = {
  active: NavKey;
  crumb: string;
  /** Extra buttons shown in the top bar, left of the bell. */
  actions?: ReactNode;
  /** Adds the flex-column layout the chat page needs. */
  className?: string;
  children: ReactNode;
};

export default function Shell({ active, crumb, actions, className = "", children }: ShellProps) {
  const [name, setName] = useState("");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<ReminderEvent[]>([]);
  const [toasts, setToasts] = useState<ReminderEvent[]>([]);
  const lastEventId = useRef<number | null>(null);

  // Reminders that fire while a tab is open: show a toast (and a browser alert if allowed).
  useEffect(() => {
    let stopped = false;
    const poll = () => {
      const since = lastEventId.current ?? 0;
      fetch(`${API}/api/reminders/events?since_id=${since}&limit=20`, { cache: "no-store" })
        .then(r => r.json())
        .then(d => {
          if (stopped) return;
          const list: ReminderEvent[] = d.events || [];
          const newest = list.reduce((m, e) => Math.max(m, e.id), since);
          if (lastEventId.current === null) {
            // First load: remember what already fired so old reminders don't pop up.
            lastEventId.current = newest;
            setEvents(list.slice(0, 5));
            return;
          }
          lastEventId.current = newest;
          if (list.length === 0) return;
          setEvents(cur => [...list, ...cur].slice(0, 8));
          setToasts(cur => [...cur, ...list]);
          list.forEach(e => {
            window.setTimeout(() => setToasts(cur => cur.filter(t => t.id !== e.id)), 9000);
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              try { new Notification(e.title, { body: e.message }); } catch { /* ignore */ }
            }
          });
        })
        .catch(() => {});
    };
    poll();
    const timer = window.setInterval(poll, 20000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    fetch(`${API}/api/profile`).then(r => r.json()).then(p => setName(p.name || "")).catch(() => {});
    fetch(`${API}/api/patterns`).then(r => r.json()).then(d => setPatterns(d.patterns || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!bellOpen) return;
    const close = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [bellOpen]);

  const display = name || "there";
  const initial = name ? name[0].toUpperCase() : "N";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-badge"><Sparkles size={18} /></span>Nutri<span>Sync</span></div>
        <Link className="workspace-card" href="/profile" aria-label="Open your profile">
          <div className="avatar avatar-sm">{initial}</div>
          <div><b>{display}&apos;s space</b><small>Personal plan</small></div>
        </Link>
        <nav className="nav">
          {NAV.map(({ key, label, href, Icon }) => (
            <Link className={key === active ? "nav-item active" : "nav-item"} href={href} key={key} aria-current={key === active ? "page" : undefined}>
              <Icon size={18} />{label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <Link className={active === "chat" ? "nav-item active" : "nav-item"} href="/chat"><MessageCircle size={18} />Coach chat</Link>
          <Link className={active === "profile" ? "profile-mini active" : "profile-mini"} href="/profile">
            <div className="avatar">{initial}</div>
            <div><b>{display}</b><small>View profile</small></div>
          </Link>
        </div>
      </aside>

      <section className={`main-panel ${className}`.trim()}>
        <header className="topbar">
          <div className="crumbs">My nutrition <ChevronRight size={15} /> <b>{crumb}</b></div>
          <div className="top-actions">
            {actions}
            <div className="notif-wrap" ref={bellRef}>
              <button className="icon-btn" onClick={() => setBellOpen(open => !open)} aria-label="Notifications" aria-expanded={bellOpen}>
                <Bell size={18} />
                {(patterns.length > 0 || toasts.length > 0) && <span className="badge-dot" />}
              </button>
              {bellOpen && (
                <div className="notif-dropdown" role="dialog" aria-label="Notifications">
                  {events.length > 0 && (
                    <>
                      <b>Recent reminders</b>
                      {events.slice(0, 4).map(e => <p key={e.id}>{e.message}</p>)}
                    </>
                  )}
                  <b>What I&apos;ve noticed</b>
                  {patterns.length === 0
                    ? <p>You&apos;re all caught up. Log a few more days and I&apos;ll start spotting patterns.</p>
                    : patterns.map(p => <p key={p.pattern_type}>{p.description}</p>)}
                </div>
              )}
            </div>
            <Link className="avatar avatar-link" href="/profile" aria-label="Open your profile" title="Your profile">{initial}</Link>
          </div>
        </header>
        {children}
      </section>
      {toasts.length > 0 && (
        <div className="reminder-toasts" role="status" aria-live="polite">
          {toasts.map(t => (
            <div className="reminder-toast" key={t.id}>
              <AlarmClock size={16} />
              <div><b>{t.title}</b><p>{t.message}</p></div>
              <button onClick={() => setToasts(cur => cur.filter(x => x.id !== t.id))} aria-label="Dismiss">×</button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}