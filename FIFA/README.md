# 🇺🇸 USA Path to Glory — 2026 World Cup Simulator

A dynamic, no-build web app that maps what the **USA men's national team** needs
to do to win the 2026 FIFA World Cup. Toggle every match **Win / Draw / Loss**
and watch the group table, the knockout run, the verdict, and the
**key / most-competitive** matches all update live.

## What it does

- **Full path, one screen** — the three group games plus Round of 32 → Round of
  16 → Quarterfinal → Semifinal → Final, in the new 48-team 2026 format.
- **Toggle results** — set each match to Win, Draw, or Loss. Group games are
  scored on points (W=3, D=1, L=0); knockouts are win-or-out (a draw = survived
  on penalties).
- **Live verdict** — group points, W-D-L, knockout rounds won, and how far the
  run goes: out in the group, eliminated at a round, or **🏆 World Champions**.
- **Competitiveness meter** — how close each match is on paper (peaks when the
  two sides are evenly matched).
- **Stakes meter** — how much is riding on the result (rises through the rounds).
- **⭐ Key match** — the single most decisive game, scored on stakes ×
  competitiveness, is highlighted automatically.
- **"What USA needs to do" briefing** — auto-generated must-wins, the tightest
  games, and the upsets required to lift the trophy.
- **Persists** your scenario in the browser, plus quick presets ("Realistic run"
  and "Win it all").

## Run it

It's plain HTML/CSS/JS — no install, no build step. Either:

```bash
# from this folder
python3 -m http.server 8000
# then open http://localhost:8000
```

…or just open `index.html` directly in a browser.

## Customize

Opponents, FIFA ranks, and Elo-style strength `rating`s live in
[`data.js`](./data.js). Edit them to match the real draw and current form — all
the meters, probabilities, and the key-match pick recompute from those numbers.
The USA baseline strength is `USA_RATING` at the top of that file.

## Files

| File         | Purpose                                            |
| ------------ | -------------------------------------------------- |
| `index.html` | Page structure                                     |
| `styles.css` | Styling (USA navy/red theme)                       |
| `data.js`    | Match + opponent data and ratings                  |
| `app.js`     | Simulator logic, analysis math, and rendering      |

> Ratings and projected knockout opponents are an editable projection, not an
> official bracket.
