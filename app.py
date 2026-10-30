"""Fit Log - Flask + MySQL (XAMPP) backend.

Takbo:
    1. Buksan ang XAMPP Control Panel at i-start ang MySQL.
    2. pip install -r requirements.txt
    3. python app.py   ->   http://localhost:5000
"""
import os
import re
from datetime import date, datetime, timedelta
from decimal import Decimal
from functools import wraps

import mysql.connector
from flask import Flask, abort, jsonify, redirect, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

# ---------------------------------------------------------------- config ---
# Default ng XAMPP: user "root", walang password. Palitan gamit environment variables kung kailangan.
DB_CONFIG = dict(
    host=os.getenv("DB_HOST", "localhost"),
    port=int(os.getenv("DB_PORT", "3306")),
    user=os.getenv("DB_USER", "root"),
    password=os.getenv("DB_PASSWORD", ""),
)
DB_NAME = "fitlog"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "palitan-mo-ito-sa-production")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)

PAGES = {"dashboard", "activities", "duration", "calories", "daily-log", "progress", "reports", "calculator"}
CATEGORIES = ["Cardio", "Strength", "Flexibility", "Sports", "Walking/Running", "Other"]
MOODS = ["Great", "Good", "Okay", "Tired", "Bad"]
ACTIVITY_FACTORS = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725, "very_active": 1.9}
GOAL_ADJUST = {"lose": -500, "maintain": 0, "gain": 500}
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# -------------------------------------------------------------- database ---
def get_conn():
    return mysql.connector.connect(database=DB_NAME, **DB_CONFIG)


def init_db():
    """Gawin ang database at mga table kung wala pa (galing sa schema.sql)."""
    with open(os.path.join(BASE_DIR, "schema.sql"), encoding="utf-8") as f:
        sql = f.read()
    sql = re.sub(r"--[^\n]*", "", sql)  # tanggalin ang mga comment
    conn = mysql.connector.connect(**DB_CONFIG)
    try:
        cur = conn.cursor()
        for stmt in (s.strip() for s in sql.split(";")):
            if stmt:
                cur.execute(stmt)
        conn.commit()
    finally:
        conn.close()


def clean(value):
    """Gawing JSON-friendly ang date/Decimal galing sa MySQL."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def query(sql, args=(), one=False):
    conn = get_conn()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(sql, args)
        rows = [{k: clean(v) for k, v in r.items()} for r in cur.fetchall()]
        if one:
            return rows[0] if rows else None
        return rows
    finally:
        conn.close()


def execute(sql, args=()):
    """Returns (lastrowid, rowcount)."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(sql, args)
        conn.commit()
        return cur.lastrowid, cur.rowcount
    finally:
        conn.close()


# --------------------------------------------------------------- helpers ---
class ValidationError(Exception):
    pass


@app.errorhandler(ValidationError)
def handle_validation(err):
    return jsonify(error=str(err)), 400


@app.errorhandler(mysql.connector.Error)
def handle_db_error(err):
    app.logger.exception("Database error")
    return jsonify(error="Database error. Naka-start ba ang MySQL sa XAMPP?"), 500


def body():
    return request.get_json(silent=True) or {}


def need_text(data, key, label, max_len):
    val = str(data.get(key) or "").strip()
    if not val:
        raise ValidationError(f"{label} is required.")
    if len(val) > max_len:
        raise ValidationError(f"{label} is too long (max {max_len} characters).")
    return val


def opt_text(data, key, label, max_len):
    val = str(data.get(key) or "").strip()
    if len(val) > max_len:
        raise ValidationError(f"{label} is too long (max {max_len} characters).")
    return val or None


def number(data, key, label, lo, hi, integer=False, required=True, default=None):
    raw = data.get(key)
    if raw is None or raw == "":
        if required:
            raise ValidationError(f"{label} is required.")
        return default
    try:
        val = float(raw)
    except (TypeError, ValueError):
        raise ValidationError(f"{label} must be a number.")
    if val != val or val < lo or val > hi:
        raise ValidationError(f"{label} must be between {lo} and {hi}.")
    return int(round(val)) if integer else val


