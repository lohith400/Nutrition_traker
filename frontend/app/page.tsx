"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Activity, ArrowUpRight, Bell, ChevronRight, Droplets, Flame, Home, Leaf, MessageCircle, Plus, Sparkles, Target, Utensils, X, Zap } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type Profile = { status?: string; name?: string };
type Budget = { consumed_calories: number; remaining_calories: number; consumed_protein_g: number; remaining_protein_g: number; consumed_carbs_g: number; remaining_carbs_g: number; target_calories: number; target_protein_g: number; target_carbs_g: number; target_water_l?: number; consumed_water_l?: number };
type Meal = { food_name: string; meal_type: string; log_time?: string; calories: number; protein_g: number };
type Pattern = { pattern_type: string; description: string; detected_on: string };
type TabKey = "overview" | "foodlog" | "mealplans" | "progress";

const nav: [TabKey, string, typeof Home][] = [
  ["overview", "Overview", Home],
  ["foodlog", "Food log", Utensils],
  ["mealplans", "Meal plans", Leaf],
  ["progress", "Progress", Activity],
];

function Stat({ label, value, goal, unit, color, Icon, children }: { label: string; value: number; goal: number; unit: string; color: string; Icon: typeof Flame; children?: React.ReactNode }) {
  const percent = goal ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="stat-card">
      <div className="stat-topline"><span className={`stat-icon ${color}`}><Icon size={17} /></span>{label}<span className="stat-more">···</span></div>
      <div className="stat-number">{value}<small>{unit}</small></div>
      <div className="progress-track"><span className={`progress-fill ${color}`} style={{ width: `${percent}%` }} /></div>
      <div className="stat-meta"><span>{Math.round(percent)}% of goal</span><b>{goal}{unit}</b></div>
      {children}
    </div>
  );
}

