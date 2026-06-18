/*
 * USA Path to Glory — data model for the 2026 FIFA World Cup
 *
 * GROUP STAGE DATA IS REAL (Final Draw, 5 Dec 2025): the USA co-hosts and was
 * drawn into Group D with Paraguay, Australia and Türkiye. Dates, venues and
 * FIFA rankings below are the real ones.
 *
 * KNOCKOUTS DIVERGE BY GROUP FINISH — this is the heart of the strategy:
 *   • Win Group D (1D)  → Round of 32 in Santa Clara vs a best-third qualifier
 *                         (from Groups B/E/F/I/J): a softer, winnable draw.
 *   • Finish 2nd (2D)   → Round of 32 in Dallas vs the Group G runner-up
 *                         (Belgium's group): a brutal early test.
 * So the single biggest thing USA can do to ease the road is WIN THE GROUP.
 *
 * Knockout OPPONENTS past the Round of 32 are projections (the real foes depend
 * on results still to come) and are flagged `projected: true`. Edit any number
 * in this file and every meter, probability and the key-match pick recomputes.
 *
 * `rating` is the team's FIFA ranking points (an Elo-style strength score the
 * competitiveness math compares against the USA baseline).
 */

const USA_RATING = 1659; // USMNT — FIFA rank 17 (June 2026)

// ---- Group D — REAL fixtures -------------------------------------------------
const GROUP_MATCHES = [
  {
    id: "g1",
    stage: "Group D · Matchday 1",
    type: "group",
    venue: "SoFi Stadium, Los Angeles",
    date: "2026-06-12",
    opponent: {
      name: "Paraguay",
      code: "PAR",
      flag: "🇵🇾",
      rating: 1500,
      fifaRank: 41,
      note: "Lowest-ranked side in the group — the must-win.",
    },
  },
  {
    id: "g2",
    stage: "Group D · Matchday 2",
    type: "group",
    venue: "Lumen Field, Seattle",
    date: "2026-06-19",
    opponent: {
      name: "Australia",
      code: "AUS",
      flag: "🇦🇺",
      rating: 1588,
      fifaRank: 27,
      note: "Organized, physical Socceroos — a real banana skin.",
    },
  },
  {
    id: "g3",
    stage: "Group D · Matchday 3",
    type: "group",
    venue: "SoFi Stadium, Los Angeles",
    date: "2026-06-25",
    opponent: {
      name: "Türkiye",
      code: "TUR",
      flag: "🇹🇷",
      rating: 1622,
      fifaRank: 22,
      note: "Top-seed-quality talent — likely decides who wins the group.",
    },
  },
];

// ---- Knockout path A — WIN GROUP D (1D): the softer road ---------------------
const PATH_WIN_GROUP = [
  {
    id: "r32",
    stage: "Round of 32",
    type: "knockout",
    venue: "Levi's Stadium, Santa Clara",
    date: "2026-07-01",
    opponent: {
      name: "Best-third qualifier",
      code: "3RD",
      flag: "🎟️",
      rating: 1545,
      fifaRank: null,
      projected: true,
      note: "A best-third side from Groups B/E/F/I/J — beatable on form.",
    },
  },
  {
    id: "r16",
    stage: "Round of 16",
    type: "knockout",
    venue: "AT&T Stadium, Dallas",
    date: "2026-07-05",
    opponent: {
      name: "Japan (proj.)",
      code: "JPN",
      flag: "🇯🇵",
      rating: 1655,
      fifaRank: 18,
      projected: true,
      note: "Sharp, well-drilled — a coin-flip knockout.",
    },
  },
  {
    id: "qf",
    stage: "Quarterfinal",
    type: "knockout",
    venue: "Mercedes-Benz Stadium, Atlanta",
    date: "2026-07-10",
    opponent: {
      name: "Netherlands (proj.)",
      code: "NED",
      flag: "🇳🇱",
      rating: 1758,
      fifaRank: 7,
      projected: true,
      note: "Total-football pedigree — the step up to the elite.",
    },
  },
  {
    id: "sf",
    stage: "Semifinal",
    type: "knockout",
    venue: "AT&T Stadium, Dallas",
    date: "2026-07-14",
    opponent: {
      name: "Brazil (proj.)",
      code: "BRA",
      flag: "🇧🇷",
      rating: 1761,
      fifaRank: 6,
      projected: true,
      note: "Five-time champions. This is where legends are made.",
    },
  },
  {
    id: "final",
    stage: "Final",
    type: "knockout",
    venue: "MetLife Stadium, New York / New Jersey",
    date: "2026-07-19",
    opponent: {
      name: "Argentina (proj.)",
      code: "ARG",
      flag: "🇦🇷",
      rating: 1875,
      fifaRank: 1,
      projected: true,
      note: "Reigning champions. One game for everything.",
    },
  },
];

