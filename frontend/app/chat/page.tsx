"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AlarmClock, AlertTriangle, Camera, CheckCircle2, ExternalLink, MapPin, Mic, Plus, Search, Send, ShoppingCart, Sparkles, Square, Star, Trash2, Volume2, VolumeX, X } from "lucide-react";
import Shell, { API } from "../components/Shell";
import { useVoiceChat } from "../hooks/useVoiceChat";

type ToolEvent = { tool: string; args: Record<string, unknown>; result: Record<string, unknown> };
type ChatMsg = { role: "user" | "assistant"; content: string; tool_events?: ToolEvent[]; created_at?: string; pending?: boolean; image?: string };
type Profile = { name?: string };
type ChatDay = { date: string; messages: number; preview: string };

/** Shrinks a photo to max 1024px and re-encodes as JPEG so uploads stay small and fast. */
function fileToDataUrl(file: File, maxSide = 1024, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Could not read this image.")); return; }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this image. Try a JPG or PNG photo.")); };
    img.src = url;
  });
}

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

type Coords = { lat: number; lng: number };
const LOC_KEY = "nutrisync_location";
const NEARBY_INTENT = /\b(near(by| me)?|around me|close by|restaurants?|hotels?|places? to eat|eat out|cafes?|dine|dining)\b/i;

