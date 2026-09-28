"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { Pencil, Sparkles, X } from "lucide-react";
import Shell, { API } from "../components/Shell";

type Profile = {
  status?: string;
  name?: string; age?: number; sex?: string; height_cm?: number;
  current_weight_kg?: number; target_weight_kg?: number;
  goal?: string; activity_level?: string; diet?: string;
  allergies?: string; medical_conditions?: string; sleep_schedule?: string;
  bmr_kcal?: number; tdee_kcal?: number;
  target_calories?: number; target_protein_g?: number; target_carbs_g?: number; target_fat_g?: number; target_water_l?: number;
  onboarded_at?: string;
};

const GOALS: Record<string, string> = { fat_loss: "Fat loss", muscle_gain: "Muscle gain", recomp: "Recomposition", maintenance: "Maintenance" };
const ACTIVITY: Record<string, string> = { sedentary: "Sedentary", casual: "Casual", gym: "Gym", bodybuilder: "Bodybuilder" };
const DIETS: Record<string, string> = { any: "No restriction", vegetarian: "Vegetarian", eggetarian: "Eggetarian", vegan: "Vegan" };
const SEX: Record<string, string> = { male: "Male", female: "Female" };

type Form = {
  name: string; age: string; sex: string; height_cm: string; current_weight_kg: string; target_weight_kg: string;
  goal: string; activity_level: string; diet: string; allergies: string; medical_conditions: string; sleep_schedule: string;
};

function toForm(p: Profile | null): Form {
  return {
    name: p?.name || "", age: p?.age ? String(p.age) : "", sex: p?.sex || "male",
    height_cm: p?.height_cm ? String(p.height_cm) : "", current_weight_kg: p?.current_weight_kg ? String(p.current_weight_kg) : "",
    target_weight_kg: p?.target_weight_kg ? String(p.target_weight_kg) : "",
    goal: p?.goal || "fat_loss", activity_level: p?.activity_level || "casual", diet: p?.diet || "any",
    allergies: p?.allergies || "", medical_conditions: p?.medical_conditions || "", sleep_schedule: p?.sleep_schedule || "",
  };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="info-row"><dt>{label}</dt><dd>{children}</dd></div>;
}

