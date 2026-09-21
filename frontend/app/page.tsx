"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Droplets,
  Flame,
  Home,
  Leaf,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Utensils,
  UserRound,
  X,
  Zap,
} from "lucide-react";

const navItems = [
  { label: "Overview", icon: Home },
  { label: "Food log", icon: Utensils },
  { label: "Meal plans", icon: Leaf },
  { label: "Progress", icon: Activity },
];

const mealRows = [
  { name: "Masala dosa", tag: "Breakfast", time: "08:30 AM", calories: 312, protein: 8, icon: "🥞", tone: "peach" },
  { name: "Paneer tikka bowl", tag: "Lunch", time: "01:15 PM", calories: 486, protein: 28, icon: "🥗", tone: "mint" },
  { name: "Filter coffee", tag: "Snack", time: "04:40 PM", calories: 92, protein: 3, icon: "☕", tone: "lavender" },
];

function StatCard({ label, value, unit, goal, color, icon: Icon }: { label: string; value: number; unit: string; goal: number; color: string; icon: typeof Flame }) {
  const pct = Math.min((value / goal) * 100, 100);
  return (
    <div className="stat-card">
      <div className="stat-topline">
        <span className={`stat-icon ${color}`}><Icon size={17} /></span>
        <span>{label}</span>
        <button aria-label={`More info for ${label}`}><MoreHorizontal size={16} /></button>
      </div>
      <div className="stat-number">{value}<small>{unit}</small></div>
      <div className="progress-track"><span className={`progress-fill ${color}`} style={{ width: `${pct}%` }} /></div>
      <div className="stat-meta">
        <span>{Math.round(pct)}% of goal</span>
        <b>{goal}{unit}</b>
      </div>
    </div>
  );
}