def parse_date(data, key="date", label="Date", default_today=True):
    raw = data.get(key)
    if not raw:
        if default_today:
            return date.today()
        raise ValidationError(f"{label} is required.")
    try:
        return datetime.strptime(str(raw), "%Y-%m-%d").date()
    except ValueError:
        raise ValidationError(f"{label} is invalid.")


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify(error="Not logged in."), 401
        return fn(*args, **kwargs)

    return wrapper


@app.after_request
def no_cache(resp):
    # Para hindi lumabas ang lumang page kapag pinindot ang Back pagkatapos mag-logout.
    if resp.mimetype in ("text/html", "application/json"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


# ----------------------------------------------------------------- pages ---
@app.route("/")
@app.route("/index.html")
def index():
    if "user_id" in session:
        return redirect("/dashboard.html")
    return render_template("index.html")


@app.route("/<name>.html")
def page(name):
    if name not in PAGES:
        abort(404)
    if "user_id" not in session:
        return redirect("/index.html")
    return render_template(f"{name}.html")


# ------------------------------------------------------------------ auth ---
@app.post("/api/register")
def register():
    data = body()
    name = need_text(data, "name", "Full name", 100)
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    if not EMAIL_RE.match(email) or len(email) > 150:
        raise ValidationError("Invalid email format.")
    if len(password) < 6:
        raise ValidationError("Password must be at least 6 characters.")
    if query("SELECT id FROM users WHERE email = %s", (email,), one=True):
        raise ValidationError("An account with this email already exists.")
    execute(
        "INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
        (name, email, generate_password_hash(password)),
    )
    return jsonify(ok=True, email=email), 201


@app.post("/api/login")
def login():
    data = body()
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    if not EMAIL_RE.match(email) or not password:
        raise ValidationError("Please enter your email and password.")
    user = query("SELECT id, name, email, password_hash FROM users WHERE email = %s", (email,), one=True)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Incorrect email or password."), 401
    session.clear()
    session["user_id"] = user["id"]
    session.permanent = bool(data.get("remember"))
    return jsonify(ok=True, name=user["name"])


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
@login_required
def me():
    user = query("SELECT id, name, email FROM users WHERE id = %s", (session["user_id"],), one=True)
    if not user:
        session.clear()
        return jsonify(error="Not logged in."), 401
    return jsonify(user)


# -------------------------------------------------------------- workouts ---
def workout_fields(data, partial=False):
    """Kunin at i-validate ang mga field ng workout. Kapag partial, ang mga ipinadala lang."""
    out = {}
    if not partial or "activity_date" in data:
        out["activity_date"] = parse_date(data, "activity_date", "Date")
    if not partial or "exercise_name" in data:
        out["exercise_name"] = need_text(data, "exercise_name", "Exercise name", 100)
    if not partial or "category" in data:
        cat = str(data.get("category") or "Other")
        if cat not in CATEGORIES:
            raise ValidationError("Invalid exercise type.")
        out["category"] = cat
    if not partial or "duration_min" in data:
        out["duration_min"] = number(data, "duration_min", "Duration", 1, 1440, integer=True)
    if not partial or "calories_burned" in data:
        out["calories_burned"] = number(data, "calories_burned", "Calories burned", 0, 20000, integer=True, required=False, default=0)
    if not partial or "notes" in data:
        out["notes"] = opt_text(data, "notes", "Notes", 255)
    return out


@app.get("/api/workouts")
@login_required
def list_workouts():
    rows = query(
        "SELECT id, activity_date, exercise_name, category, duration_min, calories_burned, notes "
        "FROM workouts WHERE user_id = %s ORDER BY activity_date DESC, id DESC LIMIT 500",
        (session["user_id"],),
    )
    return jsonify(rows)


@app.post("/api/workouts")
@login_required
def add_workout():
    f = workout_fields(body())
    new_id, _ = execute(
        "INSERT INTO workouts (user_id, activity_date, exercise_name, category, duration_min, calories_burned, notes) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (session["user_id"], f["activity_date"], f["exercise_name"], f["category"], f["duration_min"], f["calories_burned"], f["notes"]),
    )
    return jsonify(id=new_id), 201


@app.patch("/api/workouts/<int:wid>")
@login_required
def update_workout(wid):
    f = workout_fields(body(), partial=True)
    if not f:
        raise ValidationError("Nothing to update.")
    sets = ", ".join(f"{col} = %s" for col in f)  # ang mga column name ay galing sa whitelist sa itaas
    _, count = execute(f"UPDATE workouts SET {sets} WHERE id = %s AND user_id = %s", (*f.values(), wid, session["user_id"]))
    if not count and not query("SELECT id FROM workouts WHERE id = %s AND user_id = %s", (wid, session["user_id"]), one=True):
        return jsonify(error="Record not found."), 404
    return jsonify(ok=True)


@app.delete("/api/workouts/<int:wid>")
@login_required
def delete_workout(wid):
    _, count = execute("DELETE FROM workouts WHERE id = %s AND user_id = %s", (wid, session["user_id"]))
    if not count:
        return jsonify(error="Record not found."), 404
    return jsonify(ok=True)


# ------------------------------------------------------------ daily logs ---
@app.get("/api/daily-logs")
@login_required
def list_daily_logs():
    rows = query(
        "SELECT id, log_date, weight_kg, water_glasses, sleep_hours, mood, notes "
        "FROM daily_logs WHERE user_id = %s ORDER BY log_date DESC LIMIT 366",
        (session["user_id"],),
    )
    return jsonify(rows)


@app.post("/api/daily-logs")
@login_required
def save_daily_log():
    """Isang log kada araw: kapag may entry na sa petsa, ina-update ito."""
    data = body()
    log_date = parse_date(data, "log_date", "Date")
    weight = number(data, "weight_kg", "Weight", 20, 500, required=False)
    water = number(data, "water_glasses", "Water", 0, 50, integer=True, required=False)
    sleep = number(data, "sleep_hours", "Sleep", 0, 24, required=False)
    mood = str(data.get("mood") or "")
    if mood and mood not in MOODS:
        raise ValidationError("Invalid mood.")
    notes = opt_text(data, "notes", "Notes", 255)
    if weight is None and water is None and sleep is None and not mood and not notes:
        raise ValidationError("Fill in at least one field.")
    execute(
        "INSERT INTO daily_logs (user_id, log_date, weight_kg, water_glasses, sleep_hours, mood, notes) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s) "
        "ON DUPLICATE KEY UPDATE weight_kg = VALUES(weight_kg), water_glasses = VALUES(water_glasses), "
        "sleep_hours = VALUES(sleep_hours), mood = VALUES(mood), notes = VALUES(notes)",
        (session["user_id"], log_date, weight, water, sleep, mood or None, notes),
    )
    return jsonify(ok=True), 201


@app.delete("/api/daily-logs/<int:lid>")
@login_required
def delete_daily_log(lid):
    _, count = execute("DELETE FROM daily_logs WHERE id = %s AND user_id = %s", (lid, session["user_id"]))
    if not count:
        return jsonify(error="Record not found."), 404
    return jsonify(ok=True)


# --------------------------------------------------------------- reports ---
def build_report(user_id, period):
    if period == "monthly":
        key = "DATE_FORMAT(activity_date, '%%Y-%%m')"
        limit = 12
    else:
        key = "YEARWEEK(activity_date, 1)"  # linggo na nagsisimula sa Lunes
        limit = 12
    rows = query(
        f"SELECT {key} AS k, MIN(activity_date) AS first_day, COUNT(*) AS workouts, "
        "SUM(duration_min) AS minutes, SUM(calories_burned) AS calories "
        f"FROM workouts WHERE user_id = %s GROUP BY k ORDER BY k DESC LIMIT {limit}",
        (user_id,),
    )
    out = []
    for r in rows:
        first = datetime.strptime(r["first_day"], "%Y-%m-%d").date()
        if period == "monthly":
            label = first.strftime("%B %Y")
        else:
            monday = first - timedelta(days=first.weekday())
            sunday = monday + timedelta(days=6)
            label = f"{monday.strftime('%b %d')} - {sunday.strftime('%b %d, %Y')}"
        out.append(
            dict(
                label=label,
                workouts=int(r["workouts"]),
                minutes=int(r["minutes"] or 0),
                calories=int(r["calories"] or 0),
            )
        )
    return out


@app.get("/api/reports")
@login_required
def reports():
    period = "monthly" if request.args.get("period") == "monthly" else "weekly"
    return jsonify(period=period, rows=build_report(session["user_id"], period))


# -------------------------------------------------------------- progress ---
@app.get("/api/progress")
@login_required
def progress():
    uid = session["user_id"]
    weights = query(
        "SELECT log_date, weight_kg FROM daily_logs WHERE user_id = %s AND weight_kg IS NOT NULL "
        "ORDER BY log_date ASC LIMIT 366",
        (uid,),
    )
    weekly = list(reversed(build_report(uid, "weekly")))[-8:]
    return jsonify(weights=weights, weekly=weekly)


# ------------------------------------------------------------- dashboard ---
@app.get("/api/dashboard")
@login_required
def dashboard():
    uid = session["user_id"]
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    day = query(
        "SELECT COUNT(*) AS workouts, COALESCE(SUM(duration_min), 0) AS minutes, COALESCE(SUM(calories_burned), 0) AS calories "
        "FROM workouts WHERE user_id = %s AND activity_date = %s",
        (uid, today),
        one=True,
    )
    week = query(
        "SELECT COUNT(*) AS workouts FROM workouts WHERE user_id = %s AND activity_date BETWEEN %s AND %s",
        (uid, monday, today),
        one=True,
    )
    recent = query(
        "SELECT id, activity_date, exercise_name, category, duration_min, calories_burned "
        "FROM workouts WHERE user_id = %s ORDER BY activity_date DESC, id DESC LIMIT 5",
        (uid,),
    )
    return jsonify(
        workouts_today=int(day["workouts"]),
        minutes_today=int(day["minutes"]),
        calories_today=int(day["calories"]),
        workouts_week=int(week["workouts"]),
        recent=recent,
    )


# ------------------------------------------------------------ calculator ---
@app.get("/api/calculator")
@login_required
def calc_history():
    rows = query(
        "SELECT id, sex, age, height_cm, weight_kg, activity_level, goal, bmr, tdee, target_kcal, met, minutes, burn_kcal, created_at "
        "FROM calculations WHERE user_id = %s ORDER BY id DESC LIMIT 20",
        (session["user_id"],),
    )
    return jsonify(rows)


@app.post("/api/calculator")
@login_required
def calc_run():
    data = body()
    sex = str(data.get("sex") or "")
    if sex not in ("male", "female"):
        raise ValidationError("Please choose your sex.")
    age = number(data, "age", "Age", 10, 100, integer=True)
    height = number(data, "height_cm", "Height", 100, 250)
    weight = number(data, "weight_kg", "Weight", 25, 400)
    level = str(data.get("activity_level") or "")
    goal = str(data.get("goal") or "")
    if level not in ACTIVITY_FACTORS:
        raise ValidationError("Please choose your activity level.")
    if goal not in GOAL_ADJUST:
        raise ValidationError("Please choose your goal.")
    met = number(data, "met", "MET", 1, 20, required=False)
    minutes = number(data, "minutes", "Minutes", 1, 1440, integer=True, required=False)
    if (met is None) != (minutes is None):
        raise ValidationError("Choose both an activity and the minutes to estimate calories burned.")

    # Mifflin-St Jeor
    bmr = 10 * weight + 6.25 * height - 5 * age + (5 if sex == "male" else -161)
    tdee = bmr * ACTIVITY_FACTORS[level]
    target = max(1200, tdee + GOAL_ADJUST[goal])
    burn = round(met * weight * minutes / 60) if met is not None else None

    result = dict(bmr=round(bmr), tdee=round(tdee), target_kcal=round(target), burn_kcal=burn)
    execute(
        "INSERT INTO calculations (user_id, sex, age, height_cm, weight_kg, activity_level, goal, bmr, tdee, target_kcal, met, minutes, burn_kcal) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (session["user_id"], sex, age, height, weight, level, goal, result["bmr"], result["tdee"], result["target_kcal"], met, minutes, burn),
    )
    return jsonify(result), 201


@app.delete("/api/calculator/<int:cid>")
@login_required
def calc_delete(cid):
    _, count = execute("DELETE FROM calculations WHERE id = %s AND user_id = %s", (cid, session["user_id"]))
    if not count:
        return jsonify(error="Record not found."), 404
    return jsonify(ok=True)


if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
