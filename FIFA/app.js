/*
 * USA Path to Glory — interactive simulator logic.
 *
 * Toggle each match Win / Draw / Loss and instantly see:
 *   - group-stage points and the projected Group D finish (1st / 2nd / out)
 *   - TWO knockout roads that diverge by finish — winning the group is softer,
 *     finishing 2nd throws you straight at a top-10 side (Belgium's group)
 *   - the most COMPETITIVE matches (closest on paper) and the single KEY match
 *   - a live verdict, an auto briefing, and a shareable scenario link
 */

const RESULTS = ["win", "draw", "loss"];
const RESULT_LABEL = { win: "WIN", draw: "DRAW", loss: "LOSS" };
const POINTS = { win: 3, draw: 1, loss: 0 };
const STORAGE_KEY = "usa-path-v2";

const PATHS = {
  win: { key: "win", label: "Win Group D (1st)", matches: () => window.PATH_WIN_GROUP },
  runnerup: { key: "runnerup", label: "Finish 2nd", matches: () => window.PATH_RUNNER_UP },
};

/* ------------------------------- state ----------------------------------- */

function defaultState() {
  return {
    group: { g1: "win", g2: "draw", g3: "win" },
    knockout: {
      win: { r32: "win", r16: "win", qf: "draw", sf: "loss", final: "loss" },
      runnerup: { r32: "win", r16: "loss", qf: "loss", sf: "loss", final: "loss" },
    },
    pathMode: "auto", // "auto" | "win" | "runnerup"
  };
}

// Load from URL hash (shareable) first, then localStorage, then defaults.
function loadState() {
  const fromHash = decodeStateFromHash();
  if (fromHash) return fromHash;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) {
    /* ignore */
  }
  return defaultState();
}

function saveState(s) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    /* ignore */
  }
  encodeStateToHash(s);
}

// Compact hash encoding: g<wdl>|kw<wdl>|kr<wdl>|p<mode> e.g. #wdw-wwdll-wllll-a
function encodeStateToHash(s) {
  const c = (r) => (r === "win" ? "w" : r === "draw" ? "d" : "l");
  const g = ["g1", "g2", "g3"].map((k) => c(s.group[k])).join("");
  const kw = ["r32", "r16", "qf", "sf", "final"].map((k) => c(s.knockout.win[k])).join("");
  const kr = ["r32", "r16", "qf", "sf", "final"].map((k) => c(s.knockout.runnerup[k])).join("");
  const p = s.pathMode === "win" ? "w" : s.pathMode === "runnerup" ? "r" : "a";
  history.replaceState(null, "", `#${g}-${kw}-${kr}-${p}`);
}

