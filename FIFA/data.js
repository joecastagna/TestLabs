/*
 * USA Path to Glory — data model for the 2026 FIFA World Cup
 *
 * The 2026 tournament uses a 48-team format: 12 groups of 4, with the top two
 * from each group plus the eight best third-placed teams advancing to a
 * Round of 32, then R16, Quarterfinal, Semifinal and Final.
 *
 * The USA co-hosts, so it is seeded into Group D as A1/D1 here. Opponents and
 * FIFA strength ratings below are a plausible projection used to drive the
 * simulator — edit them freely as the real draw and form settle.
 *
 * `rating` is an Elo-style strength score (higher = stronger). USA is the
 * baseline the competitiveness math compares every opponent against.
 */

const USA_RATING = 1640; // FIFA strength rating for the USMNT (approx. rank 16)

// Each match on USA's road to the final.
// stage:   label for the round
// type:    "group" (points-based) or "knockout" (win-or-out)
// opponent fields describe the projected foe and their pedigree.
const MATCHES = [
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
      rating: 1490,
      fifaRank: 56,
      note: "Gritty CONMEBOL side — winnable but never a gift.",
    },
  },
  {
    id: "g2",
    stage: "Group D · Matchday 2",
    type: "group",
    venue: "Lumen Field, Seattle",
    date: "2026-06-19",
    opponent: {
      name: "Senegal",
      code: "SEN",
      flag: "🇸🇳",
      rating: 1610,
      fifaRank: 19,
      note: "Athletic, deep, and dangerous. The group decider.",
    },
  },
  {
    id: "g3",
    stage: "Group D · Matchday 3",
    type: "group",
    venue: "Levi's Stadium, San Francisco",
    date: "2026-06-25",
    opponent: {
      name: "South Korea",
      code: "KOR",
      flag: "🇰🇷",
      rating: 1560,
      fifaRank: 23,
      note: "Relentless pressers led by world-class attackers.",
    },
  },
  {
    id: "r32",
    stage: "Round of 32",
    type: "knockout",
    venue: "AT&T Stadium, Dallas",
    date: "2026-06-30",
    opponent: {
      name: "Mexico (proj.)",
      code: "MEX",
      flag: "🇲🇽",
      rating: 1655,
      fifaRank: 14,
      note: "El Tri on neutral-but-hostile turf. A rivalry knockout.",
    },
  },
  {
    id: "r16",
    stage: "Round of 16",
    type: "knockout",
    venue: "Mercedes-Benz Stadium, Atlanta",
    date: "2026-07-04",
    opponent: {
      name: "Netherlands (proj.)",
      code: "NED",
      flag: "🇳🇱",
      rating: 1715,
      fifaRank: 7,
      note: "Total-football pedigree and ruthless in transition.",
    },
  },
  {
    id: "qf",
    stage: "Quarterfinal",
    type: "knockout",
    venue: "MetLife Stadium, New York/NJ",
    date: "2026-07-10",
    opponent: {
      name: "Brazil (proj.)",
      code: "BRA",
      flag: "🇧🇷",
      rating: 1840,
      fifaRank: 3,
      note: "Five-time champions. This is where legends are made.",
    },
  },
  {
    id: "sf",
    stage: "Semifinal",
    type: "knockout",
    venue: "AT&T Stadium, Dallas",
    date: "2026-07-14",
    opponent: {
      name: "France (proj.)",
      code: "FRA",
      flag: "🇫🇷",
      rating: 1865,
      fifaRank: 2,
      note: "Tournament machine with match-winners everywhere.",
    },
  },
  {
    id: "final",
    stage: "Final",
    type: "knockout",
    venue: "MetLife Stadium, New York/NJ",
    date: "2026-07-19",
    opponent: {
      name: "Argentina (proj.)",
      code: "ARG",
      flag: "🇦🇷",
      rating: 1880,
      fifaRank: 1,
      note: "Reigning champions. One game for everything.",
    },
  },
];

// Make available to app.js whether loaded as a module or plain script.
if (typeof window !== "undefined") {
  window.USA_RATING = USA_RATING;
  window.MATCHES = MATCHES;
}
