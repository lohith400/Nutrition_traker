"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  ChefHat,
  Droplets,
  Flame,
  Footprints,
  Plus,
  Search,
  Sparkles,
  Target,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import Shell from "./components/Shell";
import { FoodOption, FoodOptionList } from "./components/FoodOptions";
import { TodayPlate } from "./components/TodayPlate";
import { HydrationJar } from "./components/HydrationJar";
import { VitaminShelf, MicronutrientItem } from "./components/VitaminShelf";
import { FoodGlyph } from "./components/art/FoodGlyph";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

function mapBackendMicrosToShelf(backendData: any): MicronutrientItem[] | null {
  if (!backendData || !backendData.nutrients) return null;
  const symbols: Record<string, string> = {
    calcium_mg: "Ca",
    magnesium_mg: "Mg",
    sodium_mg: "Na",
    potassium_mg: "K+",
    iron_mg: "Fe",
    copper_mg: "Cu",
    zinc_mg: "Zn",
    vita_ug: "A",
    vitc_mg: "C",
    vitd_ug: "D",
    vite_mg: "E",
    vitk_ug: "K",
    folate_ug: "B₉",
    vitb1_mg: "B₁",
    vitb2_mg: "B₂",
    vitb3_mg: "B₃",
    vitb5_mg: "B₅",
    vitb6_mg: "B₆",
    vitb7_ug: "B₇",
  };

  return backendData.nutrients
    .filter((n: any) => n.key !== "fibre_g")
    .map((n: any) => ({
      key: n.key,
      name: n.name,
      symbol: symbols[n.key] || n.name.slice(0, 2),
      group: n.category === "vitamin" ? "vitamin" : "mineral",
      amount: n.amount,
      target: n.rda || 100,
      unit: n.unit,
      pct: n.pct_rda,
      topFoods: (n.top_foods || []).map((f: any) => ({
        food_name: f.food_name,
        amount: `${f.amount} ${n.unit}`,
      })),
    }));
}

type Profile = {
  status?: string;
  name?: string;
  target_calories?: number;
  target_protein_g?: number;
  target_carbs_g?: number;
  target_fat_g?: number;
  target_water_l?: number;
};

type Pattern = {
  pattern_type: string;
  description: string;
  detected_on: string;
};

type Budget = {
  target_fat_g?: number;
  consumed_fat_g?: number;
  remaining_fat_g?: number;
  consumed_calories: number;
  remaining_calories: number;
  consumed_protein_g: number;
  remaining_protein_g: number;
  consumed_carbs_g: number;
  remaining_carbs_g: number;
  target_calories: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_water_l?: number;
  consumed_water_l?: number;
  remaining_water_l?: number;
  patterns?: Pattern[];
};

type Meal = {
  log_id?: number;
  food_name: string;
  meal_type: string;
  log_time?: string;
  calories: number;
  protein_g: number;
};

type FitnessSummary = {
  status?: "ok" | "error" | "not_configured";
  configured?: boolean;
  date?: string;
  steps: number;
  calories_burned: number;
  running_minutes: number;
  error?: string;
  message?: string;
};

function timeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function fmt(n: number): string {
  return String(Math.round((Number(n) || 0) * 10) / 10);
}

function Stat({
  label,
  value,
  goal,
  unit,
  color,
  Icon,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  Icon: typeof Flame;
}) {
  const percent = goal ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="stat-card">
      <div className="stat-topline">
        <span className={`stat-icon ${color}`}>
          <Icon size={17} />
        </span>
        <span className="almanac-serif" style={{ fontWeight: 600 }}>{label}</span>
        <span className="stat-more">···</span>
      </div>
      <div className="stat-number">
        <span className="stat-value tabular">{fmt(value)}</span>
        <small className="almanac-mono">{unit}</small>
      </div>
      <div className="progress-track">
        <span className={`progress-fill ${color}`} style={{ width: `${percent}%` }} />
      </div>
      <div className="stat-meta">
        <span className="tabular">{Math.round(percent)}% of target</span>
        <b className="tabular almanac-mono">
          {fmt(goal)}
          {unit}
        </b>
      </div>
    </div>
  );
}

