"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Sparkles, TrendingUp } from "lucide-react";
import Shell from "../components/Shell";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type MealRow = { meal_type: string; food_name: string; quantity: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; log_time: string };
type DayEntry = { date: string; meals: MealRow[]; total_calories: number; total_protein_g: number; total_carbs_g: number; total_fat_g: number };
type Pattern = { pattern_type: string; description: string; detected_on: string };
type Profile = { name?: string; target_calories?: number; target_protein_g?: number };

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function LogPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/api/profile`).then(r => r.json()).then(setProfile).catch(() => {});
    Promise.all([
      fetch(`${API}/api/history?days=21`).then(r => r.json()),
      fetch(`${API}/api/patterns`).then(r => r.json()),
    ])
      .then(([history, patternData]) => {
        const list: DayEntry[] = history.days || [];
        setDays(list);
        setPatterns(patternData.patterns || []);
        if (list.length) setOpenDate(list[0].date);
      })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => setLoading(false));
  }, []);

  const name = profile?.name || "there";
  const calorieTarget = profile?.target_calories || 0;
  const proteinTarget = profile?.target_protein_g || 0;

  return (
    <Shell active="log" crumb="Food log">
        <div className="page-wrap">
          <div className="hero-row">
            <div>
              <p className="eyebrow">YOUR HISTORY</p>
              <h1>Every meal, every day <span>✦</span></h1>
              <p className="subtitle">The full daily intake record, pulled straight from your logged meals — nothing summarized away.</p>
            </div>
          </div>

          {error && <div className="notice-banner"><Sparkles size={16} />{error}</div>}

          {patterns.length > 0 && (
            <div className="insight-banner">
              <div className="insight-icon"><TrendingUp size={19} /></div>
              <div><b>What I&apos;ve noticed</b><p>{patterns[0].description}</p></div>
            </div>
          )}

          <div className="section-header"><div><h2>Daily history</h2><p>Last {days.length} day{days.length === 1 ? "" : "s"} with a logged meal.</p></div></div>

          {loading && <p className="empty-state">Loading history…</p>}
          {!loading && days.length === 0 && <p className="empty-state">No meals logged yet. Head to Overview or Coach chat to log your first meal.</p>}

          <div className="log-days">
            {days.map(day => {
              const isOpen = openDate === day.date;
              const calPct = calorieTarget ? Math.min(100, Math.round((day.total_calories / calorieTarget) * 100)) : 0;
              const proPct = proteinTarget ? Math.min(100, Math.round((day.total_protein_g / proteinTarget) * 100)) : 0;
              return (
                <div className={`log-day ${isOpen ? "open" : ""}`} key={day.date}>
                  <button className="log-day-head" onClick={() => setOpenDate(isOpen ? null : day.date)}>
                    <ChevronDown size={16} className="log-chevron" />
                    <span className="log-day-title">{formatDate(day.date)}</span>
                    <span className="log-day-sub">{day.meals.length} item{day.meals.length === 1 ? "" : "s"}</span>
                    <span className="log-day-totals">
                      <b>{day.total_calories}</b> kcal{calorieTarget ? ` · ${calPct}% of goal` : ""}
                      <i> · </i>
                      <b>{day.total_protein_g}g</b> protein{proteinTarget ? ` · ${proPct}%` : ""}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="log-day-body">
                      {day.meals.map((meal, index) => (
                        <div className="meal-row" key={`${meal.food_name}-${index}`}>
                          <div className="meal-icon mint">🥗</div>
                          <div className="meal-info"><b>{meal.food_name}</b><span>{meal.meal_type} · {meal.log_time?.slice(11, 16) || ""} · × {meal.quantity}</span></div>
                          <div className="macro-box"><b>{meal.calories}</b><span>kcal</span></div>
                          <div className="macro-box protein-box"><b>{meal.protein_g}g</b><span>protein</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
    </Shell>
  );
}