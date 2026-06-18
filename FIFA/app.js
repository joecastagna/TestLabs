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

/* ------------------------------- live data ------------------------------- */
// Real Group D standings + finished results, overlaid on the bundled defaults.
let live = null;
let liveStatus = { state: "loading" }; // loading | live | fallback | off
let liveUsaRating = null;
let liveScores = {}; // matchId -> { result, usaGoals, oppGoals }
let liveStandings = null;

function currentUsaRating() {
  return typeof liveUsaRating === "number" ? liveUsaRating : window.USA_RATING;
}

function validateLive(d) {
  if (!d || typeof d !== "object") return false;
  const s = d.group && d.group.standings;
  if (!Array.isArray(s) || s.length < 4) return false;
  return s.every((row) => row && typeof row.points === "number" && typeof row.team === "string");
}

function applyLive(d) {
  live = d;
  liveStatus = { state: "live", at: d.generatedAt || null, source: d.source || "live" };
  if (typeof d.usaRating === "number") liveUsaRating = d.usaRating;
  liveScores = {};
  const ums = (d.group && d.group.usaMatches) || [];
  ums.forEach((um) => {
    if (um.status === "finished" && um.result) {
      state.group[um.id] = um.result; // real results override toggles
      liveScores[um.id] = { result: um.result, usaGoals: um.usaGoals, oppGoals: um.oppGoals };
    }
  });
  liveStandings = (d.group && d.group.standings) || null;
}

async function fetchLive() {
  const cfg = window.LIVE_CONFIG;
  if (!cfg || !cfg.enabled) {
    liveStatus = { state: "off" };
    return;
  }
  try {
    const url = cfg.url + (cfg.url.includes("?") ? "&" : "?") + "cb=" + Date.now();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (!validateLive(data)) throw new Error("unexpected data shape");
    applyLive(data);
  } catch (e) {
    liveStatus = { state: "fallback", error: String((e && e.message) || e) };
  }
  render();
}

// A finished, real result for a match (locks the toggle), or null.
function finishedFor(m) {
  return m.type === "group" ? liveScores[m.id] || null : null;
}

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  return Math.round(hrs / 24) + "d ago";
}

/* ----------------------------- analysis math ----------------------------- */

