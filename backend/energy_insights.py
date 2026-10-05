"""Energy-balance maths for the Health page.

Plain Python, NOT an LLM (same rule as math_engine.py): every number the user sees is
computed here from their real logs -- calories eaten (daily_logs), calories burned
(Google Fit via daily_fitness), water, profile -- and the page only displays it.

Key facts the maths relies on
  * Google Fit's `calories.expended` is TOTAL daily expenditure (resting + activity),
    so balance = eaten - Fit burn, with no extra BMR added. If a device only reports
    active calories (burn well below BMR on a finished day) we add BMR back and say so.
  * ~7,700 kcal of surplus/deficit ~ 1 kg of body fat (standard rule of thumb).
  * Net walking cost ~ 0.55 kcal per kg per km (ACSM-style estimate); stride ~ 0.415 x height.
"""
import logging
import sqlite3
from datetime import datetime, timedelta
from statistics import median

try:
    from backend.database import get_db_connection
except ImportError:
    from database import get_db_connection

logger = logging.getLogger("nutrisync.energy")

KCAL_PER_KG_FAT = 7700
WALK_NET_KCAL_PER_KG_KM = 0.55
STEP_GOAL = 10000


def _conn():
    conn = get_db_connection(None)
    conn.row_factory = sqlite3.Row
    return conn


def _avg(values):
    values = [v for v in values if v is not None]
    return sum(values) / len(values) if values else 0.0


def _bmr(profile: dict) -> tuple[float, int]:
    const = 5 if str(profile.get("sex", "")).lower() in ("male", "m") else -161
    stored = profile.get("bmr_kcal")
    if stored:
        return float(stored), const
    return (10 * profile["current_weight_kg"] + 6.25 * profile["height_cm"]
            - 5 * profile["age"] + const), const


