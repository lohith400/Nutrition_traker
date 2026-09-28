"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, Plus, RefreshCw, Sparkles } from "lucide-react";
import Shell, { API } from "../components/Shell";

type Option = { food_name: string; calories: number; protein_g: number; quantity: number; unit: "serving" | "grams"; serving_label?: string | null };
type Slot = "breakfast" | "lunch" | "snack" | "dinner";
type DayPlan = { status?: string; plan?: Record<Slot, Option[]>; plan_totals?: { calories: number; protein_g: number }; error?: string };
type Budget = { remaining_calories: number; remaining_protein_g: number; remaining_carbs_g: number; remaining_fat_g: number; target_calories: number; error?: string };

const SLOTS: { key: Slot; title: string; hint: string; icon: string }[] = [
  { key: "breakfast", title: "Breakfast", hint: "About a quarter of what's left today", icon: "🍳" },
  { key: "lunch", title: "Lunch", hint: "The biggest share of what's left", icon: "🍛" },
  { key: "snack", title: "Snack", hint: "Something light in between", icon: "🥜" },
  { key: "dinner", title: "Dinner", hint: "About a quarter of what's left today", icon: "🍲" },
];

function portion(option: Option): string {
  if (option.unit === "grams") return `${option.quantity} g`;
  const label = option.serving_label || "serving";
  return `${option.quantity} ${label}`;
}

export default function MealPlansPage() {
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [logging, setLogging] = useState<string | null>(null);
  const [logged, setLogged] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [planResponse, overviewResponse] = await Promise.all([
        fetch(`${API}/api/suggestions?whole_day=true`),
        fetch(`${API}/api/overview`),
      ]);
      setPlan(await planResponse.json());
      setBudget(await overviewResponse.json());
    } catch {
      setError("Backend unavailable. Start FastAPI on port 8000.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function logOption(slot: Slot, option: Option) {
    const id = `${slot}:${option.food_name}`;
    setLogging(id);
    setNotice("");
    try {
      const response = await fetch(`${API}/api/log-food`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_name: option.food_name, quantity: option.quantity, unit: option.unit, meal_type: slot }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not log this food.");
      setLogged(current => new Set(current).add(id));
      setNotice(`Logged ${data.matched_to} for ${slot}: ${data.calories} kcal, ${data.protein_g}g protein.`);
      const overview = await fetch(`${API}/api/overview`).then(r => r.json());
      setBudget(overview);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not log this food.");
    } finally {
      setLogging(null);
    }
  }

  const notOnboarded = budget?.error || plan?.error;
  const overBudget = !notOnboarded && budget && budget.remaining_calories <= 0;
  const empty = plan?.plan ? SLOTS.every(slot => (plan.plan?.[slot.key] || []).length === 0) : true;

  return (
    <Shell active="plans" crumb="Meal plans">
      <div className="page-wrap">
        <div className="hero-row">
          <div>
            <h1>Today&apos;s meal plan <span>✦</span></h1>
            <p className="subtitle">Ideas for the rest of your day, chosen from the foods in your database to fit what you have left to eat.</p>
          </div>
          <button className="primary-btn" onClick={load} disabled={loading}><RefreshCw size={16} /> {loading ? "Refreshing" : "Refresh plan"}</button>
        </div>

        {error && <div className="notice-banner"><Sparkles size={16} />{error}</div>}
        {notice && <div className="notice-banner"><CheckCircle2 size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}

        {notOnboarded && (
          <div className="insight-banner">
            <div className="insight-icon"><Sparkles size={19} /></div>
            <div><b>Set up your profile first</b><p>Meal plans are built from your daily targets. Add your details and they&apos;ll appear here.</p></div>
            <Link className="link-btn" href="/profile">Set up profile <ArrowUpRight size={15} /></Link>
          </div>
        )}

        {!notOnboarded && budget && (
          <div className="plan-budget">
            <div><span>Calories left</span><b>{Math.round(budget.remaining_calories)}</b><small>kcal</small></div>
            <div><span>Protein left</span><b>{Math.round(budget.remaining_protein_g)}</b><small>g</small></div>
            <div><span>Carbs left</span><b>{Math.round(budget.remaining_carbs_g)}</b><small>g</small></div>
            <div><span>Fat left</span><b>{Math.round(budget.remaining_fat_g)}</b><small>g</small></div>
          </div>
        )}

        {loading && !plan && <p className="empty-state">Building your plan…</p>}

        {overBudget && <p className="empty-state">You&apos;ve reached today&apos;s calorie target, so there&apos;s nothing more to plan. A fresh plan appears tomorrow.</p>}

        {!notOnboarded && !overBudget && plan && empty && !loading && (
          <p className="empty-state">No foods in the database fit what&apos;s left today. Ask the <Link className="inline-link" href="/chat">coach</Link> for ideas, or log a smaller item.</p>
        )}

        {!notOnboarded && !overBudget && plan?.plan && !empty && (
          <div className="plan-grid">
            {SLOTS.map(slot => {
              const options = plan.plan?.[slot.key] || [];
              return (
                <section className="panel plan-slot" key={slot.key}>
                  <div className="panel-head">
                    <div><h3>{slot.title}</h3><p>{slot.hint}</p></div>
                    <span className="plan-slot-icon" aria-hidden="true">{slot.icon}</span>
                  </div>
                  {options.length === 0 && <p className="empty-state">Nothing fits this slot right now.</p>}
                  {options.map(option => {
                    const id = `${slot.key}:${option.food_name}`;
                    const done = logged.has(id);
                    return (
                      <div className="meal-row" key={id}>
                        <div className="meal-info"><b>{option.food_name}</b><span>{portion(option)}</span></div>
                        <div className="macro-box"><b>{Math.round(option.calories)}</b><span>kcal</span></div>
                        <div className="macro-box protein-box"><b>{option.protein_g}g</b><span>protein</span></div>
                        <button className={done ? "log-chip done" : "log-chip"} onClick={() => logOption(slot.key, option)} disabled={done || logging === id} aria-label={`Log ${option.food_name} as ${slot.key}`}>
                          {done ? <CheckCircle2 size={14} /> : <Plus size={14} />}{done ? "Logged" : logging === id ? "Logging" : "Log"}
                        </button>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}

        {plan?.plan_totals && !empty && !overBudget && (
          <p className="plan-footnote">If you ate everything above: about <b>{Math.round(plan.plan_totals.calories)} kcal</b> and <b>{Math.round(plan.plan_totals.protein_g)}g protein</b>. Pick what you like; you don&apos;t need all of it.</p>
        )}
      </div>
    </Shell>
  );
}