export default function Page() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [foodInput, setFoodInput] = useState("");
  const [notice, setNotice] = useState("");

  const weekBars = useMemo(() => [78, 90, 66, 94, 80, 42, 26], []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodInput.trim()) return;
    setNotice(`${foodInput.trim()} is queued for nutrition analysis.`);
    setFoodInput("");
    setTimeout(() => setNotice(""), 3200);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-badge"><Sparkles size={18} /></span>
          <span>Nutri<span>Sync</span></span>
        </div>

        <div className="workspace-card">
          <div className="avatar avatar-sm">A</div>
          <div>
            <b>Arjun&apos;s space</b>
            <small>Personal plan</small>
          </div>
          <ChevronDown size={14} />
        </div>

        <nav className="nav">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={activeTab === label ? "nav-item active" : "nav-item"}
              onClick={() => setActiveTab(label)}
            >
              <Icon size={18} />
              {label}
              {label === "Progress" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item"><Settings size={18} />Settings</button>
          <button className="nav-item"><CircleHelp size={18} />Help center</button>

          <div className="upgrade-box">
            <div className="upgrade-icon"><Zap size={16} /></div>
            <b>Make every meal count.</b>
            <p>Unlock deeper insights and smarter macro coaching.</p>
            <button>Explore Plus <ArrowUpRight size={14} /></button>
          </div>

          <div className="profile-mini">
            <div className="avatar">A</div>
            <div>
              <b>Arjun Rao</b>
              <small>Free plan</small>
            </div>
            <MoreHorizontal size={17} />
          </div>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <button className="mobile-button" aria-label="Open menu"><Menu size={20} /></button>
          <div className="crumbs">
            <span>My nutrition</span>
            <ChevronRight size={15} />
            <b>{activeTab}</b>
          </div>

          <div className="top-actions">
            <button className="icon-button" aria-label="Search"><Search size={18} /></button>
            <button className="icon-button alarm" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="avatar">A</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="hero-row">
            <div>
              <p className="eyebrow">Monday, September 21, 2026</p>
              <h1>Good morning, Arjun <span>✦</span></h1>
              <p className="subtitle">Small choices today become a healthier you tomorrow.</p>
            </div>
            <button className="primary-btn" onClick={() => setQuickLogOpen(true)}><Plus size={18} /> Log food</button>
          </div>

          {notice && (
            <div className="notice-banner">
              <Sparkles size={16} />
              {notice}
              <button onClick={() => setNotice("")}><X size={15} /></button>
            </div>
          )}

          <div className="insight-banner">
            <div className="insight-icon"><Sparkles size={19} /></div>
            <div>
              <b>Your morning is on track</b>
              <p>You&apos;re 18g away from your protein goal. A bowl of curd with sprouts would be a great next step.</p>
            </div>
            <button className="link-btn">View suggestion <ArrowUpRight size={15} /></button>
          </div>

          <div className="section-header">
            <div>
              <h2>Today&apos;s overview</h2>
              <p>Here&apos;s how your nutrition is looking so far.</p>
            </div>
            <button className="date-btn">Today <ChevronDown size={15} /></button>
          </div>

          <div className="stats-grid">
            <StatCard label="Calories" value={890} unit="kcal" goal={2200} color="coral" icon={Flame} />
            <StatCard label="Protein" value={39} unit="g" goal={120} color="blue" icon={Target} />
            <StatCard label="Carbs" value={112} unit="g" goal={260} color="yellow" icon={Zap} />
            <StatCard label="Water" value={1.2} unit="L" goal={2.8} color="cyan" icon={Droplets} />
          </div>

          <div className="content-grid">
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h3>Recent meals</h3>
                  <p>Your food log for today</p>
                </div>
                <button className="link-btn">View all <ArrowUpRight size={15} /></button>
              </div>

              <div className="meal-list">
                {mealRows.map((meal) => (
                  <div key={meal.name} className="meal-row">
                    <div className={`meal-icon ${meal.tone}`}>{meal.icon}</div>
                    <div className="meal-info">
                      <b>{meal.name}</b>
                      <span>{meal.tag} · {meal.time}</span>
                    </div>
                    <div className="macro-box">
                      <b>{meal.calories}</b>
                      <span>kcal</span>
                    </div>
                    <div className="macro-box protein-box">
                      <b>{meal.protein}g</b>
                      <span>protein</span>
                    </div>
                    <button aria-label={`Meal options for ${meal.name}`}><MoreHorizontal size={17} /></button>
                  </div>
                ))}
              </div>

              <button className="add-meal" onClick={() => setQuickLogOpen(true)}><Plus size={15} /> Add another meal</button>
            </section>

            <aside className="panel coach-panel">
              <div className="coach-badge"><Sparkles size={20} /></div>
              <p className="eyebrow">NUTRISYNC COACH</p>
              <h3>A little nudge for you</h3>
              <p>
                Your protein is a little behind today. Try adding dal, paneer, eggs, or Greek yogurt to your next meal.
              </p>
              <button className="secondary-btn"><MessageCircle size={15} /> Ask your coach</button>
              <div className="coach-footer">
                <span><span className="online-dot" /> Coach is ready</span>
                <ChevronRight size={16} />
              </div>
            </aside>
          </div>

          <section className="panel rhythm-panel">
            <div>
              <p className="eyebrow">WEEKLY RHYTHM</p>
              <h3>Your consistency is building</h3>
              <p>Keep showing up — you&apos;ve logged meals on 5 of the last 7 days.</p>
            </div>

            <div className="week-bars">
              {weekBars.map((value, index) => (
                <div key={index} className="day-bar">
                  <span style={{ height: `${value}%` }} />
                  <small>{["M", "T", "W", "T", "F", "S", "S"][index]}</small>
                </div>
              ))}
            </div>

            <div className="streak-box">
              <span className="streak-mark">✦</span>
              <b>5 day</b>
              <small>streak</small>
            </div>
          </section>
        </div>
      </section>

      {quickLogOpen && (
        <div className="modal-overlay" onClick={() => setQuickLogOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setQuickLogOpen(false)}><X size={18} /></button>
            <div className="modal-icon"><Utensils size={20} /></div>
            <p className="eyebrow">QUICK LOG</p>
            <h3>What did you eat?</h3>
            <p>Tell NutriSync in your own words and we&apos;ll interpret it into precise meal tracking.</p>

            <form onSubmit={handleSubmit}>
              <label htmlFor="food-entry">Food or meal</label>
              <div className="input-shell">
                <Search size={16} />
                <input
                  id="food-entry"
                  autoFocus
                  value={foodInput}
                  onChange={(e) => setFoodInput(e.target.value)}
                  placeholder="e.g. 2 idli and a cup of chai"
                />
              </div>

              <div className="chip-row">
                <button type="button" onClick={() => setFoodInput("2 idli and a cup of chai")}>🥣 Breakfast</button>
                <button type="button" onClick={() => setFoodInput("paneer tikka")}>🥗 Lunch</button>
              </div>

              <button type="submit" className="primary-btn full-width">
                Review and log <ArrowUpRight size={17} />
              </button>
            </form>

            <small className="modal-note">Nutrition estimates are derived from your saved food database.</small>
          </div>
        </div>
      )}
    </main>
  );
}
