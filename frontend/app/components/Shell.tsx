"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Activity, AlarmClock, Bell, ChevronRight, Home, Leaf, MessageCircle, Sparkles, Utensils, X } from "lucide-react";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type NavKey = "overview" | "log" | "plans" | "progress" | "reminders" | "chat" | "profile";

const NAV: { key: NavKey; label: string; href: string; Icon: typeof Home }[] = [
  { key: "overview", label: "Overview", href: "/", Icon: Home },
  { key: "log", label: "Food log", href: "/log", Icon: Utensils },
  { key: "plans", label: "Meal plans", href: "/meal-plans", Icon: Leaf },
  { key: "progress", label: "Progress", href: "/progress", Icon: Activity },
  { key: "reminders", label: "Reminders", href: "/reminders", Icon: AlarmClock },
];

type Pattern = { pattern_type: string; description: string; detected_on: string };
type ReminderEvent = { id: number; title: string; message: string; fired_at: string };

const LAST_EVENT_KEY = "nutrisync_last_reminder_event";

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
  const [toast, setToast] = useState<ReminderEvent | null>(null);
  const [unseen, setUnseen] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/profile`).then(r => r.json()).then(p => setName(p.name || "")).catch(() => {});
    fetch(`${API}/api/patterns`).then(r => r.json()).then(d => setPatterns(d.patterns || [])).catch(() => {});
  }, []);

  // Reminder alerts: the backend fires reminders on schedule; every open tab polls for new ones
  // and shows an in-page toast (plus a system notification if the user allowed it).
  useEffect(() => {
    let cancelled = false;
    const readLast = () => Number(window.localStorage.getItem(LAST_EVENT_KEY) || "-1");
    const poll = async () => {
      try {
        const data = await fetch(`${API}/api/reminders/events`, { cache: "no-store" }).then(r => r.json());
        if (cancelled) return;
        const list: ReminderEvent[] = data.events || [];
        setEvents(list.slice(0, 8));
        const newest = list.length ? list[0].id : 0;
        const last = readLast();
        if (last < 0) { window.localStorage.setItem(LAST_EVENT_KEY, String(newest)); return; }  // first visit: don't replay history
        const fresh = list.filter(e => e.id > last);
        if (fresh.length) {
          window.localStorage.setItem(LAST_EVENT_KEY, String(newest));
          setToast(fresh[0]);
          setUnseen(true);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            fresh.forEach(e => new Notification(e.title, { body: e.message }));
          }
        }
      } catch { /* backend offline: try again next tick */ }
    };
    poll();
    const timer = window.setInterval(poll, 20000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 12000);
    return () => window.clearTimeout(t);
  }, [toast]);

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
              <button className="icon-btn" onClick={() => { setBellOpen(open => !open); setUnseen(false); }} aria-label="Notifications" aria-expanded={bellOpen}>
                <Bell size={18} />
                {(patterns.length > 0 || unseen) && <span className="badge-dot" />}
              </button>
              {bellOpen && (
                <div className="notif-dropdown" role="dialog" aria-label="Notifications">
                  <b>What I&apos;ve noticed</b>
                  {patterns.length === 0
                    ? <p>You&apos;re all caught up. Log a few more days and I&apos;ll start spotting patterns.</p>
                    : patterns.map(p => <p key={p.pattern_type}>{p.description}</p>)}
                  {events.length > 0 && (
                    <>
                      <b className="notif-sub">Recent reminders</b>
                      {events.slice(0, 4).map(e => <p key={e.id}><span className="notif-time">{e.fired_at.slice(11, 16)}</span> {e.message}</p>)}
                    </>
                  )}
                </div>
              )}
            </div>
            <Link className="avatar avatar-link" href="/profile" aria-label="Open your profile" title="Your profile">{initial}</Link>
          </div>
        </header>
        {children}
      </section>
      {toast && (
        <div className="reminder-toast" role="status">
          <AlarmClock size={18} />
          <div><b>{toast.title}</b><p>{toast.message}</p></div>
          <button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button>
        </div>
      )}
    </main>
  );
}