export default function Page() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [food, setFood] = useState("");
  const [chat, setChat] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notice, setNotice] = useState("");
  const [showNotifs, setShowNotifs] = useState(false);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const chatInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const [profileResponse, overviewResponse, mealsResponse] = await Promise.all([
        fetch(`${API}/api/profile`),
        fetch(`${API}/api/overview`),
        fetch(`${API}/api/recent-meals`),
      ]);
      const nextProfile = await profileResponse.json();
      const nextBudget = await overviewResponse.json();
      const nextMeals = await mealsResponse.json();
      setProfile(nextProfile);
      setBudget(nextBudget);
      setMeals(nextMeals.meals || []);
      if (nextProfile.status === "not_onboarded") setShowOnboarding(true);
    } catch {
      setNotice("Can't reach the backend. Check NEXT_PUBLIC_API_URL and that the API server is running and publicly visible.");
    }
  }
  useEffect(() => { refresh(); }, []);

  async function refreshPatterns() {
    try { const response = await fetch(`${API}/api/patterns`); const data = await response.json(); setPatterns(data.patterns || []); } catch { /* ignore */ }
  }
  async function refreshSuggestion() {
    setSuggestionLoading(true);
    try { const response = await fetch(`${API}/api/suggestions`); const data = await response.json(); setSuggestion(data); } catch { setSuggestion(null); } finally { setSuggestionLoading(false); }
  }
  useEffect(() => {
    if (tab === "progress") refreshPatterns();
    if (tab === "mealplans") refreshSuggestion();
  }, [tab]);

  async function logFood(event: FormEvent) {
    event.preventDefault(); if (!food.trim()) return; setLoading(true);
    try {
      const response = await fetch(`${API}/api/log-food`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_name: food, quantity: 1, meal_type: "snack" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail);
      setNotice(`Logged ${data.matched_to}: ${data.calories} kcal, ${data.protein_g}g protein.`);
      setFood("");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not log this food.");
    } finally {
      setLoading(false);
    }
  }

  async function logWater(amountL: number) {
    try { await fetch(`${API}/api/log-water`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount_l: amountL }) }); await refresh(); setNotice(`Logged ${amountL}L of water.`); } catch { setNotice("Could not log water."); }
  }

  async function askCoach(event: FormEvent) {
    event.preventDefault(); if (!chat.trim()) return; setLoading(true);
    try {
      const response = await fetch(`${API}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: chat }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Coach request failed.");
      setReply(data.reply);
      setChat("");
      await refresh();
    } catch (error) {
      setReply(error instanceof Error ? error.message : "The coach is unavailable. Check your API key and backend.");
    } finally {
      setLoading(false);
    }
  }

  function openCoach() { setTab("overview"); setTimeout(() => chatInputRef.current?.focus(), 50); }
  async function toggleNotifs() { const next = !showNotifs; setShowNotifs(next); if (next) await refreshPatterns(); }

  const name = profile?.name || "there";
  const calories = budget?.consumed_calories || 0;
  const protein = budget?.consumed_protein_g || 0;
  const carbs = budget?.consumed_carbs_g || 0;
  const water = budget?.consumed_water_l || 0;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-badge"><Sparkles size={18} /></span>Nutri<span>Sync</span></div>
        <div className="workspace-card"><div className="avatar avatar-sm">{name[0]?.toUpperCase() || "N"}</div><div><b>{name}&apos;s space</b><small>Personal plan</small></div></div>
        <nav className="nav">
          {nav.map(([key, label, Icon]) => (
            <button className={tab === key ? "nav-item active" : "nav-item"} key={key} onClick={() => setTab(key)}>
              <Icon size={18} />{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => setTab("mealplans")}><Zap size={18} />Daily focus</button>
          <button className="nav-item" onClick={openCoach}><MessageCircle size={18} />Coach chat</button>
          <div className="profile-mini"><div className="avatar">{name[0]?.toUpperCase() || "N"}</div><div><b>{name}</b><small>Personal plan</small></div></div>
        </div>
      </aside>
      <section className="main-panel">
        <header className="topbar">
          <div className="crumbs">My nutrition <ChevronRight size={15} /> <b>{nav.find(([key]) => key === tab)?.[1]}</b></div>
          <div className="top-actions">
            <div className="notif-wrap">
              <button className="icon-btn" onClick={toggleNotifs} aria-label="Notifications">
                <Bell size={18} />{patterns.length > 0 && <span className="badge-dot" />}
              </button>
              {showNotifs && (
                <div className="notif-dropdown">
                  <b>Notifications</b>
                  {patterns.length
                    ? patterns.map((pattern, index) => <p key={index}>{pattern.description}</p>)
                    : <p className="empty-state">No patterns detected yet — keep logging meals.</p>}
                </div>
              )}
            </div>
            <div className="avatar">{name[0]?.toUpperCase() || "N"}</div>
          </div>
        </header>

        {tab === "overview" && (
          <div className="page-wrap">
            <div className="hero-row"><div><p className="eyebrow">YOUR DAILY RHYTHM</p><h1>Good morning, {name} <span>✦</span></h1><p className="subtitle">Small choices today become a healthier you tomorrow.</p></div><button className="primary-btn" onClick={() => document.getElementById("food-entry")?.focus()}><Plus size={18} /> Log food</button></div>
            {notice && <div className="notice-banner"><Sparkles size={16} />{notice}<button onClick={() => setNotice("")}><X size={15} /></button></div>}
            <div className="insight-banner"><div className="insight-icon"><Sparkles size={19} /></div><div><b>{budget ? "Your nutrition is in motion" : "Connect your nutrition profile"}</b><p>{budget ? `${budget.remaining_protein_g}g of protein remains in your target today.` : "Complete onboarding to calculate your personal targets."}</p></div>{!profile || profile.status === "not_onboarded" ? <button className="link-btn" onClick={() => setShowOnboarding(true)}>Set up profile <ArrowUpRight size={15} /></button> : null}</div>
            <div className="section-header"><div><h2>Today&apos;s overview</h2><p>Live data from your NutriSync food log.</p></div></div>
            <div className="stats-grid">
              <Stat label="Calories" value={calories} goal={budget?.target_calories || 0} unit=" kcal" color="coral" Icon={Flame} />
              <Stat label="Protein" value={protein} goal={budget?.target_protein_g || 0} unit="g" color="blue" Icon={Target} />
              <Stat label="Carbs" value={carbs} goal={budget?.target_carbs_g || 0} unit="g" color="yellow" Icon={Zap} />
              <Stat label="Water" value={water} goal={budget?.target_water_l || 0} unit=" L" color="cyan" Icon={Droplets}>
                <div className="water-actions"><button onClick={() => logWater(0.25)}>+250ml</button><button onClick={() => logWater(0.5)}>+500ml</button></div>
              </Stat>
            </div>
            <div className="content-grid">
              <section className="panel">
                <div className="panel-head"><div><h3>Recent meals</h3><p>Your food log for today</p></div></div>
                <div className="meal-list">
                  {meals.length ? meals.slice(0, 6).map((meal, index) => (
                    <div className="meal-row" key={`${meal.food_name}-${index}`}>
                      <div className="meal-icon mint">🥗</div>
                      <div className="meal-info"><b>{meal.food_name}</b><span>{meal.meal_type} · {meal.log_time || "today"}</span></div>
                      <div className="macro-box"><b>{meal.calories}</b><span>kcal</span></div>
                      <div className="macro-box protein-box"><b>{meal.protein_g}g</b><span>protein</span></div>
                    </div>
                  )) : <p className="empty-state">No meals logged yet. Start with the box below.</p>}
                </div>
                <form className="inline-log" onSubmit={logFood}><input id="food-entry" value={food} onChange={event => setFood(event.target.value)} placeholder="e.g. 2 idli, chai, paneer tikka..." /><button className="primary-btn" disabled={loading}><Plus size={16} /> {loading ? "Logging" : "Add meal"}</button></form>
              </section>
              <aside className="panel coach-panel">
                <div className="coach-badge"><Sparkles size={20} /></div>
                <p className="eyebrow">NUTRISYNC COACH</p>
                <h3>A little nudge for you</h3>
                <p>{reply || "Ask me about your meals, targets, or what to eat next. I use your real nutrition data."}</p>
                <form className="coach-form" onSubmit={askCoach}><input ref={chatInputRef} value={chat} onChange={event => setChat(event.target.value)} placeholder="Ask your coach..." /><button aria-label="Send question" disabled={loading}><ArrowUpRight size={16} /></button></form>
              </aside>
            </div>
          </div>
        )}

        {tab === "foodlog" && (
          <div className="page-wrap">
            <div className="hero-row"><div><p className="eyebrow">FOOD LOG</p><h1>Everything you&apos;ve eaten today</h1><p className="subtitle">Full list of logged meals, most recent first.</p></div></div>
            <section className="panel" style={{ marginTop: 24 }}>
              <form className="inline-log" onSubmit={logFood}><input value={food} onChange={event => setFood(event.target.value)} placeholder="e.g. 2 idli, chai, paneer tikka..." /><button className="primary-btn" disabled={loading}><Plus size={16} /> {loading ? "Logging" : "Add meal"}</button></form>
              <div className="meal-list">
                {meals.length ? meals.map((meal, index) => (
                  <div className="meal-row" key={`${meal.food_name}-${index}`}>
                    <div className="meal-icon mint">🥗</div>
                    <div className="meal-info"><b>{meal.food_name}</b><span>{meal.meal_type} · {meal.log_time || "today"}</span></div>
                    <div className="macro-box"><b>{meal.calories}</b><span>kcal</span></div>
                    <div className="macro-box protein-box"><b>{meal.protein_g}g</b><span>protein</span></div>
                  </div>
                )) : <p className="empty-state">No meals logged yet.</p>}
              </div>
            </section>
          </div>
        )}

        {tab === "mealplans" && (
          <div className="page-wrap">
            <div className="hero-row"><div><p className="eyebrow">MEAL PLANS</p><h1>What to eat next</h1><p className="subtitle">Suggestions based on what&apos;s left in today&apos;s budget.</p></div><button className="primary-btn" onClick={refreshSuggestion}><Sparkles size={16} /> Refresh</button></div>
            <section className="panel" style={{ marginTop: 24 }}>
              {suggestionLoading ? (
                <p className="empty-state">Finding a good fit...</p>
              ) : suggestion ? (
                suggestion.error || suggestion.message ? <p className="empty-state">{suggestion.error || suggestion.message}</p> :
                <div className="meal-list">
                  {(suggestion.options || []).map((option: any, index: number) => (
                    <div className="meal-row" key={index}>
                      <div className="meal-icon mint">🍽️</div>
                      <div className="meal-info"><b>{option.food_name}</b><span>{option.servings_unit}</span></div>
                      <div className="macro-box"><b>{Math.round(option.unit_serving_energy_kcal)}</b><span>kcal</span></div>
                      <div className="macro-box protein-box"><b>{Math.round(option.unit_serving_protein_g)}g</b><span>protein</span></div>
                    </div>
                  ))}
                </div>
              ) : <p className="empty-state">No suggestions yet.</p>}
            </section>
          </div>
        )}

        {tab === "progress" && (
          <div className="page-wrap">
            <div className="hero-row"><div><p className="eyebrow">PROGRESS</p><h1>Patterns NutriSync has noticed</h1><p className="subtitle">Detected across your last 7 days of logging.</p></div><button className="primary-btn" onClick={refreshPatterns}><Activity size={16} /> Rescan</button></div>
            <section className="panel" style={{ marginTop: 24 }}>
              {patterns.length ? patterns.map((pattern, index) => (
                <div className="meal-row" key={index}>
                  <div className="meal-icon lavender">📈</div>
                  <div className="meal-info"><b>{pattern.pattern_type.replace(/_/g, " ")}</b><span>{pattern.description}</span></div>
                </div>
              )) : <p className="empty-state">No patterns detected yet — keep logging meals daily.</p>}
            </section>
          </div>
        )}
      </section>
      {showOnboarding && <Onboarding onDone={() => { setShowOnboarding(false); refresh(); }} />}
    </main>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", age: "", sex: "male", height_cm: "", current_weight_kg: "", target_weight_kg: "", goal: "fat_loss", activity_level: "casual", allergies: "", medical_conditions: "", sleep_schedule: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const change = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/profile/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, age: Number(form.age), height_cm: Number(form.height_cm), current_weight_kg: Number(form.current_weight_kg), target_weight_kg: Number(form.target_weight_kg) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.detail ? String(data.detail) : "Please check your details and try again.");
        return;
      }
      onDone();
    } catch {
      setError("Can't reach the backend right now. Check that the API server is running and reachable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <form className="modal-card onboarding" onSubmit={submit}>
        <p className="eyebrow">WELCOME TO NUTRISYNC</p>
        <h3>Let&apos;s make your plan personal.</h3>
        <p>Your targets are calculated with the same nutrition engine that powers the food log.</p>
        <div className="form-grid">
          {[["name", "Name", "text"], ["age", "Age", "number"], ["height_cm", "Height (cm)", "number"], ["current_weight_kg", "Current weight (kg)", "number"], ["target_weight_kg", "Target weight (kg)", "number"]].map(([key, label, type]) => (
            <label key={key}>{label}<input required type={type} value={form[key as keyof typeof form]} onChange={event => change(key, event.target.value)} /></label>
          ))}
          <label>Sex<select value={form.sex} onChange={event => change("sex", event.target.value)}><option value="male">Male</option><option value="female">Female</option></select></label>
          <label>Goal<select value={form.goal} onChange={event => change("goal", event.target.value)}><option value="fat_loss">Fat loss</option><option value="muscle_gain">Muscle gain</option><option value="recomp">Recomposition</option><option value="maintenance">Maintenance</option></select></label>
          <label>Activity<select value={form.activity_level} onChange={event => change("activity_level", event.target.value)}><option value="sedentary">Sedentary</option><option value="casual">Casual</option><option value="gym">Gym</option><option value="bodybuilder">Bodybuilder</option></select></label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-btn full-width" type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create my plan"} <ArrowUpRight size={17} /></button>
      </form>
    </div>
  );
}