# 🇺🇸 USA Path to Glory — 2026 World Cup Simulator

A dynamic, no-build web app that maps what the **USA men's national team** needs
to do to win the 2026 FIFA World Cup. Toggle every match **Win / Draw / Loss**
and watch the group finish, **two diverging knockout roads**, the verdict, and
the **key / most-competitive** matches update live.

## The core idea: winning the group is the whole game

The group stage is the **real Group D draw** (Final Draw, 5 Dec 2025): USA with
🇵🇾 Paraguay, 🇦🇺 Australia and 🇹🇷 Türkiye. What happens next depends entirely on
where USA finishes:

- **Win Group D (1st)** → Round of 32 in Santa Clara vs a **best-third
  qualifier** — a soft, winnable draw.
- **Finish 2nd** → Round of 32 in Dallas vs the **Group G runner-up** (Belgium's
  group) — a top-10 side as your *first* knockout game.

The app makes that trade-off the centerpiece: a path selector and a side-by-side
win-probability comparison show exactly why topping the group matters.

## What it does

- **Real group, two projected roads** — 3 real Group D fixtures, then a full
  Round of 32 → R16 → QF → SF → Final that **changes** based on group finish.
- **Toggle every result** — group games are points-based (W=3, D=1, L=0);
  knockouts are win-or-out (a draw = survived on penalties).
- **Auto or manual path** — the knockout road is auto-picked from your points
  (≥7 → win group, 4–6 → 2nd), or force either road to compare.
- **Live verdict** — group points, W-D-L, finish, knockout rounds won, up to
  **🏆 World Champions**.
- **Competitiveness meter** — how close each game is (peaks on coin-flips).
- **Stakes meter** — how much is riding on it (rises through the rounds).
- **⭐ Key match** — the single most decisive game (stakes × competitiveness),
  highlighted automatically.
- **"What USA needs to do" briefing** — auto-generated must-wins, the decider,
  and the upsets required to lift the trophy.
- **Shareable scenarios** — every toggle is encoded in the URL; hit **Share** to
  copy a link that reproduces your exact bracket. Also persists locally.

## Run it

Plain HTML/CSS/JS — no install, no build step:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

…or just open `index.html` in a browser.

## Live data — it stays up to date automatically

The app **fetches current Group D standings on every load** (and via the
**↻ Refresh** button), so it tracks the real tournament:

- A **live status bar** shows whether you're seeing live data and how fresh it is.
- **Finished matches lock to their real scores** (e.g. USA 4–1 Paraguay) and
  can't be toggled; you simulate only the games not yet played.
- A **live Group D table** (P/W/D/L/GF/GA/GD/Pts) renders from the real standings,
  with the top-2 (advance) and 3rd (best-third race) lines marked.
- If the feed is ever unreachable, it **falls back silently** to the bundled
  projection — the app always works, including offline.

### How the freshness works

A scheduled GitHub Action ([`.github/workflows/update-wc-data.yml`](../.github/workflows/update-wc-data.yml))
runs every 30 minutes, fetches the latest standings via
[`scripts/update-live-data.mjs`](./scripts/update-live-data.mjs), and commits
the result to [`live-data.json`](./live-data.json). The page reads that file
fresh from GitHub (cache-busted), so any device always sees the latest snapshot.

- **No setup required** — the updater uses a no-key fallback source out of the box.
- **Optional, better data:** add a free [football-data.org](https://www.football-data.org/client/register)
  token as a repo secret named `FOOTBALL_DATA_TOKEN` and the updater will prefer it.
- The updater is **fail-safe**: if no source returns valid data, it leaves the
  last-good snapshot untouched.

## Data & accuracy

- **Live:** Group D standings and USA's finished results (auto-updated).
- **Real (static):** Group D opponents, dates, venues, FIFA rankings (June 2026),
  and the bracket rule that 1D and 2D take different Round-of-32 paths.
- **Projected (flagged `proj`):** knockout *opponents* past the Round of 32 —
  the real foes depend on results still to come.

Opponent strengths are Elo-style FIFA-points `rating`s in [`data.js`](./data.js);
every meter, probability, and the key-match pick recompute from those numbers.
USA's baseline is `USA_RATING` (overridable by the live feed).

## Files

| File                                  | Purpose                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `index.html`                          | Page structure                                         |
| `styles.css`                          | Styling (USA navy/red theme)                           |
| `data.js`                             | Static group/knockout data + live-feed config          |
| `app.js`                              | Simulator logic, live overlay, paths, sharing, render  |
| `live-data.json`                      | Latest standings snapshot (kept fresh by the Action)   |
| `scripts/update-live-data.mjs`        | Fetches & normalizes standings (runs in CI)            |
| `../.github/workflows/update-wc-data.yml` | Schedules the refresh                               |
| `standalone.html`                     | Single-file build (also fetches live data)             |
