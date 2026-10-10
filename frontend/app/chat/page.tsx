"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  AlarmClock,
  AlertTriangle,
  BookmarkPlus,
  Camera,
  CheckCircle2,
  ChefHat,
  Droplets,
  ExternalLink,
  MapPin,
  Mic,
  Plus,
  Search,
  Send,
  ShoppingCart,
  Sparkles,
  Square,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Shell, { API } from "../components/Shell";
import { useVoiceChat } from "../hooks/useVoiceChat";
import { FoodOption, FoodOptionList, MacroChips } from "../components/FoodOptions";
import { NutritionFacts } from "../components/art/NutritionFacts";
import { streamChat, toolStatusText } from "../lib/chatStream";

type ToolEvent = { tool: string; args: Record<string, unknown>; result: Record<string, unknown> };
type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  tool_events?: ToolEvent[];
  created_at?: string;
  pending?: boolean;
  image?: string;
  /** true while the coach is still writing this reply */
  streaming?: boolean;
  /** what the coach is doing right now ("Looking up idli...") */
  status?: string;
};
type Profile = { name?: string; photo_data?: string | null };
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
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read this image."));
        return;
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this image. Try a JPG or PNG photo."));
    };
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

const PHASE_LABEL = {
  idle: "",
  listening: "Listening… speak now",
  thinking: "Coach is thinking…",
  speaking: "Coach is speaking… tap to interrupt",
} as const;

type Coords = { lat: number; lng: number };
const LOC_KEY = "nutrisync_location";
const LOC_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/** Broadened intent regex catching natural phrasing for restaurant and food searches */
const NEARBY_INTENT =
  /\b(near(by| me)?|around me|close by|around here|restaurants?|hotels?|places? to eat|where can i eat|where to eat|eat out|cafes?|dhabas?|mess|canteen|bistro|eater(y|ies)|dining|dine|food spots?|any good (food|place|spot|dhaba|restaurant))\b/i;

function loadStoredCoords(): Coords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOC_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data.lat === "number" && typeof data.lng === "number") {
      const age = Date.now() - (data.timestamp || 0);
      if (age < LOC_MAX_AGE_MS) {
        return { lat: data.lat, lng: data.lng };
      }
      localStorage.removeItem(LOC_KEY);
    }
  } catch {
    // ignore
  }
  return null;
}

function saveStoredCoords(coords: Coords) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOC_KEY, JSON.stringify({ ...coords, timestamp: Date.now() }));
  } catch {
    // ignore
  }
}