function QuickAdd({ onLogged }: { onLogged: () => void }) {
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<FoodOption[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setOptions(null);
      return;
    }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`${API}/api/food-options?q=${encodeURIComponent(text)}&limit=6`)
        .then((r) => r.json())
        .then((d) => {
          if (mine === seq.current) {
            setOptions(d.options || []);
            setHidden(d.hidden_by_diet || 0);
          }
        })
        .catch(() => {
          if (mine === seq.current) setOptions([]);
        })
        .finally(() => {
          if (mine === seq.current) setLoading(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="quick-add">
      <label className="search-box">
        <Search size={16} />
        <input
          id="food-entry"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search foods to log: idli, masala chai, egg, banana, curd rice…"
          aria-label="Search foods to log"
        />
      </label>
      {loading && !options && <p className="empty-state small">Searching database…</p>}
      {options && options.length === 0 && !loading && (
        <p className="empty-state small">
          Nothing related to “{q}”.{" "}
          <Link className="inline-link" href="/custom-foods">
            <ChefHat size={12} /> Build it from ingredients
          </Link>
        </p>
      )}
      {options && options.length > 0 && (
        <FoodOptionList
          key={q}
          options={options}
          hiddenByDiet={hidden}
          onLogged={() => {
            onLogged();
          }}
        />
      )}
    </div>
  );
}

export default function Page() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [fitness, setFitness] = useState<FitnessSummary | null>(null);
  const [microsData, setMicrosData] = useState<any>(null);
  const [chat, setChat] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [notice, setNotice] = useState("");

  async function refresh() {
    const [profileResponse, overviewResponse, mealsResponse, fitnessResponse, microsResponse] = await Promise.all([
      fetch(`${API}/api/profile`),
      fetch(`${API}/api/overview`),
      fetch(`${API}/api/recent-meals`),
      fetch(`${API}/api/fitness/today`).catch(() => null),
      fetch(`${API}/api/micronutrients/today`).catch(() => null),
    ]);
    const nextProfile = await profileResponse.json();
    const nextBudget = await overviewResponse.json();
    const nextMeals = await mealsResponse.json();
    if (fitnessResponse && fitnessResponse.ok) {
      try {
        const nextFitness = await fitnessResponse.json();
        setFitness(nextFitness);
      } catch {
        // ignore parse error
      }
    }
    if (microsResponse && microsResponse.ok) {
      try {
        const nextMicros = await microsResponse.json();
        setMicrosData(nextMicros);
      } catch {
        // ignore parse error
      }
    }
    setProfile(nextProfile);
    setBudget(nextBudget);
    setMeals(nextMeals.meals || []);
    if (nextProfile.status === "not_onboarded") setShowOnboarding(true);
  }

  useEffect(() => {
    refresh().catch(() => setNotice("Backend unavailable. Start FastAPI on port 8000."));
  }, []);

  async function removeMeal(id: number) {
    try {
      const response = await fetch(`${API}/api/log/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove that entry.");
      setNotice("Removed from today's log.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove that entry.");
    }
  }

  async function askCoach(event: FormEvent) {
    event.preventDefault();
    if (!chat.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chat }),
      });
      const data = await response.json();
      setReply(data.reply || data.detail);
      setChat("");
    } catch {
      setReply("The coach is unavailable. Check your API key and backend.");
    } finally {
      setLoading(false);
    }
  }

  async function quickLogWater(amountL: number, label: string) {
    setLoading(true);
    try {
      const response = await fetch(`${API}/api/log-water`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_l: amountL }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not log water.");
      setNotice(`Logged ${label} water (${data.consumed_water_l ?? 0} L today).`);
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not log water.");
    } finally {
      setLoading(false);
    }
  }

  const name = profile?.name || "there";
  const calories = budget?.consumed_calories || 0;
  const protein = budget?.consumed_protein_g || 0;
  const carbs = budget?.consumed_carbs_g || 0;
  const fat = budget?.consumed_fat_g || 0;
  const water = budget?.consumed_water_l || 0;
  const greeting = timeGreeting();

  return (
    <Shell active="overview" crumb="Overview">
      <div className="page-wrap">
        {/* Notice Banner */}
        {notice && (
          <div className="notice-banner">
            <Sparkles size={16} />
            {notice}
            <button onClick={() => setNotice("")}>
              <X size={15} />
            </button>
          </div>
        )}

        {/* Profile Onboarding Callout if Needed */}
        {(!profile || profile.status === "not_onboarded") && (
          <div className="insight-banner">
            <div className="insight-icon">
              <Sparkles size={19} />
            </div>
            <div>
              <b>Connect your personal nutrition profile</b>
              <p>Complete onboarding to calculate your tailored ICMR-NIN caloric and macronutrient targets.</p>
            </div>
            <button className="link-btn" onClick={() => setShowOnboarding(true)}>
              Set up profile <ArrowUpRight size={15} />
            </button>
          </div>
        )}

        {budget?.patterns && budget.patterns.length > 0 && (
          <div className="notice-banner pattern-banner">
            <Sparkles size={16} />
            {budget.patterns[0].description}
          </div>
        )}

        {/* HERO MOMENT: Today's Plate Ceramic Experience */}
        <TodayPlate
          consumed={calories}
          target={budget?.target_calories || 0}
          burned={fitness?.calories_burned || 0}
          protein={protein}
          proteinTarget={budget?.target_protein_g || 0}
          carbs={carbs}
          carbsTarget={budget?.target_carbs_g || 0}
          fat={fat}
          fatTarget={budget?.target_fat_g || 0}
          fibre={microsData?.totals?.fibre_g || 0}
          fibreTarget={microsData?.rdas?.fibre_g || 30}
          meals={meals}
          greeting={greeting}
          userName={name}
          onLogClick={() => {
            const el = document.getElementById("food-entry");
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            el?.focus();
          }}
        />

        {/* Macro & Hydration Section */}
        <div className="section-header">
          <div>
            <span className="almanac-eyebrow">DAILY TARGET BALANCE</span>
            <h2 className="almanac-serif">Macronutrient Ledger</h2>
            <p>Calculated daily intake recorded across your meals.</p>
          </div>
        </div>

        <div className="stats-grid">
          <Stat
            label="Calories"
            value={calories}
            goal={budget?.target_calories || 0}
            unit=" kcal"
            color="coral"
            Icon={Flame}
          />
          <Stat
            label="Protein"
            value={protein}
            goal={budget?.target_protein_g || 0}
            unit="g"
            color="blue"
            Icon={Target}
          />
          <Stat
            label="Carbohydrates"
            value={carbs}
            goal={budget?.target_carbs_g || 0}
            unit="g"
            color="yellow"
            Icon={Zap}
          />
          <Stat
            label="Fats"
            value={fat}
            goal={budget?.target_fat_g || 0}
            unit="g"
            color="coral"
            Icon={Target}
          />
        </div>

        {/* Hydration Carboy Signature Card */}
        <div style={{ marginTop: "24px" }}>
          <HydrationJar
            consumed={water}
            target={budget?.target_water_l || 3.5}
            onLogWater={quickLogWater}
            disabled={loading}
          />
        </div>

        {/* Micronutrient Vitamin & Mineral Shelf */}
        <VitaminShelf
          items={mapBackendMicrosToShelf(microsData)}
          status={microsData ? (microsData.has_data ? "ok" : "not_available") : "loading"}
        />

        {/* Activity & Physical Movement from Google Fit */}
        <div className="section-header" style={{ marginTop: "36px" }}>
          <div>
            <span className="almanac-eyebrow">MOVEMENT &amp; ENERGY</span>
            <h2 className="almanac-serif">Physical Activity</h2>
            <p>Live health telemetry synced from Google Fit.</p>
          </div>
          <div>
            {fitness?.status === "ok" ? (
              <span className="fit-header-badge ok">
                <span className="fit-badge-dot" /> Google Fit Synced
              </span>
            ) : fitness?.configured ? (
              <span className="fit-header-badge warning" title={fitness?.error || "Google Fit credentials pending"}>
                <span className="fit-badge-dot" /> Google Fit Connected
              </span>
            ) : (
              <span className="fit-header-badge neutral">
                <span className="fit-badge-dot" /> Google Fit Setup
              </span>
            )}
          </div>
        </div>

        <div className="stats-grid">
          <Stat
            label="Daily Steps"
            value={fitness?.steps || 0}
            goal={10000}
            unit=" steps"
            color="emerald"
            Icon={Footprints}
          />
          <Stat
            label="Burned Calories"
            value={fitness?.calories_burned || 0}
            goal={2000}
            unit=" kcal"
            color="orange"
            Icon={Flame}
          />
          <Stat
            label="Active Exercise"
            value={fitness?.running_minutes || 0}
            goal={30}
            unit=" min"
            color="purple"
            Icon={Activity}
          />
        </div>

        {fitness?.status === "error" && (
          <div className="fit-helper-banner">
            <AlertCircle size={17} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <b>Google Fit Sync Status:</b> {fitness.error || "Token authorization issue."}
              <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.9 }}>
                If you generated this in Google OAuth Playground, ensure <code>Use your own OAuth credentials</code> was
                checked with your Client ID and Client Secret in Playground Settings (⚙).
              </div>
            </div>
          </div>
        )}

        {/* Content Grid: Recent Meals & Coach Assistant */}
        <div className="content-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <span className="almanac-eyebrow">CHRONOLOGICAL DISPATCH</span>
                <h3 className="almanac-serif">Recent Meals</h3>
                <p>Your food log for today</p>
              </div>
            </div>

            <div className="meal-list">
              {meals.length ? (
                meals.map((meal, index) => (
                  <div className="meal-row" key={`${meal.food_name}-${index}`}>
                    <div className="meal-icon mint">
                      <FoodGlyph name={meal.food_name} mealType={meal.meal_type} size={26} />
                    </div>
                    <div className="meal-info">
                      <b>{meal.food_name}</b>
                      <span className="almanac-mono">
                        {meal.meal_type} · {meal.log_time ? meal.log_time.slice(11, 16) || meal.log_time : "today"}
                      </span>
                    </div>
                    <div className="macro-box">
                      <b className="tabular">{meal.calories}</b>
                      <span>kcal</span>
                    </div>
                    <div className="macro-box protein-box">
                      <b className="tabular">{meal.protein_g}g</b>
                      <span>protein</span>
                    </div>
                    {meal.log_id != null && (
                      <button
                        type="button"
                        className="icon-mini"
                        aria-label={`Remove ${meal.food_name}`}
                        onClick={() => removeMeal(meal.log_id!)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="empty-state">No meals logged yet today. Search a food below to start your log.</p>
              )}
            </div>

            <QuickAdd
              onLogged={() => {
                refresh().catch(() => {});
              }}
            />
          </section>

          <aside className="panel coach-panel">
            <div className="coach-badge">
              <Sparkles size={20} />
            </div>
            <p className="almanac-eyebrow">NUTRISYNC COACH</p>
            <h3 className="almanac-serif">A Little Nudge</h3>
            <p>
              {reply ||
                "Ask me about your meals, targets, or what to eat next. I provide advice grounded in your real food logs."}
            </p>
            <form className="coach-form" onSubmit={askCoach}>
              <input
                value={chat}
                onChange={(event) => setChat(event.target.value)}
                placeholder="Ask your coach anything…"
              />
              <button aria-label="Send question">
                <ArrowUpRight size={16} />
              </button>
            </form>
            <Link className="link-btn coach-full-link" href="/chat">
              Open full conversation <ArrowUpRight size={13} />
            </Link>
          </aside>
        </div>
      </div>

      {showOnboarding && (
        <Onboarding
          onDone={() => {
            setShowOnboarding(false);
            refresh();
          }}
        />
      )}
    </Shell>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    name: "",
    age: "",
    sex: "male",
    height_cm: "",
    current_weight_kg: "",
    target_weight_kg: "",
    goal: "fat_loss",
    activity_level: "casual",
    diet: "any",
    allergies: "",
    medical_conditions: "",
    sleep_schedule: "",
    target_water_l: "3.5",
  });
  const [error, setError] = useState("");

  const change = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`${API}/api/profile/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        age: Number(form.age),
        height_cm: Number(form.height_cm),
        current_weight_kg: Number(form.current_weight_kg),
        target_weight_kg: Number(form.target_weight_kg),
        target_water_l: Number(form.target_water_l) || 3.5,
      }),
    });
    if (!response.ok) {
      setError("Please check your details and try again.");
      return;
    }
    onDone();
  }

  return (
    <div className="modal-overlay">
      <form className="modal-card onboarding" onSubmit={submit}>
        <p className="almanac-eyebrow">WELCOME TO NUTRISYNC</p>
        <h3 className="almanac-serif">Let&apos;s personalize your almanac.</h3>
        <p>Your targets are calculated with the nutrition engine based on ICMR-NIN guidelines.</p>
        <div className="form-grid">
          {[
            ["name", "Name", "text"],
            ["age", "Age", "number"],
            ["height_cm", "Height (cm)", "number"],
            ["current_weight_kg", "Current weight (kg)", "number"],
            ["target_weight_kg", "Target weight (kg)", "number"],
            ["target_water_l", "Target water (L)", "number"],
          ].map(([key, label, type]) => (
            <label key={key}>
              {label}
              <input
                required
                type={type}
                step="0.1"
                value={form[key as keyof typeof form]}
                onChange={(event) => change(key, event.target.value)}
              />
            </label>
          ))}
          <label>
            Sex
            <select value={form.sex} onChange={(event) => change("sex", event.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label>
            Goal
            <select value={form.goal} onChange={(event) => change("goal", event.target.value)}>
              <option value="fat_loss">Fat loss</option>
              <option value="muscle_gain">Muscle gain</option>
              <option value="recomp">Recomposition</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </label>
          <label>
            Activity
            <select value={form.activity_level} onChange={(event) => change("activity_level", event.target.value)}>
              <option value="sedentary">Sedentary</option>
              <option value="casual">Casual</option>
              <option value="gym">Gym</option>
              <option value="bodybuilder">Bodybuilder</option>
            </select>
          </label>
          <label>
            Diet
            <select value={form.diet} onChange={(event) => change("diet", event.target.value)}>
              <option value="any">No restriction</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="eggetarian">Eggetarian</option>
              <option value="vegan">Vegan</option>
            </select>
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-btn full-width" type="submit">
          Create my plan <ArrowUpRight size={17} />
        </button>
      </form>
    </div>
  );
}