function decodeStateFromHash() {
  const h = (location.hash || "").replace(/^#/, "");
  const m = h.match(/^([wdl]{3})-([wdl]{5})-([wdl]{5})-([awr])$/);
  if (!m) return null;
  const d = (ch) => (ch === "w" ? "win" : ch === "d" ? "draw" : "loss");
  const s = defaultState();
  const gk = ["g1", "g2", "g3"];
  const kk = ["r32", "r16", "qf", "sf", "final"];
  m[1].split("").forEach((ch, i) => (s.group[gk[i]] = d(ch)));
  m[2].split("").forEach((ch, i) => (s.knockout.win[kk[i]] = d(ch)));
  m[3].split("").forEach((ch, i) => (s.knockout.runnerup[kk[i]] = d(ch)));
  s.pathMode = m[4] === "w" ? "win" : m[4] === "r" ? "runnerup" : "auto";
  return s;
}

let state = loadState();

/* ----------------------------- analysis math ----------------------------- */

function usaWinProb(opponentRating) {
  const gap = window.USA_RATING - opponentRating;
  return 1 / (1 + Math.pow(10, -gap / 400));
}

// 0..100, peaks at a 50/50 coin-flip game.
function competitiveness(opponentRating) {
  const p = usaWinProb(opponentRating);
  return Math.round((1 - Math.abs(p - 0.5) * 2) * 100);
}

// 0..100 — how much is riding on the result.
function stakes(match) {
  if (match.type === "knockout") {
    const order = ["r32", "r16", "qf", "sf", "final"];
    const pos = order.indexOf(match.id);
    return Math.round(70 + (pos / (order.length - 1)) * 30); // 70..100
  }
  const gpos = { g1: 0, g2: 1, g3: 2 }[match.id] || 0;
  return Math.round(35 + gpos * 12); // 35, 47, 59
}

// Blend of stakes and competitiveness — the game to circle on the calendar.
function keyScore(match) {
  return Math.round(0.5 * competitiveness(match.opponent.rating) + 0.5 * stakes(match));
}

/* --------------------------- scenario evaluation -------------------------- */

// Projected Group D finish from USA's points alone.
//   >=7 pts → likely group winner (1st)
//   4-6 pts → likely runner-up / best-third (through, but 2nd)
//   <4 pts  → out
function groupOutcome() {
  const pts = GROUP_MATCHES.reduce((s, m) => s + POINTS[state.group[m.id]], 0);
  const wins = GROUP_MATCHES.filter((m) => state.group[m.id] === "win").length;
  const draws = GROUP_MATCHES.filter((m) => state.group[m.id] === "draw").length;
  let finish = "out";
  if (pts >= 7) finish = "win";
  else if (pts >= 4) finish = "runnerup";
  return { pts, wins, draws, losses: 3 - wins - draws, finish, advanced: pts >= 4 };
}

// Which knockout path is being shown (respecting a manual override).
function activePathKey() {
  if (state.pathMode === "win" || state.pathMode === "runnerup") return state.pathMode;
  const g = groupOutcome();
  return g.finish === "out" ? "win" : g.finish; // default view if out: show the winner road
}

// Walk the active road and decide how far USA goes.
function evaluatePath() {
  const g = groupOutcome();
  const pathKey = activePathKey();
  const matches = PATHS[pathKey].matches();
  const res = {
    ...g,
    pathKey,
    knockedOutAt: null,
    isChampion: false,
    roundsWon: 0,
  };
  if (!g.advanced) {
    res.knockedOutAt = "Group Stage";
    return res;
  }
  for (const m of matches) {
    const r = state.knockout[pathKey][m.id];
    if (r === "loss") {
      res.knockedOutAt = m.stage;
      return res;
    }
    res.roundsWon += 1;
    if (m.id === "final") res.isChampion = true;
  }
  return res;
}

// Read/write a result regardless of which list a match belongs to.
function getResult(m) {
  return m.type === "group" ? state.group[m.id] : state.knockout[activePathKey()][m.id];
}
function setResult(m, r) {
  if (m.type === "group") state.group[m.id] = r;
  else state.knockout[activePathKey()][m.id] = r;
}

function activeMatches() {
  return GROUP_MATCHES.concat(PATHS[activePathKey()].matches());
}

/* ------------------------------- rendering ------------------------------- */

const meter = (v, kind) =>
  `<div class="meter" title="${v}/100"><div class="meter-fill ${kind}" style="width:${v}%"></div></div>`;

function matchCard(m, topKeyId, eliminated) {
  const comp = competitiveness(m.opponent.rating);
  const stk = stakes(m);
  const winP = Math.round(usaWinProb(m.opponent.rating) * 100);
  const isKey = m.id + m.type === topKeyId;
  const result = getResult(m);
  const rank = m.opponent.fifaRank ? `#${m.opponent.fifaRank}` : "—";

  const toggle = RESULTS.map(
    (r) =>
      `<button class="toggle-btn ${r} ${result === r ? "active" : ""}" data-match="${m.id}" data-type="${m.type}" data-result="${r}">${RESULT_LABEL[r]}</button>`
  ).join("");

  return `
    <article class="match-card ${isKey ? "key" : ""} ${result} ${eliminated ? "dim" : ""}" data-id="${m.id}">
      <div class="match-head">
        <div class="match-stage">
          <span class="stage-label">${m.stage}</span>
          <span class="stage-meta">${m.date} · ${m.venue}</span>
        </div>
        ${isKey ? `<span class="chip key-chip">⭐ KEY MATCH</span>` : ""}
      </div>
      <div class="match-body">
        <div class="opponent">
          <span class="flag">${m.opponent.flag}</span>
          <div class="opp-text">
            <span class="opp-name">USA <span class="vs">vs</span> ${m.opponent.name}${m.opponent.projected ? ` <span class="proj">proj</span>` : ""}</span>
            <span class="opp-note">${m.opponent.note}</span>
          </div>
          <div class="opp-rank"><span class="rank-num">${rank}</span><span class="rank-lbl">FIFA</span></div>
        </div>
        <div class="metrics">
          <div class="metric"><div class="metric-top"><span>Competitiveness</span><span>${comp}</span></div>${meter(comp, "comp")}</div>
          <div class="metric"><div class="metric-top"><span>Stakes</span><span>${stk}</span></div>${meter(stk, "stakes")}</div>
          <div class="metric"><div class="metric-top"><span>USA win chance</span><span>${winP}%</span></div>${meter(winP, "winp")}</div>
        </div>
      </div>
      <div class="match-foot">
        <div class="toggle">${toggle}</div>
        <span class="type-tag ${m.type}">${m.type === "group" ? "Group · points" : "Knockout · win or out"}</span>
      </div>
    </article>`;
}

function renderMatches() {
  const path = evaluatePath();
  const matches = activeMatches();

  // Most "key" match across the active road.
  let topKeyId = null;
  let best = -1;
  matches.forEach((m) => {
    const k = keyScore(m);
    if (k > best) {
      best = k;
      topKeyId = m.id + m.type;
    }
  });

  // Dim matches beyond the point of elimination.
  const endIdx = path.knockedOutAt
    ? matches.findIndex((m) => m.stage === path.knockedOutAt)
    : -1;

  const groupHtml = GROUP_MATCHES.map((m) => matchCard(m, topKeyId, false)).join("");

  const koMatches = PATHS[activePathKey()].matches();
  const koHtml = koMatches
    .map((m) => {
      const globalIdx = matches.findIndex((x) => x === m);
      const eliminated =
        path.knockedOutAt === "Group Stage" || (endIdx !== -1 && globalIdx > endIdx);
      return matchCard(m, topKeyId, eliminated);
    })
    .join("");

  document.getElementById("matches").innerHTML = `
    <h3 class="section-h">Group D — <span class="real-tag">real fixtures</span></h3>
    ${groupHtml}
    ${renderPathBar()}
    <h3 class="section-h">Knockout road — ${PATHS[activePathKey()].label} <span class="proj-tag">projected opponents</span></h3>
    ${koHtml}`;

  // Wire toggles.
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = btn.dataset.type === "group" ? GROUP_MATCHES : PATHS[activePathKey()].matches();
      const m = list.find((x) => x.id === btn.dataset.match);
      setResult(m, btn.dataset.result);
      saveState(state);
      render();
    });
  });
  document.querySelectorAll(".path-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.pathMode = btn.dataset.mode;
      saveState(state);
      render();
    });
  });
}

