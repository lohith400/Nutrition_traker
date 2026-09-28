"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Mic, Plus, Search, Send, Sparkles, Square, Trash2, Volume2, VolumeX } from "lucide-react";
import Shell, { API } from "../components/Shell";
import { useVoiceChat } from "../hooks/useVoiceChat";

type ToolEvent = { tool: string; args: Record<string, unknown>; result: Record<string, unknown> };
type ChatMsg = { role: "user" | "assistant"; content: string; tool_events?: ToolEvent[]; created_at?: string; pending?: boolean };
type Profile = { name?: string };
type ChatDay = { date: string; messages: number; preview: string };

function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  const date = new Date(`${iso}T00:00:00`);
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

const PHASE_LABEL = { idle: "", listening: "Listening… speak now", thinking: "Coach is thinking…", speaking: "Coach is speaking… tap to interrupt" } as const;

function ToolCard({ event }: { event: ToolEvent }) {
  const { tool, result } = event;
  if (tool === "lookup_food") {
    if (result.status === "not_found") {
      return <div className="tool-card tool-card-warn"><Search size={14} /> Couldn&apos;t find &quot;{String(result.item)}&quot; in the food database.</div>;
    }
    return (
      <div className="tool-card tool-card-found">
        <div className="tool-card-head">
          <Search size={14} /> Found in database: <b>{String(result.food_name)}</b>{" "}
          {result.quantity
            ? result.unit === "grams"
              ? `× ${result.quantity}g`
              : `× ${result.quantity} ${result.serving_label || "serving"}${Number(result.quantity) === 1 ? "" : "s"}`
            : ""}
        </div>
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
    if (result.status !== "logged") {
      const reason = String(result.error || result.message || result.status || "unknown error");
      return <div className="tool-card tool-card-warn"><AlertTriangle size={14} /> Not logged — {reason}</div>;
    }
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
  const [today, setToday] = useState(localToday());
  const [selectedDate, setSelectedDate] = useState(localToday());
  const [chatDays, setChatDays] = useState<ChatDay[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const selectedRef = useRef(selectedDate);
  selectedRef.current = selectedDate;

  const isToday = selectedDate === today;

  const loadDays = useCallback(() => {
    fetch(`${API}/api/chat/days`, { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        if (data.today) setToday(data.today);
        setChatDays(data.days || []);
      })
      .catch(() => {});
  }, []);

  const loadDay = useCallback((date: string) => {
    setHistoryLoaded(false);
    fetch(`${API}/api/chat/history?date=${date}`, { cache: "no-store" })
      .then(r => r.json())
      .then(data => { if (selectedRef.current === date) setMessages(data.messages || []); })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => { if (selectedRef.current === date) setHistoryLoaded(true); });
  }, []);

  useEffect(() => {
    fetch(`${API}/api/profile`).then(r => r.json()).then(setProfile).catch(() => {});
    loadDays();
  }, [loadDays]);

  // Each day is its own chat page: switching the day loads only that day's messages.
  useEffect(() => { loadDay(selectedDate); }, [selectedDate, loadDay]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  /** Sends one message to the coach. Returns the reply text, "" if busy, or null on failure. */
  const sendText = useCallback(async (text: string): Promise<string | null> => {
    const clean = text.trim();
    if (!clean) return "";
    if (loadingRef.current) return "";
    if (selectedRef.current !== today) return "";
    loadingRef.current = true;
    setError("");
    setMessages(current => [...current, { role: "user", content: clean }]);
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The coach could not reply.");
      setMessages(current => [...current, { role: "assistant", content: data.reply, tool_events: data.tool_events || [] }]);
      loadDays();
      return data.reply as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "The coach is unavailable. Check your API key and backend.");
      setMessages(current => [...current, { role: "assistant", content: "Sorry, I couldn't process that just now. Please try again." }]);
      return null;
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [today, loadDays]);

  const voice = useVoiceChat({ onUtterance: sendText });

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await sendText(text);
  }

  async function clearChat() {
    if (!confirm(`Clear ${dayLabel(selectedDate, today).toLowerCase()}'s conversation? This can't be undone.`)) return;
    voice.stop();
    await fetch(`${API}/api/chat/history?date=${selectedDate}`, { method: "DELETE" }).catch(() => {});
    setMessages([]);
    loadDays();
  }

  function pickDay(date: string) {
    if (date === selectedDate) return;
    voice.stop();
    setError("");
    setSelectedDate(date);
  }

  const name = profile?.name || "there";
  const initial = name[0]?.toUpperCase() || "N";
  const micLabel = voice.active ? "Stop voice conversation" : "Start voice conversation";

  return (
    <Shell
      active="chat"
      crumb="Coach chat"
      className="chat-main"
      actions={<button className="icon-btn" onClick={clearChat} aria-label="Clear this day's conversation" title="Clear this day's conversation"><Trash2 size={18} /></button>}
    >
      <div className="chat-wrap">
        <div className="chat-intro">
          <h1>Chat about your food <span>✦</span></h1>
          <p className="subtitle">Type or tap the mic and just talk. Tell me what you ate, like &quot;I had 2 idli and chai&quot;, and I&apos;ll look it up, show you the numbers, and ask before logging anything.</p>
        </div>

        <div className="chat-days" role="tablist" aria-label="Chat days">
          {(chatDays.some(d => d.date === today) ? chatDays : [{ date: today, messages: 0, preview: "" }, ...chatDays]).map(day => (
            <button
              key={day.date}
              role="tab"
              aria-selected={day.date === selectedDate}
              className={`chat-day-chip ${day.date === selectedDate ? "active" : ""}`}
              onClick={() => pickDay(day.date)}
              title={day.preview || "No messages yet"}
            >
              <b>{dayLabel(day.date, today)}</b>
              <span>{day.messages} msg{day.messages === 1 ? "" : "s"}</span>
            </button>
          ))}
        </div>

        <div className="chat-panel">
          <div className="chat-messages" ref={listRef}>
            {!historyLoaded && <p className="empty-state">Loading conversation…</p>}
            {historyLoaded && messages.length === 0 && (
              <div className="chat-empty">
                <div className="coach-badge chat-empty-badge"><Sparkles size={20} /></div>
                {isToday
                  ? <p>No messages yet. Type, or tap the mic and say: <i>&quot;I had 1 idli and a cup of chai&quot;</i></p>
                  : <p>No conversation on this day.</p>}
              </div>
            )}
            {messages.map((message, index) => (
              <div className={`chat-row ${message.role}`} key={index}>
                <div className="chat-avatar">{message.role === "user" ? initial : <Sparkles size={14} />}</div>
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
          {voice.error && (
            <div className="notice-banner chat-error voice-error" role="alert">
              <Mic size={16} />{voice.error}
              <button onClick={voice.clearError} aria-label="Dismiss">×</button>
            </div>
          )}

          {isToday && voice.active && (
            <div className={`voice-bar ${voice.phase}`} role="status" aria-live="polite">
              <button
                className="voice-bar-main"
                onClick={voice.phase === "speaking" ? voice.interrupt : undefined}
                disabled={voice.phase !== "speaking"}
                aria-label={voice.phase === "speaking" ? "Interrupt the coach" : PHASE_LABEL[voice.phase]}
              >
                <span className="voice-wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                <span className="voice-text">
                  <b>{PHASE_LABEL[voice.phase]}</b>
                  {voice.interim && <em>{voice.interim}</em>}
                </span>
              </button>
              <button
                className="voice-toggle"
                onClick={() => voice.setSpeakReplies(!voice.speakReplies)}
                aria-pressed={voice.speakReplies}
                aria-label={voice.speakReplies ? "Mute coach voice" : "Unmute coach voice"}
                title={voice.speakReplies ? "Mute coach voice" : "Unmute coach voice"}
              >
                {voice.speakReplies ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </button>
              <button className="voice-stop" onClick={voice.stop}><Square size={13} /> End</button>
            </div>
          )}

          {!isToday && (
            <div className="chat-readonly">
              <span>This is {dayLabel(selectedDate, today)}&apos;s chat, read-only.</span>
              <button className="primary-btn" onClick={() => pickDay(today)}><Plus size={15} /> Back to today&apos;s chat</button>
            </div>
          )}

          {isToday && (
          <form className="chat-input-row" onSubmit={send}>
              <button
                type="button"
                className={`mic-btn ${voice.active ? "on" : ""}`}
                onClick={voice.active ? voice.stop : voice.start}
                disabled={!voice.supported}
                aria-label={micLabel}
                aria-pressed={voice.active}
                title={voice.supported ? micLabel : "Voice input works in Chrome, Edge or Safari"}
              >
                {voice.active ? <Square size={16} /> : <Mic size={18} />}
              </button>
              <input
                autoFocus
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder={voice.active ? "Voice mode is on. You can also type here…" : "e.g. I had 1 idli and a cup of chai..."}
                disabled={loading}
              />
              <button className="primary-btn" disabled={loading || !input.trim()}><Send size={16} /> Send</button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}