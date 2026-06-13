/*
 * USA Path to Glory — interactive simulator logic.
 *
 * Lets you toggle each match Win / Draw / Loss and instantly see:
 *   - group-stage points and qualification status
 *   - the knockout run and whether the dream is still alive
 *   - which matches are the most COMPETITIVE (closest on paper)
 *   - which matches are KEY (high stakes × high competitiveness)
 */

const RESULTS = ["win", "draw", "loss"];
const RESULT_LABEL = { win: "WIN", draw: "DRAW", loss: "LOSS" };
const POINTS = { win: 3, draw: 1, loss: 0 };

// Persist the user's toggles so a refresh keeps the scenario.
const STORAGE_KEY = "usa-path-results-v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    /* ignore corrupt/blocked storage */
  }
  // Default scenario: a respectable run — win the winnable ones, see how far.
  return {
    g1: "win",
    g2: "draw",
    g3: "win",
    r32: "win",
    r16: "win",
    qf: "draw",
    sf: "loss",
    final: "loss",
  };
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage may be unavailable; in-memory state still works */
  }
}

let state = loadState();

/* ----------------------------- analysis math ----------------------------- */

// Win probability for USA via a logistic on the rating gap.
function usaWinProb(opponentRating) {
  const gap = window.USA_RATING - opponentRating;
  return 1 / (1 + Math.pow(10, -gap / 400));
}

// Competitiveness 0..100 — peaks when the two sides are evenly matched.
// A coin-flip game (50% win prob) scores 100; a blowout either way trends to 0.
function competitiveness(opponentRating) {
  const p = usaWinProb(opponentRating);
  return Math.round((1 - Math.abs(p - 0.5) * 2) * 100);
}

// Stakes 0..100 — how much is riding on the result.
// Knockouts are win-or-go-home (max stakes); group games scale up by round.
function stakes(match, index) {
  if (match.type === "knockout") {
    // Later knockout rounds carry more weight (Final = peak).
    const order = ["r32", "r16", "qf", "sf", "final"];
    const pos = order.indexOf(match.id);
    return Math.round(70 + (pos / (order.length - 1)) * 30); // 70..100
  }
  // Group games: matchday 1 lowest, decider highest.
  return Math.round(35 + index * 12); // 35, 47, 59
}

// "Key match" index — a blend of stakes and competitiveness. A tense game that
// also decides everything is the one to circle on the calendar.
function keyScore(match, index) {
  const c = competitiveness(match.opponent.rating);
  const s = stakes(match, index);
  return Math.round(0.5 * c + 0.5 * s);
}

/* --------------------------- scenario evaluation -------------------------- */

// Walk the path and decide how far USA actually goes given current toggles.
function evaluatePath() {
  const groupMatches = MATCHES.filter((m) => m.type === "group");
  const points = groupMatches.reduce((sum, m) => sum + POINTS[state[m.id]], 0);
  const wins = groupMatches.filter((m) => state[m.id] === "win").length;
  const draws = groupMatches.filter((m) => state[m.id] === "draw").length;

  // 2026 format: top 2 advance automatically; 4–5 pts is the realistic
  // cutline for a best-third spot. We treat >=4 as "through".
  const advanced = points >= 4;
  const wonGroup = points >= 7;

  const result = {
    points,
    wins,
    draws,
    losses: groupMatches.length - wins - draws,
    advanced,
    wonGroup,
    knockedOutAt: null, // stage label where the run ended
    isChampion: false,
    roundsWon: 0,
  };

  if (!advanced) {
    result.knockedOutAt = "Group Stage";
    return result;
  }

  // Knockouts: a draw means it went to penalties — we treat draw as survive,
  // loss as elimination, win as a clean advance.
  const knockouts = MATCHES.filter((m) => m.type === "knockout");
  for (const m of knockouts) {
    const r = state[m.id];
    if (r === "loss") {
      result.knockedOutAt = m.stage;
      return result;
    }
    result.roundsWon += 1;
    if (m.id === "final") result.isChampion = true;
  }
  return result;
}

/* ------------------------------- rendering ------------------------------- */

function chip(label, cls) {
  return `<span class="chip ${cls}">${label}</span>`;
}

function meter(value, kind) {
  return `
    <div class="meter" title="${value}/100">
      <div class="meter-fill ${kind}" style="width:${value}%"></div>
    </div>`;
}

