// Fit Log front end: shared shell (navbar, sidebar, session check) + one renderer per page.
// All data comes from the Flask API (/api/...). Login state lives in the server session cookie.
(function () {
  "use strict";

  const NAV = [
    { href: "/dashboard.html",  page: "dashboard",  icon: "🏠", label: "Dashboard" },
    { href: "/activities.html", page: "activities", icon: "🏃", label: "Exercise/Activity Records" },
    { href: "/duration.html",   page: "duration",   icon: "⏱️", label: "Workout Duration Tracking" },
    { href: "/calories.html",   page: "calories",   icon: "🔥", label: "Calories Burned Records" },
    { href: "/daily-log.html",  page: "daily-log",  icon: "📅", label: "Daily Fitness Logs" },
    { href: "/progress.html",   page: "progress",   icon: "📈", label: "Progress Tracking" },
    { href: "/reports.html",    page: "reports",    icon: "📊", label: "Weekly/Monthly Reports" },
    { href: "/calculator.html", page: "calculator", icon: "🧮", label: "Calories Calculator" }
  ];
  const CATEGORIES = ["Cardio", "Strength", "Flexibility", "Sports", "Walking/Running", "Other"];
  const MOODS = ["Great", "Good", "Okay", "Tired", "Bad"];
  const ACTIVITY_LEVELS = [
    ["sedentary", "Sedentary (little or no exercise)"],
    ["light", "Light (1-3 days/week)"],
    ["moderate", "Moderate (3-5 days/week)"],
    ["active", "Active (6-7 days/week)"],
    ["very_active", "Very active (hard exercise daily)"]
  ];
  const GOALS = [["lose", "Lose weight (-500 kcal)"], ["maintain", "Maintain weight"], ["gain", "Gain weight (+500 kcal)"]];
  const MET_ACTIVITIES = [
    ["2.5", "Yoga"], ["3.5", "Walking (brisk)"], ["5", "Weight training"], ["5", "Dancing"],
    ["6", "Swimming"], ["6.5", "Basketball"], ["7", "Jogging"], ["7.5", "Cycling"],
    ["8", "HIIT / circuit training"], ["9.8", "Running"]
  ];

  // ------------------------------------------------------------ helpers ---
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = n => Number(n || 0).toLocaleString("en-US");
  const pad = n => String(n).padStart(2, "0");
  const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const fmtDate = iso => {
    const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
    return isNaN(d) ? String(iso) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const fmtMin = m => (m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + " min");
  const options = (items, selected) => items.map(it => {
    const [v, l] = Array.isArray(it) ? it : [it, it];
    return '<option value="' + esc(v) + '"' + (v === selected ? " selected" : "") + ">" + esc(l) + "</option>";
  }).join("");

  async function api(url, opts) {
    opts = opts || {};
    const init = { method: opts.method || "GET", credentials: "same-origin", headers: {} };
    if (opts.body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(opts.body); }
    let res;
    try { res = await fetch(url, init); }
    catch { throw new Error("Cannot reach the server. Is app.py running?"); }
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (res.status === 401) { location.replace("/index.html"); throw new Error("Not logged in."); }
    if (!res.ok) throw new Error((data && data.error) || "Something went wrong (" + res.status + ").");
    return data;
  }

  let toastTimer;
  function toast(text, type) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    el.textContent = text;
    el.className = "toast show " + (type || "ok");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "toast"; }, 3200);
  }
  const fail = e => toast(e.message || String(e), "error");

  const head = (title, sub) => '<h1 class="page-title">' + esc(title) + '</h1><p class="page-sub">' + esc(sub) + "</p>";
  const emptyBox = (icon, title, text) =>
    '<div class="empty-inline"><div class="icon">' + icon + "</div><h3>" + esc(title) + "</h3><p>" + esc(text) + "</p></div>";
  const stat = (label, value, unit) =>
    '<div class="stat"><div class="label">' + label + '</div><div class="value">' + value +
    (unit ? ' <span class="unit">' + unit + "</span>" : "") + "</div></div>";

  // ---------------------------------------------------------- dashboard ---
  async function dashboard(main) {
    main.innerHTML = head("Dashboard", "Your fitness summary for today.") + '<div class="stats" id="stats"></div>' +
      '<section class="card"><div class="card-head"><h2>Recent workouts</h2><a class="btn small" href="/activities.html">+ Add workout</a></div><div id="recent"></div></section>';
    const d = await api("/api/dashboard");
    $("#stats").innerHTML =
      stat("🏃 Workouts Today", fmt(d.workouts_today)) +
      stat("⏱️ Duration", fmt(d.minutes_today), "min") +
      stat("🔥 Calories Burned", fmt(d.calories_today), "kcal") +
      stat("📊 Workouts This Week", fmt(d.workouts_week));
    $("#recent").innerHTML = d.recent.length
      ? '<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Exercise</th><th>Type</th><th class="num">Duration</th><th class="num">Calories</th></tr></thead><tbody>' +
        d.recent.map(r => "<tr><td>" + fmtDate(r.activity_date) + "</td><td>" + esc(r.exercise_name) + "</td><td>" + esc(r.category) +
          '</td><td class="num">' + fmtMin(r.duration_min) + '</td><td class="num">' + fmt(r.calories_burned) + " kcal</td></tr>").join("") +
        "</tbody></table></div>"
      : emptyBox("📭", "No activity logs yet", "Start logging a workout to see your progress here.");
  }

  // --------------------------------------------------------- activities ---
  async function activities(main) {
    main.innerHTML = head("Exercise/Activity Records", "Record your exercises and activities.") +
      '<section class="card"><h2 id="formTitle">Add a workout</h2>' +
      '<form id="wForm" class="form-grid" novalidate>' +
      '<div class="field"><label for="wDate">Date</label><input id="wDate" type="date" required></div>' +
      '<div class="field"><label for="wName">Exercise</label><input id="wName" maxlength="100" placeholder="e.g. Morning run" required></div>' +
      '<div class="field"><label for="wCat">Type</label><select id="wCat">' + options(CATEGORIES, "Cardio") + "</select></div>" +
      '<div class="field"><label for="wDur">Duration (minutes)</label><input id="wDur" type="number" min="1" max="1440" required></div>' +
      '<div class="field"><label for="wCal">Calories burned (kcal)</label><input id="wCal" type="number" min="0" max="20000" placeholder="optional"></div>' +
      '<div class="field wide"><label for="wNotes">Notes</label><input id="wNotes" maxlength="255" placeholder="optional"></div>' +
      '<div class="actions"><button class="btn" type="submit" id="wSave">Add workout</button>' +
      '<button class="btn secondary" type="button" id="wCancel" hidden>Cancel</button></div></form></section>' +
      '<section class="card"><div class="card-head"><h2>Your workouts</h2></div><div id="wTable"></div></section>';

    let rows = [], editId = null;
    const form = $("#wForm");
    const reset = () => {
      editId = null; form.reset();
      $("#wDate").value = todayStr();
      $("#formTitle").textContent = "Add a workout"; $("#wSave").textContent = "Add workout"; $("#wCancel").hidden = true;
    };
    const draw = () => {
      $("#wTable").innerHTML = rows.length
        ? '<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Exercise</th><th>Type</th><th class="num">Duration</th><th class="num">Calories</th><th>Notes</th><th></th></tr></thead><tbody>' +
          rows.map(r => "<tr><td>" + fmtDate(r.activity_date) + "</td><td>" + esc(r.exercise_name) + "</td><td>" + esc(r.category) +
            '</td><td class="num">' + fmtMin(r.duration_min) + '</td><td class="num">' + fmt(r.calories_burned) + "</td><td>" + esc(r.notes || "") +
            '</td><td class="row-actions"><button class="btn small secondary" data-edit="' + r.id + '">Edit</button> ' +
            '<button class="btn small danger" data-del="' + r.id + '">Delete</button></td></tr>').join("") +
          "</tbody></table></div>"
        : emptyBox("📭", "No exercises or activities recorded yet.", "Use the form above to add your first workout.");
    };
    const load = async () => { rows = await api("/api/workouts"); draw(); };

    form.addEventListener("submit", async e => {
      e.preventDefault();
      const body = {
        activity_date: $("#wDate").value, exercise_name: $("#wName").value.trim(), category: $("#wCat").value,
        duration_min: $("#wDur").value, calories_burned: $("#wCal").value, notes: $("#wNotes").value.trim()
      };
      try {
        if (editId) await api("/api/workouts/" + editId, { method: "PATCH", body });
        else await api("/api/workouts", { method: "POST", body });
        toast(editId ? "Workout updated." : "Workout added.");
        reset(); await load();
      } catch (err) { fail(err); }
    });
    $("#wCancel").addEventListener("click", reset);
    $("#wTable").addEventListener("click", async e => {
      const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
      if (edit) {
        const r = rows.find(x => x.id === Number(edit.dataset.edit)); if (!r) return;
        editId = r.id;
        $("#wDate").value = String(r.activity_date).slice(0, 10); $("#wName").value = r.exercise_name; $("#wCat").value = r.category;
        $("#wDur").value = r.duration_min; $("#wCal").value = r.calories_burned; $("#wNotes").value = r.notes || "";
        $("#formTitle").textContent = "Edit workout"; $("#wSave").textContent = "Save changes"; $("#wCancel").hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (del && confirm("Delete this workout?")) {
        try { await api("/api/workouts/" + del.dataset.del, { method: "DELETE" }); toast("Workout deleted."); if (editId === Number(del.dataset.del)) reset(); await load(); }
        catch (err) { fail(err); }
      }
    });
    reset(); await load();
  }

  // Duration + Calories pages share one layout: stats on top, a table where one number is editable in place.
  async function metricPage(main, cfg) {
    main.innerHTML = head(cfg.title, cfg.sub) + '<div class="stats" id="mStats"></div>' +
      '<section class="card"><div class="card-head"><h2>' + cfg.heading + '</h2><a class="btn small" href="/activities.html">+ Add workout</a></div><div id="mTable"></div></section>';
    let rows = [];
    const draw = () => {
      const vals = rows.map(r => r[cfg.field]);
      const total = vals.reduce((a, b) => a + b, 0);
      $("#mStats").innerHTML = cfg.stats(rows, total);
      $("#mTable").innerHTML = rows.length
        ? '<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Exercise</th><th>Type</th><th class="num">' + cfg.col +
          '</th><th class="num">' + cfg.extraCol + "</th><th></th></tr></thead><tbody>" +
          rows.map(r => "<tr><td>" + fmtDate(r.activity_date) + "</td><td>" + esc(r.exercise_name) + "</td><td>" + esc(r.category) +
            '</td><td class="num"><input class="inline" type="number" min="' + cfg.min + '" max="' + cfg.max + '" value="' + r[cfg.field] + '" data-in="' + r.id + '"> ' + cfg.unit +
            '</td><td class="num">' + cfg.extra(r) + '</td><td class="row-actions"><button class="btn small" data-save="' + r.id + '">Save</button></td></tr>').join("") +
          "</tbody></table></div>"
        : emptyBox("📭", cfg.empty, "Add a workout in Exercise/Activity Records first.");
    };
    const load = async () => { rows = await api("/api/workouts"); draw(); };
    $("#mTable").addEventListener("click", async e => {
      const btn = e.target.closest("[data-save]"); if (!btn) return;
      const input = $('[data-in="' + btn.dataset.save + '"]');
      try { await api("/api/workouts/" + btn.dataset.save, { method: "PATCH", body: { [cfg.field]: input.value } }); toast("Saved."); await load(); }
      catch (err) { fail(err); }
    });
    await load();
  }

  const duration = main => metricPage(main, {
    title: "Workout Duration Tracking", sub: "Track how long each workout lasts.", heading: "Duration per workout",
    field: "duration_min", col: "Duration", unit: "min", min: 1, max: 1440, extraCol: "Calories / min", empty: "No workout durations recorded yet.",
    extra: r => (r.calories_burned ? (r.calories_burned / r.duration_min).toFixed(1) : "—"),
    stats: (rows, total) => stat("🏃 Workouts", fmt(rows.length)) + stat("⏱️ Total Time", fmtMin(total)) +
      stat("📏 Average", rows.length ? fmtMin(Math.round(total / rows.length)) : "0 min") +
      stat("🏆 Longest", rows.length ? fmtMin(Math.max(...rows.map(r => r.duration_min))) : "0 min")
  });

  const calories = main => metricPage(main, {
    title: "Calories Burned Records", sub: "Record the calories burned in each workout.", heading: "Calories per workout",
    field: "calories_burned", col: "Calories", unit: "kcal", min: 0, max: 20000, extraCol: "Duration", empty: "No calories burned recorded yet.",
    extra: r => fmtMin(r.duration_min),
    stats: (rows, total) => stat("🏃 Workouts", fmt(rows.length)) + stat("🔥 Total Burned", fmt(total), "kcal") +
      stat("📏 Average", rows.length ? fmt(Math.round(total / rows.length)) : "0", "kcal") +
      stat("🏆 Best Session", rows.length ? fmt(Math.max(...rows.map(r => r.calories_burned))) : "0", "kcal")
  });

  // ---------------------------------------------------------- daily log ---
  async function dailyLog(main) {
    main.innerHTML = head("Daily Fitness Logs", "Your daily fitness log.") +
      '<section class="card"><h2>Log your day</h2><p class="hint">One log per day — saving a date that already has a log updates it.</p>' +
      '<form id="lForm" class="form-grid" novalidate>' +
      '<div class="field"><label for="lDate">Date</label><input id="lDate" type="date" required></div>' +
      '<div class="field"><label for="lWeight">Weight (kg)</label><input id="lWeight" type="number" step="0.1" min="20" max="500"></div>' +
      '<div class="field"><label for="lWater">Water (glasses)</label><input id="lWater" type="number" min="0" max="50"></div>' +
      '<div class="field"><label for="lSleep">Sleep (hours)</label><input id="lSleep" type="number" step="0.5" min="0" max="24"></div>' +
      '<div class="field"><label for="lMood">Mood</label><select id="lMood"><option value="">—</option>' + options(MOODS) + "</select></div>" +
      '<div class="field wide"><label for="lNotes">Notes</label><input id="lNotes" maxlength="255" placeholder="optional"></div>' +
      '<div class="actions"><button class="btn" type="submit">Save log</button></div></form></section>' +
      '<section class="card"><div class="card-head"><h2>Your logs</h2></div><div id="lTable"></div></section>';

    let rows = [];
    const draw = () => {
      $("#lTable").innerHTML = rows.length
        ? '<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th class="num">Weight</th><th class="num">Water</th><th class="num">Sleep</th><th>Mood</th><th>Notes</th><th></th></tr></thead><tbody>' +
          rows.map(r => "<tr><td>" + fmtDate(r.log_date) + '</td><td class="num">' + (r.weight_kg != null ? r.weight_kg + " kg" : "—") +
            '</td><td class="num">' + (r.water_glasses != null ? r.water_glasses + " gl" : "—") + '</td><td class="num">' + (r.sleep_hours != null ? r.sleep_hours + " h" : "—") +
            "</td><td>" + esc(r.mood || "—") + "</td><td>" + esc(r.notes || "") +
            '</td><td class="row-actions"><button class="btn small secondary" data-edit="' + r.id + '">Edit</button> <button class="btn small danger" data-del="' + r.id + '">Delete</button></td></tr>').join("") +
          "</tbody></table></div>"
        : emptyBox("📭", "No daily fitness logs yet.", "Fill in the form above to save today's log.");
    };
    const load = async () => { rows = await api("/api/daily-logs"); draw(); };
    const val = id => $(id).value;

    $("#lForm").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        await api("/api/daily-logs", { method: "POST", body: {
          log_date: val("#lDate"), weight_kg: val("#lWeight"), water_glasses: val("#lWater"),
          sleep_hours: val("#lSleep"), mood: val("#lMood"), notes: val("#lNotes").trim()
        } });
        toast("Daily log saved.");
        $("#lForm").reset(); $("#lDate").value = todayStr(); await load();
      } catch (err) { fail(err); }
    });
    $("#lTable").addEventListener("click", async e => {
      const edit = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
      if (edit) {
        const r = rows.find(x => x.id === Number(edit.dataset.edit)); if (!r) return;
        $("#lDate").value = String(r.log_date).slice(0, 10);
        $("#lWeight").value = r.weight_kg != null ? r.weight_kg : ""; $("#lWater").value = r.water_glasses != null ? r.water_glasses : "";
        $("#lSleep").value = r.sleep_hours != null ? r.sleep_hours : ""; $("#lMood").value = r.mood || ""; $("#lNotes").value = r.notes || "";
        $("#lForm").scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (del && confirm("Delete this log?")) {
        try { await api("/api/daily-logs/" + del.dataset.del, { method: "DELETE" }); toast("Log deleted."); await load(); }
        catch (err) { fail(err); }
      }
    });
    $("#lDate").value = todayStr();
    await load();
  }

  // ----------------------------------------------------------- progress ---
  function lineChart(points) {
    const W = 720, H = 260, L = 46, R = 16, T = 16, B = 34;
    const ys = points.map(p => p.weight_kg);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo < 1) { lo -= 1; hi += 1; }
    const padY = (hi - lo) * 0.15; lo -= padY; hi += padY;
    const x = i => (points.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (points.length - 1));
    const y = v => T + ((hi - v) * (H - T - B)) / (hi - lo);
    let g = "";
    for (let t = 0; t < 4; t++) {
      const v = lo + ((hi - lo) * t) / 3, yy = y(v);
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="grid"/><text x="' + (L - 8) + '" y="' + (yy + 4) + '" text-anchor="end" class="axis">' + v.toFixed(1) + "</text>";
    }
    const path = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(p.weight_kg).toFixed(1)).join(" ");
    const dots = points.map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.weight_kg).toFixed(1) + '" r="4" class="dot"><title>' +
      esc(fmtDate(p.log_date)) + ": " + p.weight_kg + " kg</title></circle>").join("");
    const xl = '<text x="' + L + '" y="' + (H - 10) + '" class="axis">' + esc(fmtDate(points[0].log_date)) + "</text>" +
      (points.length > 1 ? '<text x="' + (W - R) + '" y="' + (H - 10) + '" text-anchor="end" class="axis">' + esc(fmtDate(points[points.length - 1].log_date)) + "</text>" : "");
    return '<svg viewBox="0 0 ' + W + " " + H + '" class="chart" role="img" aria-label="Weight over time">' + g +
      (points.length > 1 ? '<path d="' + path + '" class="line"/>' : "") + dots + xl + "</svg>";
  }

  function bars(rows, field, unit) {
    const max = Math.max(1, ...rows.map(r => r[field]));
    return '<div class="bars">' + rows.map(r =>
      '<div class="bar-row"><div class="bar-label">' + esc(r.label) + '</div><div class="bar-track"><div class="bar-fill" style="width:' +
      Math.max(2, Math.round((r[field] / max) * 100)) + '%"></div></div><div class="bar-val">' + fmt(r[field]) + " " + unit + "</div></div>").join("") + "</div>";
  }

  async function progress(main) {
    main.innerHTML = head("Progress Tracking", "View your body and performance progress.") + '<div class="stats" id="pStats"></div>' +
      '<section class="card"><div class="card-head"><h2>Weight over time</h2><a class="btn small" href="/daily-log.html">+ Log weight</a></div><div id="pWeight"></div></section>' +
      '<section class="card"><div class="card-head"><h2>Training time per week</h2></div><div id="pWeekly"></div></section>';
    const d = await api("/api/progress");
    const w = d.weights;
    if (w.length) {
      const first = w[0].weight_kg, last = w[w.length - 1].weight_kg, diff = last - first;
      $("#pStats").innerHTML = stat("⚖️ Current Weight", last.toFixed(1), "kg") + stat("🏁 Starting Weight", first.toFixed(1), "kg") +
        stat("📉 Change", (diff > 0 ? "+" : "") + diff.toFixed(1), "kg") + stat("📅 Weigh-ins", fmt(w.length));
      $("#pWeight").innerHTML = lineChart(w);
    } else {
      $("#pStats").innerHTML = stat("⚖️ Current Weight", "—") + stat("🏁 Starting Weight", "—") + stat("📉 Change", "—") + stat("📅 Weigh-ins", "0");
      $("#pWeight").innerHTML = emptyBox("📭", "No progress to show yet.", "Log your weight in Daily Fitness Logs to see your trend.");
    }
    $("#pWeekly").innerHTML = d.weekly.length ? bars(d.weekly, "minutes", "min") : emptyBox("📭", "No workouts yet.", "Your weekly training time will show up here.");
  }

  // ------------------------------------------------------------ reports ---
  async function reports(main) {
    main.innerHTML = head("Weekly/Monthly Reports", "Weekly and monthly reports of your workouts.") +
      '<section class="card"><div class="card-head"><div class="seg" id="seg"><button data-p="weekly" class="active">Weekly</button><button data-p="monthly">Monthly</button></div></div><div id="rBody"></div></section>';
    const draw = async period => {
      const d = await api("/api/reports?period=" + period);
      const rows = d.rows;
      $("#rBody").innerHTML = rows.length
        ? '<div class="table-wrap"><table class="data"><thead><tr><th>' + (period === "monthly" ? "Month" : "Week") +
          '</th><th class="num">Workouts</th><th class="num">Minutes</th><th class="num">Calories</th></tr></thead><tbody>' +
          rows.map(r => "<tr><td>" + esc(r.label) + '</td><td class="num">' + fmt(r.workouts) + '</td><td class="num">' + fmt(r.minutes) + '</td><td class="num">' + fmt(r.calories) + "</td></tr>").join("") +
          "</tbody></table></div><h3 class=\"sub-h\">Minutes per " + (period === "monthly" ? "month" : "week") + "</h3>" + bars(rows.slice().reverse(), "minutes", "min")
        : emptyBox("📭", "No reports to show yet.", "Reports appear once you have recorded workouts.");
    };
    $("#seg").addEventListener("click", async e => {
      const b = e.target.closest("[data-p]"); if (!b) return;
      document.querySelectorAll("#seg button").forEach(x => x.classList.toggle("active", x === b));
      try { await draw(b.dataset.p); } catch (err) { fail(err); }
    });
    await draw("weekly");
  }

  // --------------------------------------------------------- calculator ---
  async function calculator(main) {
    main.innerHTML = head("Calories Calculator", "Calculate the calories you need and burn.") +
      '<section class="card"><h2>Your details</h2><form id="cForm" class="form-grid" novalidate>' +
      '<div class="field"><label for="cSex">Sex</label><select id="cSex"><option value="">Choose…</option><option value="male">Male</option><option value="female">Female</option></select></div>' +
      '<div class="field"><label for="cAge">Age</label><input id="cAge" type="number" min="10" max="100" required></div>' +
      '<div class="field"><label for="cHeight">Height (cm)</label><input id="cHeight" type="number" min="100" max="250" step="0.1" required></div>' +
      '<div class="field"><label for="cWeight">Weight (kg)</label><input id="cWeight" type="number" min="25" max="400" step="0.1" required></div>' +
      '<div class="field"><label for="cLevel">Activity level</label><select id="cLevel">' + options(ACTIVITY_LEVELS, "moderate") + "</select></div>" +
      '<div class="field"><label for="cGoal">Goal</label><select id="cGoal">' + options(GOALS, "maintain") + "</select></div>" +
      '<div class="field"><label for="cMet">Activity to estimate burn (optional)</label><select id="cMet"><option value="">None</option>' +
      MET_ACTIVITIES.map(a => '<option value="' + a[0] + '">' + esc(a[1]) + " (MET " + a[0] + ")</option>").join("") + "</select></div>" +
      '<div class="field"><label for="cMin">Minutes (optional)</label><input id="cMin" type="number" min="1" max="1440"></div>' +
      '<div class="actions"><button class="btn" type="submit">Calculate</button></div></form>' +
      '<div id="cResult"></div></section>' +
      '<section class="card"><div class="card-head"><h2>Recent calculations</h2></div><div id="cHist"></div></section>';

    const labelOf = (list, v) => (list.find(x => x[0] === v) || [v, v])[1];
    const loadHist = async () => {
      const rows = await api("/api/calculator");
      $("#cHist").innerHTML = rows.length
        ? '<div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Profile</th><th>Goal</th><th class="num">BMR</th><th class="num">Maintenance</th><th class="num">Daily target</th><th class="num">Burn</th><th></th></tr></thead><tbody>' +
          rows.map(r => "<tr><td>" + fmtDate(r.created_at) + "</td><td>" + esc(r.sex) + ", " + r.age + " y, " + r.height_cm + " cm, " + r.weight_kg + " kg</td><td>" + esc(r.goal) +
            '</td><td class="num">' + fmt(r.bmr) + '</td><td class="num">' + fmt(r.tdee) + '</td><td class="num"><strong>' + fmt(r.target_kcal) + '</strong></td><td class="num">' +
            (r.burn_kcal != null ? fmt(r.burn_kcal) + " kcal" : "—") + '</td><td class="row-actions"><button class="btn small danger" data-del="' + r.id + '">Delete</button></td></tr>').join("") +
          "</tbody></table></div>"
        : emptyBox("📭", "No calculations yet.", "Fill in your details above and press Calculate.");
    };

    $("#cForm").addEventListener("submit", async e => {
      e.preventDefault();
      try {
        const r = await api("/api/calculator", { method: "POST", body: {
          sex: $("#cSex").value, age: $("#cAge").value, height_cm: $("#cHeight").value, weight_kg: $("#cWeight").value,
          activity_level: $("#cLevel").value, goal: $("#cGoal").value, met: $("#cMet").value, minutes: $("#cMin").value
        } });
        $("#cResult").innerHTML = '<div class="result-grid">' +
          '<div class="result"><span>BMR</span><strong>' + fmt(r.bmr) + '</strong><small>kcal/day at rest</small></div>' +
          '<div class="result"><span>Maintenance</span><strong>' + fmt(r.tdee) + '</strong><small>kcal/day (' + esc(labelOf(ACTIVITY_LEVELS, $("#cLevel").value).split(" (")[0].toLowerCase()) + ")</small></div>" +
          '<div class="result main"><span>Daily target</span><strong>' + fmt(r.target_kcal) + '</strong><small>kcal/day to ' + esc($("#cGoal").value) + " weight</small></div>" +
          (r.burn_kcal != null ? '<div class="result"><span>Workout burn</span><strong>' + fmt(r.burn_kcal) + '</strong><small>kcal burned</small></div>' : "") + "</div>";
        await loadHist();
      } catch (err) { fail(err); }
    });
    $("#cHist").addEventListener("click", async e => {
      const del = e.target.closest("[data-del]");
      if (del && confirm("Delete this calculation?")) {
        try { await api("/api/calculator/" + del.dataset.del, { method: "DELETE" }); await loadHist(); } catch (err) { fail(err); }
      }
    });
    await loadHist();
  }

  const RENDERERS = { dashboard, activities, duration, calories, "daily-log": dailyLog, progress, reports, calculator };

  // -------------------------------------------------------------- shell ---
  async function init() {
    const main = $("main");
    if (!main) return;
    const key = main.dataset.page || "dashboard";
    let user;
    try { user = await api("/api/me"); }
    catch (e) { if (e.message !== "Not logged in.") main.innerHTML = '<div class="card">' + emptyBox("⚠️", "Cannot load", e.message) + "</div>"; return; }

    const current = NAV.find(p => p.page === key) || NAV[0];
    $("#navbar").innerHTML =
      '<div class="brand"><button class="menu-btn" id="menuBtn" aria-label="Toggle menu">&#9776;</button><div>Fit <span>Log</span></div></div>' +
      '<div class="nav-right"><span id="userName"></span><button class="logout" id="logoutBtn">Logout</button></div>';
    $("#userName").textContent = "Hi, " + user.name;
    $("#sidebar").innerHTML = "<h4>MENU</h4>" + NAV.map(p =>
      '<a href="' + p.href + '"' + (p === current ? ' class="active"' : "") + ">" + p.icon + " " + esc(p.label) + "</a>").join("");
    document.title = "Fit Log - " + current.label;

    $("#logoutBtn").addEventListener("click", async () => {
      try { await api("/api/logout", { method: "POST", body: {} }); } catch { /* ignore */ }
      location.href = "/index.html";
    });
    $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

    try { await RENDERERS[key](main); }
    catch (e) { if (e.message !== "Not logged in.") main.innerHTML = '<div class="card">' + emptyBox("⚠️", "Something went wrong", e.message) + "</div>"; }
  }

  init();
})();
