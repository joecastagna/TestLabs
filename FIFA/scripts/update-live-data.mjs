#!/usr/bin/env node
/*
 * Refreshes FIFA/live-data.json with the current Group D standings and USA's
 * finished results. Runs in GitHub Actions (full internet, no CORS), so it can
 * use real football data APIs.
 *
 * Providers, in priority order:
 *   1. football-data.org v4  — best quality, needs a FREE token in the
 *      FOOTBALL_DATA_TOKEN secret (https://www.football-data.org/client/register).
 *   2. TheSportsDB           — no key required (free test key), used as fallback.
 *
 * SAFETY: if no provider returns valid data, the script exits WITHOUT writing,
 * so the last-good committed snapshot (and the app) keep working. This is why
 * the app is always at least as fresh as the most recent successful run.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "live-data.json");
const SEASON = process.env.SEASON || "2026";

// Group D + identity, with name variants → our stable codes.
const TEAMS = {
  USA: ["united states", "usa", "united states of america"],
  AUS: ["australia"],
  TUR: ["türkiye", "turkiye", "turkey"],
  PAR: ["paraguay"],
};
const CODE_BY_NAME = (name) => {
  const n = (name || "").trim().toLowerCase();
  for (const [code, names] of Object.entries(TEAMS)) if (names.includes(n)) return code;
  return null;
};
const DISPLAY = { USA: "United States", AUS: "Australia", TUR: "Türkiye", PAR: "Paraguay" };
// USA's group fixtures in order → match ids used by the app.
const USA_FIXTURE_ORDER = ["PAR", "AUS", "TUR"]; // g1, g2, g3

function emptyRow(code) {
  return {
    team: DISPLAY[code],
    code,
    played: 0,
    win: 0,
    draw: 0,
    loss: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0,
  };
}

function buildOutput(standings, usaMatches, source) {
  return {
    generatedAt: new Date().toISOString(),
    source,
    season: SEASON,
    usaRating: currentUsaRatingFromFile(),
    group: { name: "Group D", standings, usaMatches },
  };
}

// Keep whatever rating the committed file already has (ratings are slow-moving).
function currentUsaRatingFromFile() {
  try {
    return JSON.parse(readFileSync(OUT, "utf8")).usaRating || 1659;
  } catch {
    return 1659;
  }
}

function validate(standings, usaMatches) {
  if (!Array.isArray(standings) || standings.length < 4) return false;
  if (!standings.some((r) => r.code === "USA")) return false;
  if (!standings.every((r) => typeof r.points === "number")) return false;
  return Array.isArray(usaMatches) && usaMatches.length === 3;
}

/* ---------------------------- football-data.org -------------------------- */
async function fromFootballData() {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) return null;
  const headers = { "X-Auth-Token": token };
  const base = "https://api.football-data.org/v4/competitions/WC";

  const standRes = await fetch(`${base}/standings?season=${SEASON}`, { headers });
  if (!standRes.ok) throw new Error("football-data standings HTTP " + standRes.status);
  const standJson = await standRes.json();

  // Find the group table that contains the USA.
  const groups = (standJson.standings || []).filter((s) => s.type === "TOTAL");
  let table = null;
  for (const g of groups) {
    if ((g.table || []).some((t) => CODE_BY_NAME(t.team && t.team.name) === "USA")) {
      table = g.table;
      break;
    }
  }
  if (!table) throw new Error("football-data: USA group not found");

  const standings = table
    .map((t) => {
      const code = CODE_BY_NAME(t.team.name);
      if (!code) return null;
      return {
        team: DISPLAY[code],
        code,
        played: t.playedGames || 0,
        win: t.won || 0,
        draw: t.draw || 0,
        loss: t.lost || 0,
        gf: t.goalsFor || 0,
        ga: t.goalsAgainst || 0,
        gd: t.goalDifference || 0,
        points: t.points || 0,
      };
    })
    .filter(Boolean);

  const matchRes = await fetch(`${base}/matches?season=${SEASON}`, { headers });
  if (!matchRes.ok) throw new Error("football-data matches HTTP " + matchRes.status);
  const matchJson = await matchRes.json();
  const usaMatches = buildUsaMatches(
    (matchJson.matches || [])
      .filter((m) => m.stage === "GROUP_STAGE")
      .map((m) => ({
        home: CODE_BY_NAME(m.homeTeam && m.homeTeam.name),
        away: CODE_BY_NAME(m.awayTeam && m.awayTeam.name),
        finished: m.status === "FINISHED",
        homeGoals: m.score && m.score.fullTime ? m.score.fullTime.home : null,
        awayGoals: m.score && m.score.fullTime ? m.score.fullTime.away : null,
      }))
  );

  return { standings, usaMatches, source: "football-data.org" };
}