// The path selector + the "why winning the group matters" insight.
function renderPathBar() {
  const g = groupOutcome();
  const active = activePathKey();
  const auto = state.pathMode === "auto";

  const r32win = PATH_WIN_GROUP[0];
  const r32run = PATH_RUNNER_UP[0];
  const pWin = Math.round(usaWinProb(r32win.opponent.rating) * 100);
  const pRun = Math.round(usaWinProb(r32run.opponent.rating) * 100);

  const btn = (mode, label) =>
    `<button class="path-pick ${state.pathMode === mode ? "on" : ""}" data-mode="${mode}">${label}</button>`;

  const autoNote = auto
    ? `Auto-picked from your ${g.pts} pts → <strong>${active === "win" ? "win the group" : g.finish === "out" ? "wouldn't qualify" : "finish 2nd"}</strong>.`
    : `Manually viewing the <strong>${active === "win" ? "group-winner" : "runner-up"}</strong> road.`;

  return `
    <section class="pathbar">
      <div class="pathbar-top">
        <div class="pathbar-title">Which road? <span class="pathbar-sub">${autoNote}</span></div>
        <div class="path-picker">
          ${btn("auto", "Auto")}
          ${btn("win", "Win group")}
          ${btn("runnerup", "Finish 2nd")}
        </div>
      </div>
      <div class="path-compare">
        <div class="pc-card ${active === "win" ? "sel" : ""}">
          <span class="pc-head">🥇 Win Group D</span>
          <span class="pc-body">R32 in Santa Clara vs ${r32win.opponent.flag} ${r32win.opponent.name}</span>
          <span class="pc-prob good">${pWin}% win chance</span>
        </div>
        <div class="pc-vs">the prize for topping the group →</div>
        <div class="pc-card ${active === "runnerup" ? "sel" : ""}">
          <span class="pc-head">🥈 Finish 2nd</span>
          <span class="pc-body">R32 in Dallas vs ${r32run.opponent.flag} ${r32run.opponent.name}</span>
          <span class="pc-prob bad">${pRun}% win chance</span>
        </div>
      </div>
    </section>`;
}