function getPosition(): Promise<Coords | null> {
  return new Promise(resolve => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

type Restaurant = {
  name: string; type?: string | null; address?: string | null; rating?: number | null; rating_count?: number;
  price?: string | null; open_now?: boolean | null; hours?: string | null; distance_m?: number | null; likely_pure_veg?: boolean;
  serves_vegetarian?: boolean | null; summary?: string | null; maps_url?: string | null; website?: string | null;
};

function RestaurantCard({ r }: { r: Restaurant }) {
  const dist = r.distance_m == null ? "" : r.distance_m < 1000 ? `${r.distance_m} m` : `${(r.distance_m / 1000).toFixed(1)} km`;
  return (
    <div className="resto-card">
      <div className="resto-head">
        <b>{r.name}</b>
        {r.likely_pure_veg ? <span className="resto-tag veg">Veg</span> : r.serves_vegetarian ? <span className="resto-tag">Veg options</span> : null}
      </div>
      <div className="resto-meta">
        {r.rating != null && <span><Star size={12} /> {r.rating}{r.rating_count ? ` (${r.rating_count})` : ""}</span>}
        {r.price && <span>{r.price}</span>}
        {dist && <span>{dist}</span>}
        {r.open_now != null && <span className={r.open_now ? "open" : "closed"}>{r.open_now ? "Open now" : "Closed now"}</span>}
      </div>
      {r.type && <div className="resto-sub">{r.type}</div>}
      {r.address && <div className="resto-sub">{r.address}</div>}
      {r.hours && <div className="resto-sub">Hours: {r.hours}</div>}
      {r.summary && <div className="resto-sub">{r.summary}</div>}
      <div className="resto-links">
        {r.maps_url && <a href={r.maps_url} target="_blank" rel="noopener noreferrer"><MapPin size={12} /> Maps &amp; menu</a>}
        {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Website</a>}
      </div>
    </div>
  );
}

type GroceryLine = { name: string; added?: string; removed?: string; now_have?: string };
type MealLine = { name: string; grams: number; matched_to?: string; calories: number; protein_g: number; carbs_g: number; fat_g: number };

function ToolCard({ event }: { event: ToolEvent }) {
  const { tool, result } = event;
  if (tool === "set_reminder") {
    if (result.status !== "created") {
      return <div className="tool-card tool-card-warn"><AlertTriangle size={14} /> Reminder not set — {String(result.error || "unknown error")}</div>;
    }
    const r = result.reminder as { kind: string; remind_time: string; repeat: string; food_name?: string | null; water_l?: number | null; auto_log?: boolean };
    const what = r.kind === "water" ? `Drink ${Math.round((r.water_l || 0) * 1000)} ml water` : String(r.food_name);
    return <div className="tool-card tool-card-logged"><AlarmClock size={14} /> Reminder set: {what} at {r.remind_time} · {r.repeat === "daily" ? "every day" : "once"}{r.auto_log ? " · auto-logs" : ""}</div>;
  }
  if (tool === "add_grocery_items" || tool === "remove_grocery_items") {
    const adding = tool === "add_grocery_items";
    if (result.status !== "ok" || !Array.isArray(result.items)) {
      return <div className="tool-card tool-card-warn"><AlertTriangle size={14} /> Grocery list not changed — {String(result.error || "unknown error")}</div>;
    }
    return (
      <div className="tool-card tool-card-logged grocery-card">
        <div><CheckCircle2 size={14} /> {adding ? "Added to your grocery list" : "Updated your grocery list"}</div>
        <ul>
          {(result.items as GroceryLine[]).map((i, n) => (
            <li key={n}><b>{i.name}</b> {adding ? `+${i.added}` : `−${i.removed}`} <span>(now {i.now_have})</span></li>
          ))}
        </ul>
      </div>
    );
  }
  if (tool === "analyze_grocery_meal") {
    if (result.status !== "ok") return null;
    const lines = (result.ingredients || []) as MealLine[];
    const t = result.totals as { calories: number; protein_g: number; carbs_g: number; fat_g: number };
    return (
      <div className="tool-card grocery-meal">
        <div className="grocery-meal-title"><ShoppingCart size={14} /> {String(result.meal_name)} <span>from your grocery list</span></div>
        <ul>
          {lines.map((l, n) => <li key={n}><b>{l.name}</b> {l.grams} g <span>{Math.round(l.calories)} kcal · {l.protein_g}g protein</span></li>)}
        </ul>
        <div className="grocery-meal-total">
          <span><b>{Math.round(t.calories)}</b> kcal</span>
          <span><b>{t.protein_g}</b> g protein</span>
          <span><b>{t.carbs_g}</b> g carbs</span>
          <span><b>{t.fat_g}</b> g fat</span>
        </div>
      </div>
    );
  }
  if (tool === "find_restaurants") {
    if (result.status === "ok" && Array.isArray(result.restaurants)) {
      return <div className="resto-stack">{(result.restaurants as Restaurant[]).map((r, i) => <RestaurantCard r={r} key={i} />)}</div>;
    }
    if (result.status === "need_location") {
      return <div className="tool-card tool-card-warn"><MapPin size={14} /> Location needed — tap the pin next to the message box, or tell me your area.</div>;
    }
    return <div className="tool-card tool-card-warn"><AlertTriangle size={14} /> {String(result.error || result.message || "Restaurant search failed.")}</div>;
  }
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
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const coordsRef = useRef<Coords | null>(null);
  coordsRef.current = coords;
  const fileRef = useRef<HTMLInputElement>(null);
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
    try {
      const saved = localStorage.getItem(LOC_KEY);
      if (saved) setCoords(JSON.parse(saved));
    } catch { /* ignore */ }
    fetch(`${API}/api/profile`).then(r => r.json()).then(setProfile).catch(() => {});
    loadDays();
  }, [loadDays]);

  // Each day is its own chat page: switching the day loads only that day's messages.
  useEffect(() => { loadDay(selectedDate); }, [selectedDate, loadDay]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  /** Sends one message to the coach. Returns the reply text, "" if busy, or null on failure. */
  const sendText = useCallback(async (text: string, image?: string | null): Promise<string | null> => {
    const clean = text.trim();
    if (!clean && !image) return "";
    if (loadingRef.current) return "";
    if (selectedRef.current !== today) return "";
    loadingRef.current = true;
    setError("");
    setMessages(current => [...current, { role: "user", content: clean || "📷 Meal photo", image: image || undefined }]);
    setLoading(true);
    try {
      // "restaurants near me": ask the browser for the location once, then remember it on this device.
      let where = coordsRef.current;
      if (!where && NEARBY_INTENT.test(clean)) {
        where = await getPosition();
        if (where) {
          setCoords(where);
          try { localStorage.setItem(LOC_KEY, JSON.stringify(where)); } catch { /* ignore */ }
        }
      }
      const response = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, image: image || null, location: where }),
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
    if ((!text && !pendingImage) || loading) return;
    const image = pendingImage;
    setInput("");
    setPendingImage(null);
    await sendText(text, image);
  }

  async function toggleLocation() {
    if (coords) {
      setCoords(null);
      try { localStorage.removeItem(LOC_KEY); } catch { /* ignore */ }
      return;
    }
    const where = await getPosition();
    if (!where) { setError("Couldn't get your location. Allow location access in the browser, or just tell me your area."); return; }
    setError("");
    setCoords(where);
    try { localStorage.setItem(LOC_KEY, JSON.stringify(where)); } catch { /* ignore */ }
  }

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    try {
      setError("");
      setPendingImage(await fileToDataUrl(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this image.");
    }
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
          <p className="subtitle">Type, tap the mic, snap a photo of your meal, or ask for restaurants near you. Tell me what you ate, like &quot;I had 2 idli and chai&quot;, and I&apos;ll look it up, show you the numbers, and ask before logging anything.</p>
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
                  <div className={`chat-bubble ${message.role}`}>
                    {message.image && <img className="chat-photo" src={message.image} alt="Meal photo you sent" />}
                    {message.content}
                  </div>
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

          {isToday && pendingImage && (
            <div className="photo-preview">
              <img src={pendingImage} alt="Photo ready to send" />
              <span>Photo ready — press Send and I&apos;ll identify the meal.</span>
              <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove photo"><X size={16} /></button>
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
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
              <button
                type="button"
                className={`mic-btn photo-btn ${pendingImage ? "on" : ""}`}
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                aria-label="Upload or take a meal photo"
                title="Upload or take a meal photo"
              >
                <Camera size={18} />
              </button>
              <button
                type="button"
                className={`mic-btn loc-btn ${coords ? "on" : ""}`}
                onClick={toggleLocation}
                aria-pressed={!!coords}
                aria-label={coords ? "Location on. Tap to turn off" : "Share my location for nearby restaurants"}
                title={coords ? "Location shared for nearby restaurants (tap to turn off)" : "Share my location for nearby restaurants"}
              >
                <MapPin size={18} />
              </button>
              <input
                autoFocus
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder={pendingImage ? "Add a note about the photo (optional)…" : voice.active ? "Voice mode is on. You can also type here…" : "e.g. I had 1 idli and a cup of chai..."}
                disabled={loading}
              />
              <button className="primary-btn" disabled={loading || (!input.trim() && !pendingImage)}><Send size={16} /> Send</button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}