function getPosition(): Promise<{ coords: Coords | null; error?: string }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve({ coords: null, error: "Geolocation is not supported by your browser." });
      return;
    }
    // Check for insecure context (HTTP on non-localhost)
    if (
      window.isSecureContext === false &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      resolve({ coords: null, error: "Location access requires a secure HTTPS connection." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) => {
        let msg = "Could not retrieve your location.";
        if (err.code === 1) {
          msg = "Location permission was denied. Please allow location access in your browser or type your neighborhood / city.";
        } else if (err.code === 2) {
          msg = "Location information is unavailable from your device. Try typing your neighborhood / city.";
        } else if (err.code === 3) {
          msg = "Location request timed out. Please try again or type your neighborhood / city.";
        }
        resolve({ coords: null, error: msg });
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

type Restaurant = {
  name: string;
  type?: string | null;
  address?: string | null;
  rating?: number | null;
  rating_count?: number;
  price?: string | null;
  open_now?: boolean | null;
  hours?: string | null;
  distance_m?: number | null;
  likely_pure_veg?: boolean;
  serves_vegetarian?: boolean | null;
  summary?: string | null;
  maps_url?: string | null;
  website?: string | null;
};

function RestaurantCard({ r }: { r: Restaurant }) {
  const dist =
    r.distance_m == null
      ? ""
      : r.distance_m < 1000
      ? `${r.distance_m} m`
      : `${(r.distance_m / 1000).toFixed(1)} km`;
  return (
    <div className="resto-card">
      <div className="resto-head">
        <b>{r.name}</b>
        {r.likely_pure_veg ? (
          <span className="resto-tag veg">Veg</span>
        ) : r.serves_vegetarian ? (
          <span className="resto-tag">Veg options</span>
        ) : null}
      </div>
      <div className="resto-meta">
        {r.rating != null && (
          <span>
            <Star size={12} /> {r.rating}
            {r.rating_count ? ` (${r.rating_count})` : ""}
          </span>
        )}
        {r.price && <span>{r.price}</span>}
        {dist && <span>{dist}</span>}
        {r.open_now != null && (
          <span className={r.open_now ? "open" : "closed"}>{r.open_now ? "Open now" : "Closed now"}</span>
        )}
      </div>
      {r.type && <div className="resto-sub">{r.type}</div>}
      {r.address && <div className="resto-sub">{r.address}</div>}
      {r.hours && <div className="resto-sub">Hours: {r.hours}</div>}
      {r.summary && <div className="resto-sub">{r.summary}</div>}
      <div className="resto-links">
        {r.maps_url && (
          <a href={r.maps_url} target="_blank" rel="noopener noreferrer">
            <MapPin size={12} /> Maps &amp; menu
          </a>
        )}
        {r.website && (
          <a href={r.website} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={12} /> Website
          </a>
        )}
      </div>
    </div>
  );
}

type GroceryLine = { name: string; added?: string; removed?: string; now_have?: string };
type MealLine = {
  name: string;
  grams: number;
  matched_to?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type RecipeLine = {
  name: string;
  matched_to?: string | null;
  source?: string | null;
  grams?: number | null;
  grams_estimated?: boolean;
  status: string;
  nutrition?: { calories: number; protein_g: number } | null;
  note?: string | null;
};

function RecipeCard({ result }: { result: Record<string, unknown> }) {
  const lines = (result.ingredients || []) as RecipeLine[];
  const per = result.per_serving as { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  const tot = result.totals as typeof per;
  const servings = Number(result.servings) || 1;
  const warnings = (result.warnings || []) as string[];
  const [saved, setSaved] = useState<string>("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const ings = (result.ingredients as Array<Record<string, unknown>>).map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        grams: l.grams,
        food_code: l.food_code || undefined,
        per_100g: l.source === "ai_estimate" ? l.per_100g : undefined,
      }));
      const a = await (
        await fetch(`${API}/api/custom-foods/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: result.name, servings, ingredients: ings, use_ai: false }),
        })
      ).json();
      const good = (a.ingredients || []).filter((l: RecipeLine) => l.status !== "needs_input");
      const res = await fetch(`${API}/api/custom-foods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: result.name, servings, serving_label: "serving", ingredients: good }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save.");
      setSaved(data.food.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-card recipe-card">
      <div className="recipe-title">
        <ChefHat size={15} /> <b>{String(result.name)}</b>{" "}
        <span>{servings === 1 ? "1 serving" : `${servings} servings`}</span>
      </div>
      <ul className="recipe-lines">
        {lines.map((l, i) => (
          <li key={i} className={l.status === "needs_input" ? "miss" : ""}>
            <span>
              <b>{l.name}</b>
              {l.grams ? ` · ${l.grams_estimated ? "≈" : ""}${l.grams} g` : ""}
            </span>
            <em>
              {l.nutrition
                ? `${Math.round(l.nutrition.calories)} kcal · ${l.nutrition.protein_g} g P`
                : "not counted"}
            </em>
          </li>
        ))}
      </ul>
      <div className="recipe-per">
        <small>Per serving</small>
        <MacroChips n={per} big />
      </div>
      {servings !== 1 && (
        <div className="recipe-per">
          <small>Whole recipe</small>
          <MacroChips n={tot} />
        </div>
      )}
      {warnings.map((w, i) => (
        <div className="tool-card-note" key={i}>
          {w}
        </div>
      ))}
      {typeof result.coach_note === "string" && <p className="recipe-coach">{result.coach_note}</p>}
      {saved ? (
        <div className="fo-done">
          <CheckCircle2 size={14} /> Saved as <b>{saved}</b>. You can log it by name now, or manage it on the Custom
          foods page.
        </div>
      ) : (
        <button
          type="button"
          className="ghost-btn recipe-save"
          disabled={busy || lines.every((l) => l.status === "needs_input")}
          onClick={save}
        >
          <BookmarkPlus size={14} /> {busy ? "Saving…" : "Save as custom food"}
        </button>
      )}
      {err && <p className="fo-error">{err}</p>}
    </div>
  );
}

function NeedLocationCard({
  onRetryWithGps,
  onPickArea,
}: {
  onRetryWithGps: () => void;
  onPickArea: (area: string) => void;
}) {
  const [manualArea, setManualArea] = useState("");
  const sampleAreas = ["Indiranagar", "Koramangala", "HSR Layout", "Connaught Place", "Bandra West", "Anna Nagar"];

  return (
    <div className="need-location-card">
      <div className="need-loc-head">
        <MapPin size={16} /> Location needed for restaurant recommendations
      </div>
      <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-light)", lineHeight: 1.5 }}>
        Tap below to use your device GPS, or select/type your neighborhood so I can find spots near you.
      </p>

      <div className="need-loc-actions">
        <button type="button" className="primary-btn small active:scale-95 transition-transform duration-150" onClick={onRetryWithGps}>
          <MapPin size={13} /> Use Current GPS
        </button>
        {sampleAreas.map((area) => (
          <button key={area} type="button" className="area-chip active:scale-95 transition-transform duration-150" onClick={() => onPickArea(area)}>
            {area}
          </button>
        ))}
      </div>

      <form
        className="area-manual-input"
        onSubmit={(e) => {
          e.preventDefault();
          if (manualArea.trim()) onPickArea(manualArea.trim());
        }}
      >
        <input
          placeholder="Or type neighborhood / city (e.g. Powai, Mumbai)…"
          value={manualArea}
          onChange={(e) => setManualArea(e.target.value)}
        />
        <button type="submit" className="ghost-btn small" disabled={!manualArea.trim()}>
          Search Area
        </button>
      </form>
    </div>
  );
}

function ToolCard({
  event,
  onLogged,
  onRetryWithGps,
  onPickArea,
}: {
  event: ToolEvent;
  onLogged?: () => void;
  onRetryWithGps?: () => void;
  onPickArea?: (area: string) => void;
}) {
  const { tool, result } = event;
  if (tool === "analyze_recipe") {
    if (result.status !== "ok") {
      return (
        <div className="tool-card tool-card-warn">
          <AlertTriangle size={14} /> Couldn&apos;t work that out: {String(result.error || "unknown error")}
        </div>
      );
    }
    return <RecipeCard result={result} />;
  }
  if (tool === "set_reminder") {
    if (result.status !== "created") {
      return (
        <div className="tool-card tool-card-warn">
          <AlertTriangle size={14} /> Reminder not set — {String(result.error || "unknown error")}
        </div>
      );
    }
    const r = result.reminder as {
      kind: string;
      remind_time: string;
      repeat: string;
      food_name?: string | null;
      water_l?: number | null;
      auto_log?: boolean;
    };
    const what = r.kind === "water" ? `Drink ${Math.round((r.water_l || 0) * 1000)} ml water` : String(r.food_name);
    return (
      <div className="tool-card tool-card-logged">
        <AlarmClock size={14} /> Reminder set: {what} at {r.remind_time} · {r.repeat === "daily" ? "every day" : "once"}
        {r.auto_log ? " · auto-logs" : ""}
      </div>
    );
  }
  if (tool === "add_grocery_items" || tool === "remove_grocery_items") {
    const adding = tool === "add_grocery_items";
    if (result.status !== "ok" || !Array.isArray(result.items)) {
      return (
        <div className="tool-card tool-card-warn">
          <AlertTriangle size={14} /> Grocery list not changed — {String(result.error || "unknown error")}
        </div>
      );
    }
    return (
      <div className="tool-card tool-card-logged grocery-card">
        <div>
          <CheckCircle2 size={14} /> {adding ? "Added to your grocery list" : "Updated your grocery list"}
        </div>
        <ul>
          {(result.items as GroceryLine[]).map((i, n) => (
            <li key={n}>
              <b>{i.name}</b> {adding ? `+${i.added}` : `−${i.removed}`} <span>(now {i.now_have})</span>
            </li>
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
        <div className="grocery-meal-title">
          <ShoppingCart size={14} /> {String(result.meal_name)} <span>from your grocery list</span>
        </div>
        <ul>
          {lines.map((l, n) => (
            <li key={n}>
              <b>{l.name}</b> {l.grams} g{" "}
              <span>
                {Math.round(l.calories)} kcal · {l.protein_g}g protein
              </span>
            </li>
          ))}
        </ul>
        <div className="grocery-meal-total">
          <span>
            <b>{Math.round(t.calories)}</b> kcal
          </span>
          <span>
            <b>{t.protein_g}</b> g protein
          </span>
          <span>
            <b>{t.carbs_g}</b> g carbs
          </span>
          <span>
            <b>{t.fat_g}</b> g fat
          </span>
        </div>
      </div>
    );
  }
  if (tool === "find_restaurants") {
    if (result.status === "ok" && Array.isArray(result.restaurants)) {
      return (
        <div className="resto-stack">
          {(result.restaurants as Restaurant[]).map((r, i) => (
            <RestaurantCard r={r} key={i} />
          ))}
        </div>
      );
    }
    if (result.status === "need_location") {
      return (
        <NeedLocationCard
          onRetryWithGps={() => onRetryWithGps?.()}
          onPickArea={(area) => onPickArea?.(area)}
        />
      );
    }
    return (
      <div className="tool-card tool-card-warn">
        <AlertTriangle size={14} /> {String(result.error || result.message || "Restaurant search failed.")}
      </div>
    );
  }
  if (tool === "lookup_food") {
    const qtyDefault = Number(result.quantity) > 0 ? Number(result.quantity) : 1;
    const unitDefault = result.unit === "grams" ? "grams" : "serving";
    if (result.status === "options" && Array.isArray(result.options)) {
      return (
        <div className="tool-card fo-card">
          <FoodOptionList
            options={result.options as FoodOption[]}
            title={`Related foods found in the dataset for "${String(result.query)}". Which one did you have?`}
            hiddenByDiet={Number(result.hidden_by_diet) || 0}
            defaultQty={qtyDefault}
            defaultUnit={unitDefault as "serving" | "grams"}
            fromChat
            onLogged={() => onLogged?.()}
          />
        </div>
      );
    }
    if (result.status === "not_found" || result.status === "diet_mismatch") {
      return (
        <div className="tool-card tool-card-warn">
          <Search size={14} />{" "}
          {result.status === "diet_mismatch"
            ? `Foods matching "${String(result.query)}" don't fit your diet.`
            : `Nothing related to "${String(
                result.query || result.item
              )}" in the dataset. Describe it by its ingredients and I can work it out.`}
        </div>
      );
    }
    if (result.status === "found_needs_grams" && result.selected) {
      return (
        <div className="tool-card fo-card">
          <FoodOptionList
            options={[result.selected as FoodOption]}
            title="Exact match. This one has no standard serving, so log it by weight."
            defaultUnit="grams"
            defaultQty={100}
            fromChat
            onLogged={() => onLogged?.()}
          />
        </div>
      );
    }
    const related = Array.isArray(result.related) ? (result.related as FoodOption[]) : [];
    return (
      <div className="tool-card tool-card-found">
        <div className="tool-card-head">
          <Search size={14} /> Found in database: <b>{String(result.food_name)}</b>{" "}
          {result.quantity
            ? result.unit === "grams"
              ? `× ${result.quantity}g`
              : `× ${result.quantity} ${result.serving_label || "serving"}${
                  Number(result.quantity) === 1 ? "" : "s"
                }`
            : ""}
        </div>
        <div className="tool-card-macros">
          <span>
            <b>{String(result.calories)}</b> kcal
          </span>
          <span>
            <b>{String(result.protein_g)}g</b> protein
          </span>
          <span>
            <b>{String(result.carbs_g)}g</b> carbs
          </span>
          <span>
            <b>{String(result.fat_g)}g</b> fat
          </span>
        </div>

        {/* Nutrition Facts Label on Food Found Slip */}
        <details className="fo-more" style={{ marginTop: "10px" }}>
          <summary
            className="almanac-mono"
            style={{ cursor: "pointer", fontSize: "11px", color: "var(--sage-leaf)", fontWeight: 600 }}
          >
            View Nutrition Facts Label ▾
          </summary>
          <div style={{ marginTop: "8px" }}>
            <NutritionFacts
              title={String(result.food_name)}
              subtitle={
                result.unit === "grams"
                  ? `${result.quantity || 100} grams`
                  : `Serving (${result.quantity || 1} portion)`
              }
              calories={Number(result.calories) || 0}
              protein_g={Number(result.protein_g) || 0}
              carbs_g={Number(result.carbs_g) || 0}
              fat_g={Number(result.fat_g) || 0}
              compact
            />
          </div>
        </details>

        {typeof result.data_quality_warning === "string" && (
          <div className="tool-card-note">{result.data_quality_warning}</div>
        )}
        {related.length > 0 && (
          <details className="fo-more">
            <summary>
              Not this one? {related.length} related food{related.length === 1 ? "" : "s"}
            </summary>
            <FoodOptionList
              options={related}
              defaultQty={qtyDefault}
              defaultUnit={unitDefault as "serving" | "grams"}
              fromChat
              onLogged={() => onLogged?.()}
            />
          </details>
        )}
      </div>
    );
  }
  if (tool === "log_food") {
    if (result.status !== "logged") {
      const reason = String(result.error || result.message || result.status || "unknown error");
      return (
        <div className="tool-card tool-card-warn">
          <AlertTriangle size={14} /> Not logged — {reason}
        </div>
      );
    }
    return (
      <div className="tool-card tool-card-logged">
        <CheckCircle2 size={14} /> Logged <b>{String(result.matched_to)}</b> — {String(result.calories)} kcal,{" "}
        {String(result.protein_g)}g protein.
      </div>
    );
  }
  if (tool === "log_water") {
    if (result.status !== "logged") {
      const reason = String(result.error || result.message || result.status || "unknown error");
      return (
        <div className="tool-card tool-card-warn">
          <AlertTriangle size={14} /> Water not logged — {reason}
        </div>
      );
    }
    return (
      <div className="tool-card tool-card-logged">
        <Droplets size={14} /> Logged <b>{String(result.amount_l)} L water</b> · Today:{" "}
        {String(result.consumed_water_l)} L / {String(result.target_water_l)} L goal
      </div>
    );
  }
  return null;
}

export default function ChatPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [error, setError] = useState("");
  const [today, setToday] = useState(localToday());
  const [selectedDate, setSelectedDate] = useState(localToday());
  const [chatDays, setChatDays] = useState<ChatDay[]>([]);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const coordsRef = useRef<Coords | null>(null);
  coordsRef.current = coords;
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const selectedRef = useRef(selectedDate);
  selectedRef.current = selectedDate;
  const lastUserPrompt = useRef<string>("");

  const isToday = selectedDate === today;

  const loadDays = useCallback(() => {
    fetch(`${API}/api/chat/days`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.today) setToday(data.today);
        setChatDays(data.days || []);
      })
      .catch(() => {});
  }, []);

  const loadDay = useCallback((date: string) => {
    setHistoryLoaded(false);
    fetch(`${API}/api/chat/history?date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (selectedRef.current === date) setMessages(data.messages || []);
      })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => {
        if (selectedRef.current === date) setHistoryLoaded(true);
      });
  }, []);

  useEffect(() => {
    const saved = loadStoredCoords();
    if (saved) setCoords(saved);

    const loadProfileData = () => {
      fetch(`${API}/api/profile?_t=${Date.now()}`)
        .then((r) => r.json())
        .then((p) => {
          setProfile(p);
          setAvatarFailed(false);
        })
        .catch(() => {});
    };

    loadProfileData();
    window.addEventListener("profile-updated", loadProfileData);
    loadDays();
    return () => {
      window.removeEventListener("profile-updated", loadProfileData);
    };
  }, [loadDays]);

  // Each day is its own chat page: switching the day loads only that day's messages.
  useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  useEffect(() => {
    const busy = messages.some((m) => m.streaming);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: busy ? "auto" : "smooth" });
  }, [messages, loading]);

  /** Sends one message to the coach. Returns the reply text, "" if busy, or null on failure. */
  const sendText = useCallback(
    async (text: string, image?: string | null, explicitCoords?: Coords | null): Promise<string | null> => {
      const clean = text.trim();
      if (!clean && !image) return "";
      if (loadingRef.current) return "";
      if (selectedRef.current !== today) return "";
      loadingRef.current = true;
      lastUserPrompt.current = clean;
      setError("");
      setMessages((current) => [
        ...current,
        { role: "user", content: clean || "📷 Meal photo", image: image || undefined },
        { role: "assistant", content: "", streaming: true },
      ]);
      setLoading(true);
      if (image) setIsAnalyzingPhoto(true);

      try {
        let where = explicitCoords || coordsRef.current;
        if (!where && NEARBY_INTENT.test(clean)) {
          const res = await getPosition();
          if (res.coords) {
            where = res.coords;
            setCoords(where);
            saveStoredCoords(where);
          } else if (res.error) {
            setError(res.error);
          }
        }

        // The reply arrives word by word; text is gathered here and pushed to the screen once per frame.
        let pending = "";
        let raf = 0;
        const patchLast = (fn: (m: ChatMsg) => ChatMsg) =>
          setMessages((current) => {
            const i = current.length - 1;
            if (i < 0 || !current[i].streaming) return current;
            const next = current.slice();
            next[i] = fn(current[i]);
            return next;
          });
        const flush = () => {
          raf = 0;
          const chunk = pending;
          pending = "";
          if (chunk) patchLast((m) => ({ ...m, content: m.content + chunk, status: undefined }));
        };
        const data = await streamChat(
          API,
          { message: clean, image: image || null, location: where },
          {
            onDelta: (text) => {
              pending += text;
              if (!raf) raf = requestAnimationFrame(flush);
            },
            onReset: () => {
              pending = "";
              patchLast((m) => ({ ...m, content: "" }));
            },
            onTool: (t) =>
              patchLast((m) => ({ ...m, status: t.phase === "start" ? toolStatusText(t.name, t.args) : m.status })),
          }
        );
        if (raf) cancelAnimationFrame(raf);
        setMessages((current) => [
          ...current.filter((m) => !m.streaming),
          { role: "assistant", content: data.reply, tool_events: data.tool_events || [] },
        ]);
        loadDays();
        return data.reply as string;
      } catch (err) {
        setError(err instanceof Error ? err.message : "The coach is unavailable. Check your API key and backend.");
        setMessages((current) => [
          ...current.filter((m) => !m.streaming),
          { role: "assistant", content: "Sorry, I couldn't process that just now. Please try again." },
        ]);
        return null;
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setIsAnalyzingPhoto(false);
      }
    },
    [today, loadDays]
  );

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
      try {
        localStorage.removeItem(LOC_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const res = await getPosition();
    if (!res.coords) {
      setError(res.error || "Couldn't get your location. Allow location access in your browser or type your area.");
      return;
    }
    setError("");
    setCoords(res.coords);
    saveStoredCoords(res.coords);
  }

  async function handleRetryWithGps() {
    const res = await getPosition();
    if (res.coords) {
      setCoords(res.coords);
      saveStoredCoords(res.coords);
      const query = lastUserPrompt.current || "Find high protein restaurants near me";
      await sendText(query, null, res.coords);
    } else {
      setError(res.error || "Location access was not granted. Please pick a neighborhood or type your area below.");
    }
  }

  async function handlePickArea(area: string) {
    const prompt = lastUserPrompt.current
      ? `${lastUserPrompt.current} in ${area}`
      : `Recommend good restaurants in ${area}`;
    await sendText(prompt);
  }

  async function onPickPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
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
      actions={
        <button
          className="icon-btn"
          onClick={clearChat}
          aria-label="Clear this day's conversation"
          title="Clear this day's conversation"
        >
          <Trash2 size={18} />
        </button>
      }
    >
      <div className="chat-wrap">
        <div className="chat-intro">
          <div className="almanac-eyebrow">
            <span>INTELLIGENT DIALOGUE</span>
            <span className="dot-sep">·</span>
            <span>AI COACH</span>
          </div>
          <h1 className="almanac-serif">
            Conversation with your Coach <span>✦</span>
          </h1>
          <p className="subtitle">
            Type, speak aloud, upload meal photos for ingredient vision identification, or search food places. The coach
            cross-references your actual logged targets before recommending actions.
          </p>
        </div>

        <div className="chat-days" role="tablist" aria-label="Chat days">
          {(chatDays.some((d) => d.date === today)
            ? chatDays
            : [{ date: today, messages: 0, preview: "" }, ...chatDays]
          ).map((day) => (
            <button
              key={day.date}
              role="tab"
              aria-selected={day.date === selectedDate}
              className={`chat-day-chip ${day.date === selectedDate ? "active" : ""} active:scale-95 transition-transform duration-150`}
              onClick={() => pickDay(day.date)}
              title={day.preview || "No messages yet"}
            >
              <b>{dayLabel(day.date, today)}</b>
              <span className="almanac-mono tabular">
                {day.messages} msg{day.messages === 1 ? "" : "s"}
              </span>
            </button>
          ))}
        </div>

        <div className="chat-panel">
          {/* Ambient Background Nutrition Motifs (Vintage botanical line-art sketches) */}
          <div className="chat-ambient-motifs" aria-hidden="true">
            <svg
              className="motif motif-wheat"
              viewBox="0 0 80 140"
              fill="none"
              stroke="#234236"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M40 135 C40 90, 42 45, 40 10" />
              <path d="M40 105 C31 99, 24 90, 28 82 C34 85, 38 93, 40 99" />
              <path d="M40 99 C49 93, 56 84, 52 76 C46 79, 42 87, 40 93" />
              <path d="M40 82 C31 76, 24 67, 28 59 C34 62, 38 70, 40 76" />
              <path d="M40 76 C49 70, 56 61, 52 53 C46 56, 42 64, 40 70" />
              <path d="M40 59 C31 53, 24 44, 28 36 C34 39, 38 47, 40 53" />
              <path d="M40 53 C49 47, 56 38, 52 30 C46 33, 42 41, 40 47" />
              <path d="M40 36 C33 30, 28 22, 32 15 C37 18, 38 26, 40 30" />
              <path d="M40 30 C47 24, 52 16, 48 9 C43 12, 42 20, 40 24" />
              <path d="M40 16 C39 8, 41 4, 40 2" />
            </svg>
            <svg
              className="motif motif-helix"
              viewBox="0 0 100 100"
              fill="none"
              stroke="#234236"
              strokeWidth="1.2"
              strokeLinecap="round"
            >
              <ellipse cx="50" cy="50" rx="38" ry="19" transform="rotate(-25 50 50)" />
              <ellipse cx="50" cy="50" rx="19" ry="38" transform="rotate(-25 50 50)" />
              <circle cx="50" cy="50" r="5" strokeWidth="1" />
              <circle cx="26" cy="38" r="2.5" fill="#234236" fillOpacity="0.4" />
              <circle cx="74" cy="62" r="2.5" fill="#234236" fillOpacity="0.4" />
              <circle cx="62" cy="26" r="2.5" fill="#234236" fillOpacity="0.4" />
              <circle cx="38" cy="74" r="2.5" fill="#234236" fillOpacity="0.4" />
            </svg>
            <svg
              className="motif motif-pod"
              viewBox="0 0 90 90"
              fill="none"
              stroke="#234236"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 75 C25 65, 40 50, 75 15 C60 40, 45 65, 15 75 Z" />
              <path d="M22 68 C35 60, 55 45, 68 22" strokeDasharray="2 3" />
              <circle cx="35" cy="55" r="4" />
              <circle cx="48" cy="42" r="4" />
              <circle cx="61" cy="29" r="4" />
            </svg>
            <svg
              className="motif motif-droplet"
              viewBox="0 0 60 80"
              fill="none"
              stroke="#234236"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M30 10 C30 10, 10 40, 10 54 C10 65, 19 74, 30 74 C41 74, 50 65, 50 54 C50 40, 30 10, 30 10 Z" />
              <path d="M22 50 C20 54, 20 60, 24 64" strokeWidth="1" />
            </svg>
          </div>

          <div className="chat-messages" ref={listRef}>
            {!historyLoaded && <p className="empty-state">Loading conversation…</p>}
            {historyLoaded && messages.length === 0 && (
              <div className="chat-empty">
                <div className="coach-badge chat-empty-badge">
                  <Sparkles size={20} />
                </div>
                {isToday ? (
                  <p>
                    No messages yet today. Type, snap a photo, or tap the mic and say:{" "}
                    <i>&quot;I had 2 idlis and a cup of chai&quot;</i>
                  </p>
                ) : (
                  <p>No conversation recorded on this day.</p>
                )}
                {isToday && (
                  <div className="chat-suggestions" role="group" aria-label="Try asking">
                    {[
                      "I had 2 idlis and a chai for breakfast",
                      "How am I doing today?",
                      "What should I eat for dinner?",
                      "Log a glass of water",
                    ].map((q) => (
                      <button key={q} type="button" className="chat-chip" onClick={() => void sendText(q)} disabled={loading}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.map((message, index) => {
              const isLastMessage = index === messages.length - 1;
              return (
                <div className={`chat-row ${message.role}`} key={index}>
                  <div className={`chat-avatar ${message.role === "user" ? "user-av" : "coach-av"}`}>
                    {message.role === "user" ? (
                      profile?.photo_data && !avatarFailed ? (
                        <img
                          src={profile.photo_data}
                          alt={name}
                          onError={() => setAvatarFailed(true)}
                          className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-[#234236]/20 shadow-xs user-av-img"
                        />
                      ) : (
                        <span className="user-initial-fallback">{initial}</span>
                      )
                    ) : (
                      <Sparkles size={14} />
                    )}
                  </div>
                  <div className="chat-bubble-col">
                    <div className={`chat-bubble ${message.role}${message.streaming && !message.content ? " typing" : ""}`}>
                      {message.streaming && !message.content && (
                        <>
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </>
                      )}
                      {message.image && (
                        <div
                          className={`chat-photo-wrap ${
                            isLastMessage && isAnalyzingPhoto ? "analyzing" : ""
                          }`}
                        >
                          <img className="chat-photo" src={message.image} alt="Meal photo uploaded" />
                        </div>
                      )}
                      {message.content}
                      {message.streaming && message.content && <span className="stream-caret" aria-hidden="true" />}
                    </div>
                    {message.streaming && message.status && (
                      <div className="stream-status" role="status">
                        <span className="stream-status-dot" aria-hidden="true" />
                        {message.status}
                      </div>
                    )}
                    {message.tool_events && message.tool_events.length > 0 && (
                      <div className="tool-card-stack">
                        {message.tool_events.map((event, eventIndex) => (
                          <ToolCard
                            event={event}
                            key={eventIndex}
                            onLogged={() => {
                              loadDay(selectedDate);
                              loadDays();
                            }}
                            onRetryWithGps={handleRetryWithGps}
                            onPickArea={handlePickArea}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && !messages.some((m) => m.streaming) && (
              <div className="chat-row assistant">
                <div className="chat-avatar coach-av">
                  <Sparkles size={14} />
                </div>
                <div className="chat-bubble-col">
                  <div className="chat-bubble assistant typing" aria-label="Coach is composing response">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="notice-banner chat-error">
              <Sparkles size={16} />
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {voice.error && (
            <div className="notice-banner chat-error voice-error" role="alert">
              <Mic size={16} />
              {voice.error}
              <button onClick={voice.clearError} aria-label="Dismiss">
                ×
              </button>
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
                <span className="voice-wave" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
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
              <button className="voice-stop" onClick={voice.stop}>
                <Square size={13} /> End
              </button>
            </div>
          )}

          {!isToday && (
            <div className="chat-readonly">
              <span>This is {dayLabel(selectedDate, today)}&apos;s chat, read-only.</span>
              <button className="primary-btn" onClick={() => pickDay(today)}>
                <Plus size={15} /> Back to today&apos;s chat
              </button>
            </div>
          )}

          {isToday && pendingImage && (
            <div className="photo-preview">
              <img src={pendingImage} alt="Photo ready to send" />
              <span>Photo ready — press Send and the coach will analyze the meal items.</span>
              <button type="button" onClick={() => setPendingImage(null)} aria-label="Remove photo">
                <X size={16} />
              </button>
            </div>
          )}

          {isToday && (
            <form className="chat-input-row" onSubmit={send}>
              <button
                type="button"
                className={`mic-btn ${voice.active ? "on" : ""} active:scale-95 transition-transform duration-150`}
                onClick={voice.active ? voice.stop : voice.start}
                disabled={!voice.supported}
                aria-label={micLabel}
                aria-pressed={voice.active}
                title={voice.supported ? micLabel : "Voice input works in Chrome, Edge or Safari"}
              >
                {voice.active ? (
                  <span className="acoustic-wave-bars" aria-hidden="true">
                    <span className="acoustic-bar" />
                    <span className="acoustic-bar" />
                    <span className="acoustic-bar" />
                    <span className="acoustic-bar" />
                  </span>
                ) : (
                  <Mic size={18} />
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickPhoto} />
              <button
                type="button"
                className={`mic-btn photo-btn ${pendingImage ? "on" : ""} active:scale-95 transition-transform duration-150`}
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                aria-label="Upload or take a meal photo"
                title="Upload or take a meal photo"
              >
                <Camera size={18} />
              </button>
              <button
                type="button"
                className={`mic-btn loc-btn ${coords ? "on" : ""} active:scale-95 transition-transform duration-150`}
                onClick={toggleLocation}
                aria-pressed={!!coords}
                aria-label={coords ? "Location active. Tap to turn off" : "Share location for restaurant searches"}
                title={
                  coords
                    ? `Location active (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}) - tap to clear`
                    : "Share location for restaurant searches"
                }
              >
                <MapPin size={18} />
              </button>
              <input
                autoFocus
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  pendingImage
                    ? "Add a note about the photo (optional)…"
                    : voice.active
                    ? "Voice mode active. You can also type here…"
                    : "e.g. I had 2 idlis and a cup of filter coffee…"
                }
                disabled={loading}
              />
              <button className="primary-btn active:scale-95 transition-transform duration-150" disabled={loading || (!input.trim() && !pendingImage)}>
                <Send size={16} /> <span className="send-label">Send</span>
              </button>
            </form>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        /* Retro Ambient Nutrition Motifs */
        .chat-main .chat-panel {
          position: relative;
        }
        .chat-main .chat-ambient-motifs {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 0;
        }
        .chat-main .motif {
          position: absolute;
          opacity: 0.035; /* 3.5% opacity, strictly 2%-4% */
          animation: gentle-drift 18s ease-in-out infinite;
          pointer-events: none;
        }
        .chat-main .motif-wheat {
          top: 6%;
          right: 4%;
          width: 95px;
          height: 155px;
          animation-duration: 18s;
        }
        .chat-main .motif-helix {
          bottom: 12%;
          left: 4%;
          width: 105px;
          height: 105px;
          animation-duration: 22s;
          animation-delay: -6s;
        }
        .chat-main .motif-pod {
          top: 46%;
          right: 7%;
          width: 85px;
          height: 85px;
          animation-duration: 19s;
          animation-delay: -10s;
        }
        .chat-main .motif-droplet {
          bottom: 25%;
          right: 38%;
          width: 58px;
          height: 78px;
          animation-duration: 17s;
          animation-delay: -3s;
        }

        @keyframes gentle-drift {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-6px) rotate(1deg);
          }
        }

        /* Message Stream & Bubble Transitions */
        .chat-main .chat-messages {
          position: relative;
          z-index: 1;
        }
        .chat-main .chat-row {
          animation: retro-bubble-in 220ms ease-out both;
          position: relative;
          z-index: 1;
        }

        @keyframes retro-bubble-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* User Message Avatar */
        .chat-main .chat-row.user .chat-avatar.user-av {
          background: transparent !important;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          width: 30px;
          height: 30px;
        }
        .chat-main .chat-row.user .chat-avatar.user-av .user-initial-fallback {
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: linear-gradient(135deg, #d79c7f, #b86d62);
          color: #fff;
          font-size: 11px;
          font-weight: 700;
        }
        .chat-main .chat-row.user .chat-avatar.user-av .user-av-img {
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          object-fit: cover;
          border: 1px solid rgba(35, 66, 54, 0.2);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        /* Coach Response Typing Wave & Botanical Sparkle Pulse */
        .chat-main .chat-bubble.assistant.typing {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 10px 16px;
          min-height: 38px;
        }
        .chat-main .chat-bubble.assistant.typing .typing-dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #234236;
          opacity: 0.5;
          animation: retro-typing-wave 1.4s ease-in-out infinite, retro-sparkle-pulse 2.2s ease-in-out infinite;
        }
        .chat-main .chat-bubble.assistant.typing .typing-dot:nth-child(1) {
          animation-delay: 0s, 0s;
        }
        .chat-main .chat-bubble.assistant.typing .typing-dot:nth-child(2) {
          animation-delay: 0.2s, 0.3s;
        }
        .chat-main .chat-bubble.assistant.typing .typing-dot:nth-child(3) {
          animation-delay: 0.4s, 0.6s;
        }

        @keyframes retro-typing-wave {
          0%, 60%, 100% {
            transform: translateY(0);
          }
          30% {
            transform: translateY(-4px);
          }
        }

        @keyframes retro-sparkle-pulse {
          0%, 100% {
            transform: scale(0.96);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.0);
            opacity: 1.0;
          }
        }

        /* Active Mic State: Vintage Acoustic Rhythm Wave in #234236 */
        .chat-main .mic-btn.on {
          background: #234236 !important;
          border-color: #234236 !important;
          color: #f4f3ef !important;
          box-shadow: 0 0 0 3px rgba(35, 66, 54, 0.15) !important;
          animation: none !important;
        }
        .chat-main .acoustic-wave-bars {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 2.5px;
          height: 18px;
          width: 18px;
        }
        .chat-main .acoustic-bar {
          display: block;
          width: 2.5px;
          height: 100%;
          border-radius: 2px;
          background: #f4f3ef;
          transform: scaleY(0.3);
          transform-origin: center;
          animation: vintage-acoustic-pulse 1.1s ease-in-out infinite;
        }
        .chat-main .acoustic-bar:nth-child(1) { animation-delay: 0s; }
        .chat-main .acoustic-bar:nth-child(2) { animation-delay: 0.18s; }
        .chat-main .acoustic-bar:nth-child(3) { animation-delay: 0.36s; }
        .chat-main .acoustic-bar:nth-child(4) { animation-delay: 0.54s; }

        @keyframes vintage-acoustic-pulse {
          0%, 100% {
            transform: scaleY(0.3);
          }
          50% {
            transform: scaleY(0.95);
          }
        }

        /* Voice bar wave styling matching #234236 */
        .chat-main .voice-bar .voice-wave i {
          background: #234236 !important;
        }
        .chat-main .voice-bar.speaking .voice-wave i {
          background: #234236 !important;
        }
        .chat-main .voice-bar.listening .voice-wave i {
          background: #234236 !important;
        }

        /* Tactile Press Micro-Interactions */
        .chat-main button,
        .chat-main .primary-btn,
        .chat-main .chat-day-chip,
        .chat-main .area-chip,
        .chat-main .mic-btn,
        .chat-main .ghost-btn {
          transition: transform 150ms ease, background-color 150ms ease, box-shadow 150ms ease;
        }
        .chat-main button:active:not(:disabled),
        .chat-main .primary-btn:active:not(:disabled),
        .chat-main .chat-day-chip:active,
        .chat-main .area-chip:active,
        .chat-main .mic-btn:active:not(:disabled) {
          transform: scale(0.95);
        }

        @media (prefers-reduced-motion: reduce) {
          .chat-main .motif,
          .chat-main .chat-row,
          .chat-main .chat-bubble.assistant.typing .typing-dot,
          .chat-main .acoustic-bar {
            animation: none !important;
            transform: none !important;
          }
        }
      ` }} />
    </Shell>
  );
}