function renderSummary() {
  const path = evaluatePath();
  const el = document.getElementById("summary");
  let verdict, cls, sub;
  if (path.isChampion) {
    verdict = "🏆 WORLD CHAMPIONS";
    cls = "champ";
    sub = "USA wins it all — history made on home soil.";
  } else if (path.knockedOutAt === "Group Stage") {
    verdict = "❌ OUT IN THE GROUP";
    cls = "out";
    sub = `${path.pts} pts isn't enough to advance. The dream ends early.`;
  } else if (path.knockedOutAt) {
    verdict = `Eliminated · ${path.knockedOutAt}`;
    cls = "out";
    sub = `A run to the ${path.knockedOutAt.toLowerCase()}, then the road ends.`;
  } else {
    verdict = "Run in progress";
    cls = "live";
    sub = "Set every result to map the full path.";
  }

  const finishLbl =
    path.finish === "win" ? "Win the group" : path.finish === "runnerup" ? "Through as 2nd/3rd" : "Eliminated";

  el.className = `summary ${cls}`;
  el.innerHTML = `
    <div class="verdict"><span class="verdict-main">${verdict}</span><span class="verdict-sub">${sub}</span></div>
    <div class="summary-stats">
      <div class="stat"><span class="stat-num">${path.pts}</span><span class="stat-lbl">Group pts</span></div>
      <div class="stat"><span class="stat-num">${path.wins}-${path.draws}-${path.losses}</span><span class="stat-lbl">Group W-D-L</span></div>
      <div class="stat"><span class="stat-num">${finishLbl}</span><span class="stat-lbl">Group finish</span></div>
      <div class="stat"><span class="stat-num">${path.roundsWon}</span><span class="stat-lbl">KO rounds won</span></div>
    </div>`;
}

function renderBriefing() {
  const ranked = activeMatches()
    .map((m) => ({ m, key: keyScore(m), comp: competitiveness(m.opponent.rating), win: usaWinProb(m.opponent.rating) }))
    .sort((a, b) => b.key - a.key);

  const mustWin = GROUP_MATCHES.filter((m) => usaWinProb(m.opponent.rating) >= 0.5);
  const upsets = ranked.filter((r) => r.win < 0.4);

  const items = [
    `<li><strong>Win the group — it's the whole game.</strong> Top Group D and the Round of 32 is a best-third qualifier in Santa Clara (${Math.round(usaWinProb(PATH_WIN_GROUP[0].opponent.rating) * 100)}% win chance). Slip to 2nd and it's Belgium in Dallas (${Math.round(usaWinProb(PATH_RUNNER_UP[0].opponent.rating) * 100)}%).</li>`,
    `<li><strong>Bank the points early.</strong> Treat ${mustWin.map((m) => m.opponent.name).join(" and ")} as must-wins — 6 points there all but locks up the knockouts.</li>`,
    `<li><strong>Türkiye likely decides 1st place.</strong> Matchday 3 is the group's heavyweight clash — competitiveness ${competitiveness(GROUP_MATCHES[2].opponent.rating)}/100.</li>`,
    `<li><strong>Circle the key match:</strong> ${ranked[0].m.stage} vs ${ranked[0].m.opponent.name} grades highest on stakes × competitiveness (${ranked[0].key}/100).</li>`,
    upsets.length
      ? `<li><strong>Upsets required to lift it:</strong> ${upsets.map((r) => r.m.opponent.name).join(", ")}. Defensive structure + set pieces are the equalizers.</li>`
      : `<li><strong>Favored the whole way</strong> on this road — protect leads and stay disciplined.</li>`,
  ];

  document.getElementById("briefing").innerHTML = `<h2>What USA needs to do</h2><ul>${items.join("")}</ul>`;
}

function render() {
  renderSummary();
  renderMatches();
  renderBriefing();
}

/* ------------------------------- controls -------------------------------- */

function setupControls() {
  document.getElementById("reset").addEventListener("click", () => {
    state.group = { g1: "win", g2: "win", g3: "win" };
    for (const k of ["r32", "r16", "qf", "sf", "final"]) {
      state.knockout.win[k] = "win";
      state.knockout.runnerup[k] = "win";
    }
    saveState(state);
    render();
  });
  document.getElementById("realistic").addEventListener("click", () => {
    state = defaultState();
    saveState(state);
    render();
  });
  document.getElementById("share").addEventListener("click", async () => {
    encodeStateToHash(state);
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      flash("Scenario link copied!");
    } catch (e) {
      flash("Link is in your address bar — copy it!");
    }
  });
  window.addEventListener("hashchange", () => {
    const s = decodeStateFromHash();
    if (s) {
      state = s;
      render();
    }
  });
}

let flashTimer;
function flash(msg) {
  let el = document.getElementById("flash");
  if (!el) {
    el = document.createElement("div");
    el.id = "flash";
    el.className = "flash";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

document.addEventListener("DOMContentLoaded", () => {
  setupControls();
  render();
});