/* ------------------------------ TheSportsDB ------------------------------ */
async function fromSportsDb() {
  const key = process.env.THESPORTSDB_KEY || "3";
  const league = process.env.THESPORTSDB_LEAGUE || "4429"; // FIFA World Cup
  const evRes = await fetch(
    `https://www.thesportsdb.com/api/v1/json/${key}/eventsseason.php?id=${league}&s=${SEASON}`
  );
  if (!evRes.ok) throw new Error("thesportsdb HTTP " + evRes.status);
  const evJson = await evRes.json();
  const events = (evJson.events || [])
    .map((e) => ({
      home: CODE_BY_NAME(e.strHomeTeam),
      away: CODE_BY_NAME(e.strAwayTeam),
      finished: (e.strStatus || "").toLowerCase().includes("match finished") || e.intHomeScore != null,
      homeGoals: e.intHomeScore != null ? Number(e.intHomeScore) : null,
      awayGoals: e.intAwayScore != null ? Number(e.intAwayScore) : null,
    }))
    .filter((e) => e.home && e.away); // Group D fixtures only

  if (!events.length) throw new Error("thesportsdb: no Group D events");

  // Derive standings from finished Group D matches.
  const tbl = {};
  for (const c of Object.keys(TEAMS)) tbl[c] = emptyRow(c);
  for (const e of events) {
    if (!e.finished || e.homeGoals == null || e.awayGoals == null) continue;
    const h = tbl[e.home];
    const a = tbl[e.away];
    h.played++; a.played++;
    h.gf += e.homeGoals; h.ga += e.awayGoals;
    a.gf += e.awayGoals; a.ga += e.homeGoals;
    if (e.homeGoals > e.awayGoals) { h.win++; h.points += 3; a.loss++; }
    else if (e.homeGoals < e.awayGoals) { a.win++; a.points += 3; h.loss++; }
    else { h.draw++; a.draw++; h.points++; a.points++; }
  }
  for (const c of Object.keys(tbl)) tbl[c].gd = tbl[c].gf - tbl[c].ga;
  const standings = Object.values(tbl);
  const usaMatches = buildUsaMatches(events);
  return { standings, usaMatches, source: "TheSportsDB" };
}

/* -------------------------- shared match builder ------------------------- */
function buildUsaMatches(groupMatches) {
  return USA_FIXTURE_ORDER.map((oppCode, i) => {
    const id = "g" + (i + 1);
    const m = groupMatches.find(
      (gm) =>
        (gm.home === "USA" && gm.away === oppCode) || (gm.away === "USA" && gm.home === oppCode)
    );
    if (!m || !m.finished || m.homeGoals == null || m.awayGoals == null) {
      return { id, opponentCode: oppCode, status: "scheduled" };
    }
    const usaHome = m.home === "USA";
    const usaGoals = usaHome ? m.homeGoals : m.awayGoals;
    const oppGoals = usaHome ? m.awayGoals : m.homeGoals;
    const result = usaGoals > oppGoals ? "win" : usaGoals < oppGoals ? "loss" : "draw";
    return { id, opponentCode: oppCode, status: "finished", usaGoals, oppGoals, result };
  });
}

/* --------------------------------- main --------------------------------- */
const providers = [fromFootballData, fromSportsDb];
let result = null;
for (const p of providers) {
  try {
    const r = await p();
    if (r && validate(r.standings, r.usaMatches)) {
      result = r;
      console.log(`✓ data from ${r.source}`);
      break;
    }
    if (r) console.warn(`✗ ${p.name}: data failed validation`);
  } catch (e) {
    console.warn(`✗ ${p.name}: ${e.message}`);
  }
}

if (!result) {
  console.log("No valid live data this run — keeping last-good live-data.json.");
  process.exit(0);
}

const out = buildOutput(result.standings, result.usaMatches, result.source);
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log("Wrote live-data.json:", JSON.stringify(out.group.standings.map((s) => `${s.code} ${s.points}`)));
