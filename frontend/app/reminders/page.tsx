"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlarmClock, BellRing, Droplets, Send, Smartphone, Utensils } from "lucide-react";
import Shell, { API } from "../components/Shell";
import { FoodGlyph } from "../components/art/FoodGlyph";

type Reminder = {
  id: number; kind: "food" | "water"; remind_time: string; repeat: "daily" | "once"; once_date: string | null;
  food_name: string | null; quantity: number | null; unit: string | null; meal_type: string | null;
  water_l: number | null; auto_log: boolean; enabled: boolean;
};
type Channels = { push: boolean; push_devices: number; email: boolean; browser: boolean };
type FoodHit = { food_name: string };
type DeviceState = "loading" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function describe(r: Reminder) {
  if (r.kind === "water") return `Drink ${Math.round((r.water_l || 0) * 1000)} ml water`;
  const amount = r.unit === "grams" ? `${r.quantity} g` : `${r.quantity} serving${r.quantity === 1 ? "" : "s"}`;
  return `${r.food_name} · ${amount}`;
}

function to12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function RemindersPage() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [deviceState, setDeviceState] = useState<DeviceState>("loading");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [kind, setKind] = useState<"food" | "water">("food");
  const [time, setTime] = useState("14:00");
  const [repeat, setRepeat] = useState<"daily" | "once">("daily");
  const [food, setFood] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<"serving" | "grams">("serving");
  const [mealType, setMealType] = useState("");
  const [waterMl, setWaterMl] = useState("250");
  const [autoLog, setAutoLog] = useState(true);
  const [hits, setHits] = useState<string[]>([]);

  const checkDevicePush = useCallback(async () => {
    if (typeof window === "undefined") return;

    // Check iOS Safari standalone mode requirement
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Boolean((navigator as any).standalone);

    if (isIOS && !isStandalone) {
      setDeviceState("needs-install");
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setDeviceState("unsupported");
      return;
    }

    if (Notification.permission === "denied") {
      setDeviceState("blocked");
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setDeviceState(sub ? "on" : "off");
    } catch {
      setDeviceState("off");
    }
  }, []);

  const load = useCallback(() => {
    fetch(`${API}/api/reminders`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setItems(d.reminders || []);
        setChannels(d.channels || null);
        setError("");
      })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    checkDevicePush();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [load, checkDevicePush]);

  // Food-name suggestions from the real database, so a reminder can always be auto-logged.
  useEffect(() => {
    if (kind !== "food" || food.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      fetch(`${API}/api/food-search?q=${encodeURIComponent(food.trim())}&limit=8`)
        .then((r) => r.json())
        .then((d) => setHits(((d.results || []) as FoodHit[]).map((x) => x.food_name)))
        .catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [food, kind]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    const body =
      kind === "food"
        ? {
            kind,
            time,
            repeat,
            food_name: food.trim(),
            quantity: Number(quantity) || 1,
            unit,
            meal_type: mealType || null,
            auto_log: autoLog,
          }
        : { kind, time, repeat, water_ml: Number(waterMl) || 250, auto_log: autoLog };
    try {
      const res = await fetch(`${API}/api/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the reminder. Check the fields.");
      setInfo("Reminder saved.");
      if (kind === "food") setFood("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the reminder.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: Reminder) {
    await fetch(`${API}/api/reminders/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !r.enabled }),
    }).catch(() => {});
    load();
  }

  async function remove(r: Reminder) {
    await fetch(`${API}/api/reminders/${r.id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  async function enablePush() {
    setError("");
    setInfo("");
    setPushBusy(true);

    try {
      if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
        throw new Error("This browser does not support Web Push notifications.");
      }

      // Check VAPID public key from backend
      const keyRes = await fetch(`${API}/api/reminders/push/vapid-public-key`);
      const keyData = await keyRes.json();
      if (!keyData.public_key) {
        throw new Error("Server push keys are not set up. Generate VAPID keys and add them to backend/.env.");
      }

      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setDeviceState("blocked");
        throw new Error("Notifications were blocked. Please allow notifications in your browser site settings.");
      }
      if (permission !== "granted") {
        throw new Error("Notification permission was dismissed.");
      }

      const reg = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(keyData.public_key);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      const subRes = await fetch(`${API}/api/reminders/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const subData = await subRes.json();
      if (!subRes.ok) {
        throw new Error(typeof subData.detail === "string" ? subData.detail : "Failed to register subscription with server.");
      }

      setDeviceState("on");
      setInfo("Phone notifications enabled for this device. You will receive reminders even when closed.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable notifications.");
      checkDevicePush();
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setError("");
    setInfo("");
    setPushBusy(true);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch(`${API}/api/reminders/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      setDeviceState("off");
      setInfo("Phone notifications disabled for this device.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to turn off notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  async function sendTestPush() {
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API}/api/reminders/test-push`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Test push failed.");
      setInfo(`Test push delivered to ${data.devices} device(s). Check your phone lock screen!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test push failed.");
    }
  }

  async function sendTest() {
    setError("");
    setInfo("");
    try {
      const res = await fetch(`${API}/api/reminders/test-notification`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Test failed.");
      setInfo(`Test sent via ${data.sent.join(" + ")}. Check your phone / inbox.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed.");
    }
  }

  return (
    <Shell active="reminders" crumb="Reminders">
      <div className="page-wrap">
        <div className="hero-row">
          <div>
            <div className="almanac-eyebrow">
              <span>SCHEDULED SIGNALS</span>
              <span className="dot-sep">·</span>
              <span>TIMEKEEPING</span>
            </div>
            <h1 className="almanac-serif">Reminders <span>✦</span></h1>
            <p className="subtitle">Set a time, a food or hydration goal. NutriSync pings you then and auto-logs your routine.</p>
          </div>
        </div>

        {error && <div className="notice-banner"><AlarmClock size={16} />{error}</div>}
        {info && <div className="notice-banner"><BellRing size={16} />{info}</div>}

        <div className="rem-layout">
          <div>
            <section className="panel">
              <h3>New reminder</h3>
              <form className="rem-form" onSubmit={submit}>
                <div className="rem-kind">
                  <button type="button" className={kind === "food" ? "on" : ""} onClick={() => setKind("food")}><Utensils size={13} /> Food</button>
                  <button type="button" className={kind === "water" ? "on" : ""} onClick={() => setKind("water")}><Droplets size={13} /> Water</button>
                </div>
                <div className="rem-row2">
                  <label>Time<input type="time" required value={time} onChange={e => setTime(e.target.value)} /></label>
                  <label>Repeat
                    <select value={repeat} onChange={e => setRepeat(e.target.value as "daily" | "once")}>
                      <option value="daily">Every day</option>
                      <option value="once">Just once</option>
                    </select>
                  </label>
                </div>

                {kind === "food" ? (
                  <>
                    <label>Food
                      <input list="food-hits" required value={food} onChange={e => setFood(e.target.value)} placeholder="e.g. boiled egg, egg sandwich, idli" />
                      <datalist id="food-hits">{hits.map(h => <option key={h} value={h} />)}</datalist>
                    </label>
                    <div className="rem-row2">
                      <label>Amount<input type="number" min="0.1" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
                      <label>Unit
                        <select value={unit} onChange={e => setUnit(e.target.value as "serving" | "grams")}>
                          <option value="serving">Servings</option>
                          <option value="grams">Grams</option>
                        </select>
                      </label>
                    </div>
                    <label>Log as
                      <select value={mealType} onChange={e => setMealType(e.target.value)}>
                        <option value="">Pick from the time</option>
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="snack">Snack</option>
                        <option value="dinner">Dinner</option>
                      </select>
                    </label>
                  </>
                ) : (
                  <label>Water (ml)<input type="number" min="50" max="2000" step="50" value={waterMl} onChange={e => setWaterMl(e.target.value)} /></label>
                )}

                <label className="rem-check">
                  <input type="checkbox" checked={autoLog} onChange={e => setAutoLog(e.target.checked)} />
                  <span>Log it automatically when the reminder fires. Untick this if you only want a nudge; auto-logging records it even if you skip the meal.</span>
                </label>
                <button className="primary-btn" disabled={busy} type="submit">{busy ? "Saving…" : "Save reminder"}</button>
              </form>
            </section>

            <section className="panel" style={{ marginTop: 16 }}>
              <h3>Where reminders reach you</h3>
              <div className="chan-list">
                <div className={`chan ${channels?.push && (channels?.push_devices ?? 0) > 0 ? "on" : ""}`}>
                  <i />
                  <span>
                    <b>Phone notifications</b> —{" "}
                    {channels?.push
                      ? (channels?.push_devices ?? 0) > 0
                        ? `${channels.push_devices} device${channels.push_devices === 1 ? "" : "s"} connected`
                        : "ready (this device not connected)"
                      : "server push keys not set up"}
                  </span>
                </div>
                <div className={`chan ${channels?.email ? "on" : ""}`}><i /><span><b>Email</b> — {channels?.email ? "connected" : "not set up"}</span></div>
                <div className="chan on"><i /><span><b>This website</b> — toast + bell while a tab is open</span></div>
              </div>

              <div className="rem-actions" style={{ marginTop: 12 }}>
                {deviceState === "needs-install" && (
                  <p className="rem-hint">
                    <Smartphone size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                    On iPhone, tap <b>Share → Add to Home Screen</b>, then open the installed app to enable notifications.
                  </p>
                )}
                {deviceState === "unsupported" && (
                  <p className="rem-hint">Phone notifications are not supported on this browser (HTTPS is required).</p>
                )}
                {deviceState === "blocked" && (
                  <p className="rem-hint">Notifications are blocked in your browser settings. Allow them to get lock-screen alerts.</p>
                )}
                {deviceState === "off" && (
                  <button type="button" className="primary-btn" disabled={pushBusy} onClick={enablePush}>
                    {pushBusy ? "Enabling…" : "Enable phone notifications"}
                  </button>
                )}
                {deviceState === "on" && (
                  <>
                    <button type="button" onClick={sendTestPush}><Send size={11} /> Send test notification</button>
                    <button type="button" disabled={pushBusy} onClick={disablePush}>{pushBusy ? "Updating…" : "Turn off"}</button>
                  </>
                )}
                {deviceState !== "on" && (
                  <button type="button" onClick={sendTest}><Send size={11} /> Send test</button>
                )}
              </div>

              {!channels?.push && (
                <p className="rem-hint">
                  To enable phone lock-screen notifications, generate VAPID keys using <code>python scripts/generate_vapid_keys.py</code>, put them in <code>backend/.env</code>, and restart the backend.
                </p>
              )}
            </section>
          </div>

          <section className="panel">
            <h3>Your reminders</h3>
            {loading && <p className="empty-state">Loading…</p>}
            {!loading && items.length === 0 && <p className="empty-state">No reminders yet. Add one on the left, or ask the Coach.</p>}
            <div className="meal-list">
              {items.map(r => (
                <div className={`rem-item ${r.enabled ? "" : "off"}`} key={r.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <FoodGlyph name={r.kind === "water" ? "jar" : (r.food_name || "plate")} size={24} />
                    <div className="rem-time tabular almanac-mono">{to12h(r.remind_time)}</div>
                  </div>
                  <div className="meal-info">
                    <b>{describe(r)}</b>
                    <span>
                      {r.repeat === "daily" ? "Every day" : `Once · ${r.once_date}`}
                      {r.kind === "food" && r.meal_type ? ` · ${r.meal_type}` : ""}
                      {r.auto_log ? " · auto-logs" : " · reminder only"}
                      {!r.enabled ? " · off" : ""}
                    </span>
                  </div>
                  <div className="rem-actions">
                    <button onClick={() => toggle(r)}>{r.enabled ? "Turn off" : "Turn on"}</button>
                    <button className="danger" onClick={() => remove(r)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}