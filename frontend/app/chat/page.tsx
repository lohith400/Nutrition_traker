"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Activity, Bell, CheckCircle2, ChevronRight, Home, Leaf, MessageCircle, Search, Send, Sparkles, Trash2, Utensils, Zap } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const nav = [["Overview", Home], ["Food log", Utensils], ["Meal plans", Leaf], ["Progress", Activity]] as const;

type ToolEvent = { tool: string; args: Record<string, unknown>; result: Record<string, unknown> };
type ChatMsg = { role: "user" | "assistant"; content: string; tool_events?: ToolEvent[]; created_at?: string; pending?: boolean };
type Profile = { name?: string };

function ToolCard({ event }: { event: ToolEvent }) {
  const { tool, result } = event;
  if (tool === "lookup_food") {
    if (result.status === "not_found") {
      return <div className="tool-card tool-card-warn"><Search size={14} /> Couldn&apos;t find &quot;{String(result.item)}&quot; in the food database.</div>;
    }
    return (
      <div className="tool-card tool-card-found">
        <div className="tool-card-head"><Search size={14} /> Found in database: <b>{String(result.food_name)}</b> {result.quantity ? `× ${result.quantity}` : ""}</div>
        <div className="tool-card-macros">
          <span><b>{String(result.calories)}</b> kcal</span>
          <span><b>{String(result.protein_g)}g</b> protein</span>
          <span><b>{String(result.carbs_g)}g</b> carbs</span>
          <span><b>{String(result.fat_g)}g</b> fat</span>
        </div>
        {typeof result.data_quality_warning === "string" && <div className="tool-card-note">{result.data_quality_warning}</div>}
      </div>
    );
  }
  if (tool === "log_food") {
    if (result.status !== "logged") return null;
    return <div className="tool-card tool-card-logged"><CheckCircle2 size={14} /> Logged <b>{String(result.matched_to)}</b> — {String(result.calories)} kcal, {String(result.protein_g)}g protein.</div>;
  }
  return null;
}

export default function ChatPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/profile`).then(r => r.json()).then(setProfile).catch(() => {});
    fetch(`${API}/api/chat/history`)
      .then(r => r.json())
      .then(data => setMessages(data.messages || []))
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => setHistoryLoaded(true));
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setError("");
    setInput("");
    setMessages(current => [...current, { role: "user", content: text }]);
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The coach could not reply.");
      setMessages(current => [...current, { role: "assistant", content: data.reply, tool_events: data.tool_events || [] }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The coach is unavailable. Check your API key and backend.");
      setMessages(current => [...current, { role: "assistant", content: "Sorry, I couldn't process that just now. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  async function clearChat() {
    if (!confirm("Clear this conversation? This can't be undone.")) return;
    await fetch(`${API}/api/chat/history`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
  }

  const name = profile?.name || "there";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-badge"><Sparkles size={18} /></span>Nutri<span>Sync</span></div>
        <div className="workspace-card"><div className="avatar avatar-sm">{name[0]?.toUpperCase() || "N"}</div><div><b>{name}&apos;s space</b><small>Personal plan</small></div></div>
        <nav className="nav">
          {nav.map(([label, Icon]) => (
            <Link className="nav-item" href="/" key={label}><Icon size={18} />{label}</Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item"><Zap size={18} />Daily focus</button>
          <Link className="nav-item active" href="/chat"><MessageCircle size={18} />Coach chat</Link>
          <div className="profile-mini"><div className="avatar">{name[0]?.toUpperCase() || "N"}</div><div><b>{name}</b><small>Personal plan</small></div></div>
        </div>
      </aside>

      <section className="main-panel chat-main">
        <header className="topbar">
          <div className="crumbs">My nutrition <ChevronRight size={15} /> <b>Coach chat</b></div>
          <div className="top-actions">
            <button className="icon-btn" onClick={clearChat} aria-label="Clear conversation" title="Clear conversation"><Trash2 size={18} /></button>
            <Bell size={18} />
            <div className="avatar">{name[0]?.toUpperCase() || "N"}</div>
          </div>
        </header>

        <div className="chat-wrap">
          <div className="chat-intro">
            <p className="eyebrow">NUTRISYNC COACH</p>
            <h1>Chat about your food <span>✦</span></h1>
            <p className="subtitle">Tell me what you ate — e.g. &quot;I had 2 idli and chai&quot; — and I&apos;ll look it up in the nutrition database, show you the numbers, and ask before logging anything.</p>
          </div>

          <div className="chat-panel">
            <div className="chat-messages" ref={listRef}>
              {!historyLoaded && <p className="empty-state">Loading conversation…</p>}
              {historyLoaded && messages.length === 0 && (
                <div className="chat-empty">
                  <div className="coach-badge chat-empty-badge"><Sparkles size={20} /></div>
                  <p>No messages yet. Try: <i>&quot;I had 1 idli and a cup of chai&quot;</i></p>
                </div>
              )}
              {messages.map((message, index) => (
                <div className={`chat-row ${message.role}`} key={index}>
                  <div className="chat-avatar">{message.role === "user" ? (name[0]?.toUpperCase() || "N") : <Sparkles size={14} />}</div>
                  <div className="chat-bubble-col">
                    <div className={`chat-bubble ${message.role}`}>{message.content}</div>
                    {message.tool_events && message.tool_events.length > 0 && (
                      <div className="tool-card-stack">
                        {message.tool_events.map((event, eventIndex) => <ToolCard event={event} key={eventIndex} />)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="chat-row assistant">
                  <div className="chat-avatar"><Sparkles size={14} /></div>
                  <div className="chat-bubble-col"><div className="chat-bubble assistant typing"><span /><span /><span /></div></div>
                </div>
              )}
            </div>

            {error && <div className="notice-banner chat-error"><Sparkles size={16} />{error}</div>}

            <form className="chat-input-row" onSubmit={send}>
              <input
                autoFocus
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="e.g. I had 1 idli and a cup of chai..."
                disabled={loading}
              />
              <button className="primary-btn" disabled={loading || !input.trim()}><Send size={16} /> Send</button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}