function usaWinProb(opponentRating) {
  const gap = currentUsaRating() - opponentRating;
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

// Concise stage name + short badge for the station header.
function stageBits(m) {
  if (m.type === "group") {
    const md = { g1: "1", g2: "2", g3: "3" }[m.id];
    return { name: `Matchday ${md}`, badge: "Group D" };
  }
  const badge = { r32: "R32", r16: "R16", qf: "QF", sf: "SF", final: "Final" }[m.id];
  return { name: m.stage, badge };
}
function shortDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function cityOf(venue) {
  return (venue || "").split(", ").slice(-1)[0];
}

const bar = (label, v, kind) =>
  `<div class="bar"><span class="bl">${label}</span><span class="bv">${v}</span><i class="track"><b class="${kind}" style="width:${v}%"></b></i></div>`;

// A single station on the route spine.
function matchCard(m, topKeyId, eliminated, opts = {}) {
  const comp = competitiveness(m.opponent.rating);
  const stk = stakes(m);
  const winP = Math.round(usaWinProb(m.opponent.rating) * 100);
  const isKey = m.id + m.type === topKeyId;
  const fin = finishedFor(m);
  const result = fin ? fin.result : getResult(m);
  const locked = !!fin;
  const champ = !!opts.champ && result === "win";
  const { name, badge } = stageBits(m);
  const rank = m.opponent.fifaRank ? `FIFA #${m.opponent.fifaRank}` : "Opponent TBD";

  const toggle = RESULTS.map(
    (r) =>
      `<button class="toggle-btn ${r} ${result === r ? "active" : ""}" data-match="${m.id}" data-type="${m.type}" data-result="${r}"${locked ? " disabled" : ""}>${RESULT_LABEL[r]}</button>`
  ).join("");

  const ft = fin ? `<span class="ft ${fin.result}">FT ${fin.usaGoals}–${fin.oppGoals}</span>` : "";
  const tag = locked ? "Final · live" : m.type === "group" ? "3 pts a win" : "Win or out";
  const nodeMark = champ ? "🏆" : "";

  const cls = [
    "station",
    result,
    eliminated ? "out" : "",
    locked ? "locked" : "",
    isKey ? "key" : "",
    opts.terminus ? "terminus" : "",
    champ ? "champ" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="${cls}" data-id="${m.id}">
      <div class="rail"><span class="node">${nodeMark}</span></div>
      <article class="card">
        <div class="card-top">
          <div><span class="stage-name">${name}</span><span class="md">${badge}</span></div>
          <span class="when">${shortDate(m.date)} · ${cityOf(m.venue)}</span>
        </div>
        <div class="fixture">
          <span class="flag">${m.opponent.flag}</span>
          <div class="vs">
            <span class="teams">USA <em>v</em> ${m.opponent.name}${m.opponent.projected ? ` <span class="proj">proj</span>` : ""}</span>
            <span class="note">${m.opponent.note}</span>
          </div>
          <span class="rank">${rank}</span>
        </div>
        <div class="readout">
          <div class="big-prob"><span class="pct">${winP}<i>%</i></span><span class="pl">USA win chance</span></div>
          <div class="bars">
            ${bar("Competitiveness", comp, "comp")}
            ${bar("Stakes", stk, "stakes")}
          </div>
        </div>
        <div class="card-foot">
          ${ft}
          <div class="toggle">${toggle}</div>
          <span class="tag">${tag}</span>
          ${isKey ? `<span class="key-tag">★ Key match</span>` : ""}
        </div>
      </article>
    </div>`;
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
  const trackCls = activePathKey() === "win" ? "track-win" : "track-runnerup";
  const koHtml = koMatches
    .map((m, i) => {
      const globalIdx = matches.findIndex((x) => x === m);
      const eliminated =
        path.knockedOutAt === "Group Stage" || (endIdx !== -1 && globalIdx > endIdx);
      const last = i === koMatches.length - 1;
      return matchCard(m, topKeyId, eliminated, {
        terminus: last,
        champ: last && path.isChampion,
      });
    })
    .join("");

  document.getElementById("matches").innerHTML = `
    <h3 class="section-h">The group stage <span class="real-tag">real fixtures</span></h3>
    <div class="tl-phase group">${groupHtml}</div>
    ${renderPathBar()}
    <h3 class="section-h">The knockouts — ${PATHS[activePathKey()].label} <span class="proj-tag">projected</span></h3>
    <div class="tl-phase knockout ${trackCls}">${koHtml}</div>`;

  // Wire toggles (disabled buttons are real, finished results — ignore clicks).
  document.querySelectorAll(".toggle-btn").forEach((btn) => {
    if (btn.disabled) return;
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

  const autoNote = auto
    ? `Auto-set by your ${g.pts} pts → <b>${active === "win" ? "winning the group" : g.finish === "out" ? "out of the group" : "finishing 2nd"}</b>.`
    : `Viewing the <b>${active === "win" ? "group-winner" : "runner-up"}</b> road.`;

  return `
    <div class="fork">
      <div class="fork-rail"><span class="fork-node">⑂</span></div>
      <div class="fork-body">
        <div class="fork-head">The fork <span>Where Group D decides everything</span></div>
        <div class="branches">
          <button class="branch win ${active === "win" ? "sel" : ""} path-pick" data-mode="win">
            <span class="br-label">Win the group</span>
            <span class="br-dest">R32 · ${cityOf(r32win.venue)} · vs ${r32win.opponent.flag} ${r32win.opponent.name}</span>
            <span class="br-prob good">${pWin}% win chance</span>
          </button>
          <button class="branch runnerup ${active === "runnerup" ? "sel" : ""} path-pick" data-mode="runnerup">
            <span class="br-label">Finish second</span>
            <span class="br-dest">R32 · ${cityOf(r32run.venue)} · vs ${r32run.opponent.flag} ${r32run.opponent.name}</span>
            <span class="br-prob bad">${pRun}% win chance</span>
          </button>
        </div>
        <div class="fork-foot">
          <button class="auto-pick ${auto ? "on" : ""} path-pick" data-mode="auto">Auto</button>
          <span class="auto-note">${autoNote}</span>
        </div>
      </div>
    </div>`;
}

function renderSummary() {
  const path = evaluatePath();
  const el = document.getElementById("summary");
  let verdict, cls, sub;
  if (path.isChampion) {
    verdict = "World champions";
    cls = "champ";
    sub = "USA lifts the trophy on home soil — the whole road run out.";
  } else if (path.knockedOutAt === "Group Stage") {
    verdict = "Out in the group";
    cls = "out";
    sub = `${path.pts} points isn't enough to advance. The run ends before the knockouts.`;
  } else if (path.knockedOutAt) {
    verdict = `Out · ${path.knockedOutAt}`;
    cls = "out";
    sub = `A run to the ${path.knockedOutAt.toLowerCase()}, then the road ends.`;
  } else {
    verdict = "Run in progress";
    cls = "live";
    sub = "Set the remaining results to map the full road to the final.";
  }

  const finishLbl =
    path.finish === "win" ? "1st — group" : path.finish === "runnerup" ? "2nd / 3rd" : "Out";

  el.className = `summary ${cls}`;
  el.innerHTML = `
    <div class="verdict-eyebrow">Projected outcome</div>
    <div class="verdict-main">${verdict}</div>
    <div class="verdict-sub">${sub}</div>
    <div class="summary-stats">
      <div class="stat"><span class="stat-num">${path.pts}</span><span class="stat-lbl">Group points</span></div>
      <div class="stat"><span class="stat-num">${path.wins}–${path.draws}–${path.losses}</span><span class="stat-lbl">Group W-D-L</span></div>
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

  document.getElementById("briefing").innerHTML = `<h2>Manager's notes</h2><ul>${items.join("")}</ul>`;
}

// Live status strip + manual refresh.
function renderLiveBar() {
  const el = document.getElementById("livebar");
  if (!el) return;
  let text, cls;
  if (liveStatus.state === "live") {
    cls = "on";
    const src = liveStatus.source ? ` · ${liveStatus.source}` : "";
    text = `LIVE — standings updated ${timeAgo(liveStatus.at) || "now"}${src}`;
  } else if (liveStatus.state === "loading") {
    cls = "loading";
    text = "FETCHING LIVE STANDINGS…";
  } else if (liveStatus.state === "off") {
    cls = "off";
    text = "LIVE OFF — using built-in projection";
  } else {
    cls = "off";
    text = "LIVE UNAVAILABLE — showing built-in projection";
  }
  el.className = `livebar ${cls}`;
  el.innerHTML = `
    <span class="live-dot"></span>
    <span class="live-text">${text}</span>
    <button id="refresh" class="live-refresh" ${liveStatus.state === "loading" ? "disabled" : ""}>↻ Refresh</button>`;
  const btn = document.getElementById("refresh");
  if (btn)
    btn.addEventListener("click", () => {
      liveStatus = { state: "loading" };
      renderLiveBar();
      fetchLive();
    });
}

// Live Group D table (only when we have real standings).
function renderStandings() {
  const el = document.getElementById("standings");
  if (!el) return;
  if (!liveStandings) {
    el.innerHTML = "";
    return;
  }
  const rows = liveStandings
    .slice()
    .sort((a, b) => b.points - a.points || (b.gd || 0) - (a.gd || 0) || (b.gf || 0) - (a.gf || 0))
    .map((r, i) => {
      const isUSA = (r.code || "").toUpperCase() === "USA" || /united states|usa/i.test(r.team);
      const cut = i < 2 ? "q" : i === 2 ? "q3" : "";
      return `<tr class="${isUSA ? "usa" : ""} ${cut}">
        <td class="pos">${i + 1}</td>
        <td class="team">${r.team}${isUSA ? " 🇺🇸" : ""}</td>
        <td>${r.played || 0}</td>
        <td>${r.win || 0}</td>
        <td>${r.draw || 0}</td>
        <td>${r.loss || 0}</td>
        <td>${r.gf || 0}</td>
        <td>${r.ga || 0}</td>
        <td>${(r.gd || 0) > 0 ? "+" : ""}${r.gd || 0}</td>
        <td class="pts">${r.points}</td>
      </tr>`;
    })
    .join("");
  el.innerHTML = `
    <h3 class="section-h">The live table <span class="real-tag">live</span></h3>
    <div class="table-wrap">
      <table class="standings-table">
        <thead><tr><th>#</th><th class="team">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="table-key"><span class="k q"></span>Top 2 advance <span class="k q3"></span>3rd → best-third race</div>`;
}

function render() {
  renderLiveBar();
  renderSummary();
  renderStandings();
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
  render(); // instant paint with bundled defaults…
  fetchLive(); // …then overlay real, current standings.
});