// ---- Knockout path B — FINISH 2ND (2D): the brutal road ----------------------
const PATH_RUNNER_UP = [
  {
    id: "r32",
    stage: "Round of 32",
    type: "knockout",
    venue: "AT&T Stadium, Dallas",
    date: "2026-07-02",
    opponent: {
      name: "Belgium (proj.)",
      code: "BEL",
      flag: "🇧🇪",
      rating: 1735,
      fifaRank: 9,
      projected: true,
      note: "Group G runner-up — a top-10 side as your FIRST knockout game.",
    },
  },
  {
    id: "r16",
    stage: "Round of 16",
    type: "knockout",
    venue: "Lincoln Financial Field, Philadelphia",
    date: "2026-07-04",
    opponent: {
      name: "Germany (proj.)",
      code: "GER",
      flag: "🇩🇪",
      rating: 1730,
      fifaRank: 10,
      projected: true,
      note: "Tournament aristocracy — no margin for error.",
    },
  },
  {
    id: "qf",
    stage: "Quarterfinal",
    type: "knockout",
    venue: "MetLife Stadium, New York / New Jersey",
    date: "2026-07-11",
    opponent: {
      name: "Spain (proj.)",
      code: "ESP",
      flag: "🇪🇸",
      rating: 1876,
      fifaRank: 2,
      projected: true,
      note: "World No. 2 and possession kings — a mountain.",
    },
  },
  {
    id: "sf",
    stage: "Semifinal",
    type: "knockout",
    venue: "AT&T Stadium, Dallas",
    date: "2026-07-15",
    opponent: {
      name: "France (proj.)",
      code: "FRA",
      flag: "🇫🇷",
      rating: 1877,
      fifaRank: 3,
      projected: true,
      note: "Match-winners everywhere. A semifinal for the ages.",
    },
  },
  {
    id: "final",
    stage: "Final",
    type: "knockout",
    venue: "MetLife Stadium, New York / New Jersey",
    date: "2026-07-19",
    opponent: {
      name: "Argentina (proj.)",
      code: "ARG",
      flag: "🇦🇷",
      rating: 1875,
      fifaRank: 1,
      projected: true,
      note: "Reigning champions. One game for everything.",
    },
  },
];

// ---- Live data ---------------------------------------------------------------
// The app fetches this JSON on load (and on Refresh) to overlay REAL current
// Group D standings and finished results on top of the bundled defaults above.
// It is kept fresh by a scheduled GitHub Action (.github/workflows/update-wc-data.yml).
// We read it from raw.githubusercontent (CORS-enabled, ~minutes-fresh) with a
// cache-buster so any device always sees the latest committed snapshot. If the
// fetch fails, the app silently falls back to the bundled projection.
const LIVE_CONFIG = {
  enabled: true,
  url: "https://raw.githubusercontent.com/joecastagna/TestLabs/main/FIFA/live-data.json",
};

// Expose to app.js (plain-script load).
if (typeof window !== "undefined") {
  window.USA_RATING = USA_RATING;
  window.GROUP_MATCHES = GROUP_MATCHES;
  window.PATH_WIN_GROUP = PATH_WIN_GROUP;
  window.PATH_RUNNER_UP = PATH_RUNNER_UP;
  window.LIVE_CONFIG = LIVE_CONFIG;
  // Backwards-compatible default path used before a group finish is known.
  window.MATCHES = GROUP_MATCHES.concat(PATH_WIN_GROUP);
}
