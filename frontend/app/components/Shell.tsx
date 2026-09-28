"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Activity, Bell, ChevronRight, Home, Leaf, MessageCircle, Sparkles, Utensils } from "lucide-react";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type NavKey = "overview" | "log" | "plans" | "progress" | "chat" | "profile";

const NAV: { key: NavKey; label: string; href: string; Icon: typeof Home }[] = [
  { key: "overview", label: "Overview", href: "/", Icon: Home },
  { key: "log", label: "Food log", href: "/log", Icon: Utensils },
  { key: "plans", label: "Meal plans", href: "/meal-plans", Icon: Leaf },
  { key: "progress", label: "Progress", href: "/progress", Icon: Activity },
];

type Pattern = { pattern_type: string; description: string; detected_on: string };

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
                {patterns.length > 0 && <span className="badge-dot" />}
              </button>
              {bellOpen && (
                <div className="notif-dropdown" role="dialog" aria-label="Notifications">
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
    </main>
  );
}