function renderMatches() {
  const path = evaluatePath();
  const list = document.getElementById("matches");

  // Find the single most "key" match to highlight.
  let topKeyId = null;
  let topKeyVal = -1;
  MATCHES.forEach((m, i) => {
    const k = keyScore(m, i);
    if (k > topKeyVal) {
      topKeyVal = k;
      topKeyId = m.id;
    }
  });

  list.innerHTML = MATCHES.map((m, i) => {
    const comp = competitiveness(m.opponent.rating);
    const stk = stakes(m, i);
    const winP = Math.round(usaWinProb(m.opponent.rating) * 100);
    const isKey = m.id === topKeyId;
    const result = state[m.id];

    const toggle = RESULTS.map(
      (r) => `
        <button class="toggle-btn ${r} ${result === r ? "active" : ""}"
                data-match="${m.id}" data-result="${r}">
          ${RESULT_LABEL[r]}
        </button>`
    ).join("");

    return `
      <article class="match-card ${isKey ? "key" : ""} ${result}" data-id="${m.id}">
        <div class="match-head">
          <div class="match-stage">
            <span class="stage-label">${m.stage}</span>
            <span class="stage-meta">${m.date} · ${m.venue}</span>
          </div>
          ${isKey ? chip("⭐ KEY MATCH", "key-chip") : ""}
        </div>

        <div class="match-body">
          <div class="opponent">
            <span class="flag">${m.opponent.flag}</span>
            <div class="opp-text">
              <span class="opp-name">USA <span class="vs">vs</span> ${m.opponent.name}</span>
              <span class="opp-note">${m.opponent.note}</span>
            </div>
            <div class="opp-rank">
              <span class="rank-num">#${m.opponent.fifaRank}</span>
              <span class="rank-lbl">FIFA</span>
            </div>
          </div>

          <div class="metrics">
            <div class="metric">
              <div class="metric-top"><span>Competitiveness</span><span>${comp}</span></div>
              ${meter(comp, "comp")}
            </div>
            <div class="metric">
              <div class="metric-top"><span>Stakes</span><span>${stk}</span></div>
              ${meter(stk, "stakes")}
            </div>
            <div class="metric">
              <div class="metric-top"><span>USA win chance</span><span>${winP}%</span></div>
              ${meter(winP, "winp")}
            </div>
          </div>
        </div>

        <div class="match-foot">
          <div class="toggle">${toggle}</div>
          <span class="type-tag ${m.type}">${
            m.type === "group" ? "Group · points" : "Knockout · win or out"
          }</span>
        </div>
      </article>`;
  }).join("");

  // Wire up the toggle buttons.
  list.querySelectorAll(".toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state[btn.dataset.match] = btn.dataset.result;
      saveState(state);
      render();
    });
  });
}

function renderSummary() {
  const path = evaluatePath();
  const el = document.getElementById("summary");

  let verdict, verdictClass, sub;
  if (path.isChampion) {
    verdict = "🏆 WORLD CHAMPIONS";
    verdictClass = "champ";
    sub = "USA wins it all. History made on home soil.";
  } else if (path.knockedOutAt === "Group Stage") {
    verdict = "❌ OUT IN THE GROUP";
    verdictClass = "out";
    sub = `Only ${path.points} pts — not enough to advance. The dream ends early.`;
  } else if (path.knockedOutAt) {
    verdict = `Eliminated · ${path.knockedOutAt}`;
    verdictClass = "out";
    sub = `A run to the ${path.knockedOutAt.toLowerCase()}, then the road ends.`;
  } else {
    verdict = "Run in progress";
    verdictClass = "live";
    sub = "Set every result to map the full path.";
  }

  const groupMatches = MATCHES.filter((m) => m.type === "group");
  const groupStatus = path.advanced
    ? path.wonGroup
      ? "Win the group"
      : "Through to the knockouts"
    : "Eliminated in group";

  el.className = `summary ${verdictClass}`;
  el.innerHTML = `
    <div class="verdict">
      <span class="verdict-main">${verdict}</span>
      <span class="verdict-sub">${sub}</span>
    </div>
    <div class="summary-stats">
      <div class="stat">
        <span class="stat-num">${path.points}</span>
        <span class="stat-lbl">Group pts</span>
      </div>
      <div class="stat">
        <span class="stat-num">${path.wins}-${path.draws}-${path.losses}</span>
        <span class="stat-lbl">Group W-D-L</span>
      </div>
      <div class="stat">
        <span class="stat-num">${path.roundsWon}</span>
        <span class="stat-lbl">KO rounds won</span>
      </div>
      <div class="stat">
        <span class="stat-num">${groupStatus}</span>
        <span class="stat-lbl">Group result</span>
      </div>
    </div>`;
}

// A short, dynamic "what USA needs to do" briefing based on the analysis.
function renderBriefing() {
  const el = document.getElementById("briefing");

  // Rank matches by key score to call out the decisive ones.
  const ranked = MATCHES.map((m, i) => ({
    m,
    key: keyScore(m, i),
    comp: competitiveness(m.opponent.rating),
    win: usaWinProb(m.opponent.rating),
  })).sort((a, b) => b.key - a.key);

  const mustWin = MATCHES.filter(
    (m) => usaWinProb(m.opponent.rating) >= 0.5 && m.type === "group"
  );
  const upsets = ranked.filter((r) => r.win < 0.4);

  const items = [
    `<li><strong>Bank the points early.</strong> Treat ${mustWin
      .map((m) => m.opponent.name)
      .join(" and ")} as must-wins — 6 pts there all but guarantees the knockouts.</li>`,
    `<li><strong>Circle the key match:</strong> ${ranked[0].m.stage} vs ${ranked[0].m.opponent.name} grades highest on stakes × competitiveness (${ranked[0].key}/100).</li>`,
    `<li><strong>Tightest games on paper:</strong> ${ranked
      .slice(0, 3)
      .map((r) => `${r.m.opponent.name} (${r.comp})`)
      .join(", ")} — margins decided by a single moment.</li>`,
    `<li><strong>Upsets required:</strong> to lift the trophy USA likely must topple ${upsets
      .map((r) => r.m.opponent.name)
      .join(", ")}. Defensive structure + set pieces are the equalizers.</li>`,
  ];

  el.innerHTML = `<h2>What USA needs to do</h2><ul>${items.join("")}</ul>`;
}

function render() {
  renderSummary();
  renderMatches();
  renderBriefing();
}

/* ------------------------------- controls -------------------------------- */

function setupControls() {
  document.getElementById("reset").addEventListener("click", () => {
    MATCHES.forEach((m) => (state[m.id] = "win"));
    saveState(state);
    render();
  });
  document.getElementById("realistic").addEventListener("click", () => {
    // A plausible deep run: handle the group, grind the early knockouts.
    state = {
      g1: "win",
      g2: "draw",
      g3: "win",
      r32: "win",
      r16: "draw",
      qf: "loss",
      sf: "loss",
      final: "loss",
    };
    saveState(state);
    render();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupControls();
  render();
});