function friendlyError(detail: unknown): string {
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: { loc?: string[]; msg?: string }) => `${(d.loc || []).slice(-1)[0] || "field"}: ${d.msg || "invalid value"}`).join(". ");
  }
  return typeof detail === "string" ? detail : "Please check your details and try again.";
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Form>(toForm(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const data: Profile = await fetch(`${API}/api/profile`).then(r => r.json());
      setProfile(data);
      if (data.status === "not_onboarded") { setEditing(true); setForm(toForm(null)); }
    } catch {
      setError("Backend unavailable. Start FastAPI on port 8000.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isNew = loaded && (!profile || profile.status === "not_onboarded");
  const change = (key: keyof Form, value: string) => setForm(current => ({ ...current, [key]: value }));

  function startEdit() { setForm(toForm(profile)); setError(""); setNotice(""); setEditing(true); }
  function cancelEdit() { setEditing(false); setError(""); }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${API}/api/profile/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          name: form.name.trim(),
          age: Number(form.age), height_cm: Number(form.height_cm),
          current_weight_kg: Number(form.current_weight_kg), target_weight_kg: Number(form.target_weight_kg),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(friendlyError(data.detail));
      await load();
      setEditing(false);
      setNotice(isNew ? "Profile created. Your daily targets are ready." : "Profile saved. Your daily targets were recalculated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const name = profile?.name || "";
  const initial = name ? name[0].toUpperCase() : "N";
  const bmi = profile?.height_cm && profile?.current_weight_kg
    ? Math.round((profile.current_weight_kg / Math.pow(profile.height_cm / 100, 2)) * 10) / 10
    : null;
  const since = profile?.onboarded_at
    ? new Date(profile.onboarded_at.replace(" ", "T")).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })
    : null;
  const none = <span className="muted">Not added</span>;

  return (
    <Shell active="profile" crumb="Profile">
      <div className="page-wrap">
        <div className="hero-row">
          <div className="profile-head">
            <div className="avatar avatar-lg">{initial}</div>
            <div>
              <h1>{!loaded ? "Your profile" : isNew ? "Create your profile" : name}</h1>
              <p className="subtitle">
                {!loaded ? "Loading your details…" : isNew
                  ? "Tell us a little about you and we'll calculate your daily targets."
                  : [GOALS[profile?.goal || ""], ACTIVITY[profile?.activity_level || ""], DIETS[profile?.diet || ""]].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          {loaded && !editing && !isNew && <button className="primary-btn" onClick={startEdit}><Pencil size={16} /> Edit profile</button>}
        </div>

        {notice && <div className="notice-banner"><Sparkles size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
        {error && !editing && <div className="notice-banner"><Sparkles size={16} />{error}</div>}
        {!loaded && <p className="empty-state">Loading your profile…</p>}

        {loaded && editing && (
          <form className="panel profile-form" onSubmit={save}>
            <div className="panel-head"><div><h3>{isNew ? "Your details" : "Edit your details"}</h3><p>Saving recalculates your calorie, protein, carb, fat and water targets.</p></div></div>
            <div className="form-grid">
              <label>Name<input required value={form.name} onChange={e => change("name", e.target.value)} /></label>
              <label>Age<input required type="number" min={13} max={99} value={form.age} onChange={e => change("age", e.target.value)} /></label>
              <label>Sex<select value={form.sex} onChange={e => change("sex", e.target.value)}><option value="male">Male</option><option value="female">Female</option></select></label>
              <label>Height (cm)<input required type="number" step="0.1" min={81} max={249} value={form.height_cm} onChange={e => change("height_cm", e.target.value)} /></label>
              <label>Current weight (kg)<input required type="number" step="0.1" min={26} max={299} value={form.current_weight_kg} onChange={e => change("current_weight_kg", e.target.value)} /></label>
              <label>Target weight (kg)<input required type="number" step="0.1" min={26} max={299} value={form.target_weight_kg} onChange={e => change("target_weight_kg", e.target.value)} /></label>
              <label>Goal<select value={form.goal} onChange={e => change("goal", e.target.value)}>{Object.entries(GOALS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Activity<select value={form.activity_level} onChange={e => change("activity_level", e.target.value)}>{Object.entries(ACTIVITY).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Diet<select value={form.diet} onChange={e => change("diet", e.target.value)}>{Object.entries(DIETS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Sleep schedule<input placeholder="e.g. 11 pm to 6 am" value={form.sleep_schedule} onChange={e => change("sleep_schedule", e.target.value)} /></label>
              <label className="span-2">Allergies<input placeholder="e.g. peanuts, shellfish" value={form.allergies} onChange={e => change("allergies", e.target.value)} /></label>
              <label className="span-2">Medical conditions<input placeholder="Anything your coach should keep in mind" value={form.medical_conditions} onChange={e => change("medical_conditions", e.target.value)} /></label>
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            <div className="form-actions">
              {!isNew && <button type="button" className="ghost-btn" onClick={cancelEdit}>Cancel</button>}
              <button className="primary-btn" type="submit" disabled={saving}>{saving ? "Saving…" : isNew ? "Create profile" : "Save changes"}</button>
            </div>
          </form>
        )}

        {loaded && !editing && !isNew && profile && (
          <div className="profile-grid">
            <section className="panel">
              <div className="panel-head"><div><h3>Personal details</h3></div></div>
              <dl className="info-list">
                <Row label="Name">{profile.name}</Row>
                <Row label="Age">{profile.age} years</Row>
                <Row label="Sex">{SEX[profile.sex || ""] || profile.sex}</Row>
                <Row label="Height">{profile.height_cm} cm</Row>
                <Row label="Current weight">{profile.current_weight_kg} kg</Row>
                <Row label="Target weight">{profile.target_weight_kg} kg</Row>
                {bmi !== null && <Row label="BMI">{bmi}</Row>}
                {since && <Row label="Member since">{since}</Row>}
              </dl>
            </section>

            <section className="panel">
              <div className="panel-head"><div><h3>Goal and lifestyle</h3></div></div>
              <dl className="info-list">
                <Row label="Goal">{GOALS[profile.goal || ""] || profile.goal}</Row>
                <Row label="Activity level">{ACTIVITY[profile.activity_level || ""] || profile.activity_level}</Row>
                <Row label="Diet">{DIETS[profile.diet || ""] || profile.diet}</Row>
                <Row label="Sleep schedule">{profile.sleep_schedule || none}</Row>
              </dl>
            </section>

            <section className="panel">
              <div className="panel-head"><div><h3>Daily targets</h3><p>Calculated from your details</p></div></div>
              <dl className="info-list">
                <Row label="Calories">{profile.target_calories} kcal</Row>
                <Row label="Protein">{profile.target_protein_g} g</Row>
                <Row label="Carbs">{profile.target_carbs_g} g</Row>
                <Row label="Fat">{profile.target_fat_g} g</Row>
                <Row label="Water">{profile.target_water_l} L</Row>
                <Row label="Resting energy (BMR)">{profile.bmr_kcal} kcal</Row>
                <Row label="Daily energy use (TDEE)">{profile.tdee_kcal} kcal</Row>
              </dl>
            </section>

            <section className="panel">
              <div className="panel-head"><div><h3>Health notes</h3><p>Shared with your coach</p></div></div>
              <dl className="info-list">
                <Row label="Allergies">{profile.allergies || none}</Row>
                <Row label="Medical conditions">{profile.medical_conditions || none}</Row>
              </dl>
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}