def build_insights(days: int = 14) -> dict:
    days = max(3, min(int(days or 14), 30))
    today = datetime.now().date()
    today_s = today.isoformat()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]

    conn = _conn()
    try:
        prof = conn.execute("SELECT * FROM user_profile WHERE id = 1").fetchone()
        if prof is None:
            return {"status": "not_onboarded"}
        profile = dict(prof)

        intake = {
            r["log_date"]: dict(r)
            for r in conn.execute(
                """SELECT log_date, SUM(calories) cal, SUM(protein_g) pro, SUM(carbs_g) carb,
                          SUM(fat_g) fat, COUNT(*) meals
                   FROM daily_logs WHERE log_date >= ? GROUP BY log_date""",
                (dates[0],),
            )
        }
        fit = {
            r["log_date"]: dict(r)
            for r in conn.execute(
                "SELECT log_date, steps, calories_burned FROM daily_fitness WHERE log_date >= ?",
                (dates[0],),
            )
        }
        try:
            water = {
                r["log_date"]: r["l"]
                for r in conn.execute(
                    "SELECT log_date, SUM(amount_l) l FROM water_logs WHERE log_date >= ? GROUP BY log_date",
                    (dates[0],),
                )
            }
        except Exception:
            water = {}
    finally:
        conn.close()

    weight = float(profile.get("current_weight_kg") or 0)
    target_w = float(profile.get("target_weight_kg") or weight)
    height = float(profile.get("height_cm") or 0)
    bmr, sex_const = _bmr(profile)
    tdee = float(profile.get("tdee_kcal") or 0) or bmr * 1.375
    goal = (profile.get("goal") or "maintenance").lower()

    # ---- per-day rows --------------------------------------------------------------
    rows = []
    for d in dates:
        i, f = intake.get(d), fit.get(d)
        eaten = round(i["cal"] or 0) if i else 0
        steps = int(f["steps"] or 0) if f else 0
        burn = round(f["calories_burned"] or 0) if f else 0
        has_food, has_fit = eaten > 0, (steps > 0 or burn > 0)
        adjusted = False
        if has_fit and d != today_s and burn < 0.7 * bmr:
            burn, adjusted = round(burn + bmr), True  # device reported active-only calories
        rows.append({
            "date": d, "is_today": d == today_s,
            "eaten": eaten, "burned": burn, "steps": steps,
            "protein_g": round(i["pro"] or 0, 1) if i else 0,
            "carbs_g": round(i["carb"] or 0, 1) if i else 0,
            "fat_g": round(i["fat"] or 0, 1) if i else 0,
            "meals": int(i["meals"]) if i else 0,
            "water_l": round(water.get(d, 0) or 0, 2),
            "has_food": has_food, "has_fit": has_fit, "burn_adjusted": adjusted,
            "balance": (eaten - burn) if (has_food and has_fit) else None,
        })

    complete = [r for r in rows if r["balance"] is not None and not r["is_today"]]
    basis = complete or [r for r in rows if r["balance"] is not None]
    n = len(basis)
    confidence = "high" if len(complete) >= 7 else "medium" if len(complete) >= 3 else "low"

    avg_eaten = _avg([r["eaten"] for r in basis])
    avg_burn = _avg([r["burned"] for r in basis])
    avg_balance = avg_eaten - avg_burn
    weekly_kg = avg_balance * 7 / KCAL_PER_KG_FAT  # negative = losing
    remaining_kg = weight - target_w                # positive = needs to lose
    eta_weeks = None
    if weekly_kg < -0.02 and remaining_kg > 0.1:
        eta_weeks = remaining_kg / -weekly_kg
    elif weekly_kg > 0.02 and remaining_kg < -0.1:
        eta_weeks = -remaining_kg / weekly_kg

    avg_pro = _avg([r["protein_g"] for r in basis])
    avg_carb = _avg([r["carbs_g"] for r in basis])
    avg_fat = _avg([r["fat_g"] for r in basis])
    macro_kcal = {"protein": avg_pro * 4, "carbs": avg_carb * 4, "fat": avg_fat * 9}
    macro_total = sum(macro_kcal.values()) or 1
    macro_pct = {k: round(v / macro_total * 100) for k, v in macro_kcal.items()}

    fit_days = [r for r in rows if r["has_fit"] and not r["is_today"]]
    avg_steps = _avg([r["steps"] for r in fit_days])
    goal_days = sum(1 for r in fit_days if r["steps"] >= STEP_GOAL)
    water_days = [r["water_l"] for r in rows if r["water_l"] > 0 and not r["is_today"]]
    avg_water = _avg(water_days)
    target_water = float(profile.get("target_water_l") or 0)
    measured_burn = _avg([r["burned"] for r in fit_days]) if fit_days else 0.0
    activity_factor_used = round(tdee / bmr, 3) if bmr else None
    activity_factor_real = round(measured_burn / bmr, 2) if bmr and measured_burn else None

    stride_m = round(0.415 * height / 100, 3) if height else 0.7
    kcal_per_km = WALK_NET_KCAL_PER_KG_KM * weight
    walk = {
        "stride_m": stride_m,
        "kcal_per_km": round(kcal_per_km, 1),
        "kcal_per_step": round(kcal_per_km * stride_m / 1000, 4),
        "steps_per_km": round(1000 / stride_m) if stride_m else 1400,
    }

    # ---- plain-language insights (rule based, every one cites its numbers) -----------
    ins = []
    if n:
        if abs(avg_balance) < 100:
            ins.append({"tone": "info", "title": "You are eating about what you burn",
                        "body": f"Over {n} complete day{'s' if n != 1 else ''} you averaged {round(avg_eaten):,} kcal in and "
                                f"{round(avg_burn):,} kcal out, a gap of only {abs(round(avg_balance))} kcal. "
                                "Weight should stay roughly flat at this pace."})
        else:
            word, kind = ("deficit", "lose") if avg_balance < 0 else ("surplus", "gain")
            ins.append({"tone": "info", "title": f"Average {word}: {abs(round(avg_balance))} kcal a day",
                        "body": f"{round(avg_eaten):,} eaten minus {round(avg_burn):,} burned. "
                                f"At that pace you would {kind} about {abs(weekly_kg):.2f} kg a week."})
        pace_pct = abs(weekly_kg) / weight * 100 if weight else 0
        if goal == "fat_loss" and avg_balance > 50:
            ins.append({"tone": "warn", "title": "Goal is fat loss, but you are in a surplus",
                        "body": f"You are averaging {round(avg_balance)} kcal over what you burn. "
                                f"Trimming about {round(avg_balance + 400):,} kcal a day would put you on a steady ~0.4 kg/week loss."})
        elif goal == "muscle_gain" and avg_balance < -50:
            ins.append({"tone": "warn", "title": "Goal is muscle gain, but you are in a deficit",
                        "body": f"You are {abs(round(avg_balance))} kcal under what you burn. Muscle needs a small surplus; "
                                f"aim for roughly {round(avg_burn * 1.1):,} kcal a day."})
        elif goal == "fat_loss" and 0.25 <= abs(weekly_kg) <= 0.9 and avg_balance < 0:
            ins.append({"tone": "good", "title": "Your fat-loss pace is in the sustainable zone",
                        "body": f"{abs(weekly_kg):.2f} kg a week ({pace_pct:.1f}% of body weight) is fast enough to see results "
                                "and gentle enough to protect muscle."})
        if pace_pct > 1.0 and avg_balance < 0:
            ins.append({"tone": "warn", "title": "That deficit is steeper than recommended",
                        "body": f"Losing more than ~1% of body weight a week ({pace_pct:.1f}% here) tends to cost muscle and energy."})
        if avg_eaten and avg_eaten < bmr * 0.95:
            ins.append({"tone": "warn", "title": "You are eating below your resting needs",
                        "body": f"Average intake {round(avg_eaten):,} kcal is under your BMR of {round(bmr):,} kcal, "
                                "the energy your body needs even lying still. Move intake up before adding more exercise."})
    tp = float(profile.get("target_protein_g") or 0)
    if avg_pro and weight:
        per_kg = avg_pro / weight
        tgt_kg = tp / weight if tp else 1.6
        if per_kg < tgt_kg * 0.8:
            ins.append({"tone": "warn", "title": "Protein is running low",
                        "body": f"{avg_pro:.0f} g a day is {per_kg:.2f} g per kg; your target is {tgt_kg:.2f} g per kg ({tp:.0f} g)."})
        else:
            ins.append({"tone": "good", "title": "Protein is on track",
                        "body": f"{avg_pro:.0f} g a day = {per_kg:.2f} g per kg body weight (target {tgt_kg:.2f})."})
    if activity_factor_real and activity_factor_used and measured_burn and abs(measured_burn - tdee) / tdee > 0.1:
        ins.append({"tone": "info", "title": "Your real burn differs from the formula",
                    "body": f"Google Fit shows ~{round(measured_burn):,} kcal a day, the profile formula predicts {round(tdee):,}. "
                            f"Your measured activity factor is {activity_factor_real} instead of {activity_factor_used}."})
    if fit_days:
        ins.append({"tone": "good" if goal_days else "info", "title": f"10,000 steps reached on {goal_days} of {len(fit_days)} days",
                    "body": f"Your daily average is {round(avg_steps):,} steps, about {avg_steps * stride_m / 1000:.1f} km at your {stride_m:.2f} m stride."})
    if target_water and water_days:
        if avg_water < target_water * 0.8:
            ins.append({"tone": "warn", "title": "Water is below target",
                        "body": f"You average {avg_water:.1f} L against a {target_water:.1f} L target."})
        else:
            ins.append({"tone": "good", "title": "Hydration is on track",
                        "body": f"You average {avg_water:.1f} L against a {target_water:.1f} L target."})
    if len(complete) < 3:
        ins.append({"tone": "info", "title": "Numbers get sharper with more days",
                    "body": f"Only {len(complete)} finished day{'s' if len(complete) != 1 else ''} have both food and Google Fit data. "
                            "Log meals and sync for about a week for trustworthy averages."})

    return {
        "status": "ok",
        "days": days,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "rows": rows,
        "profile": {
            "name": profile.get("name"), "age": profile.get("age"), "sex": profile.get("sex"),
            "height_cm": height, "weight_kg": weight, "target_weight_kg": target_w,
            "goal": goal, "activity_level": profile.get("activity_level"),
            "target_calories": profile.get("target_calories"),
            "target_protein_g": profile.get("target_protein_g"),
            "target_carbs_g": profile.get("target_carbs_g"),
            "target_fat_g": profile.get("target_fat_g"),
            "target_water_l": target_water,
        },
        "math": {
            "bmr": round(bmr), "sex_const": sex_const, "tdee": round(tdee),
            "activity_factor_used": activity_factor_used, "activity_factor_real": activity_factor_real,
            "measured_burn": round(measured_burn),
            "days_used": n, "complete_days": len(complete), "confidence": confidence,
            "avg_eaten": round(avg_eaten), "avg_burned": round(avg_burn), "avg_balance": round(avg_balance),
            "weekly_kg": round(weekly_kg, 2), "kcal_per_kg_fat": KCAL_PER_KG_FAT,
            "remaining_kg": round(remaining_kg, 1), "eta_weeks": round(eta_weeks, 1) if eta_weeks else None,
            "avg_protein_g": round(avg_pro, 1), "protein_per_kg": round(avg_pro / weight, 2) if weight else 0,
            "macro_pct": macro_pct, "avg_steps": round(avg_steps), "step_goal_days": goal_days,
            "fit_days": len(fit_days), "avg_water_l": round(avg_water, 2),
        },
        "walk": walk,
        "insights": ins[:8],
    }
