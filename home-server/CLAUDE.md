# Home Server

Single source of truth for Joe's home lab: a Home Assistant OS VM and an Ubuntu Docker
VM, both hosted on a UTM-virtualized iMac. This directory mirrors the live server
configs — it is not automatically synced, see "Keeping this in sync" below.

## Layout

- [`docs/startup-guide.md`](docs/startup-guide.md) — full reference: hosts, network map,
  entities, speakers, TVs, known issues, useful commands.
- `ha-config/` — mirror of the Home Assistant `/config` dir (automations, configuration,
  scenes, scripts). Secrets (`secrets.yaml`, `.storage/`, service-account JSON) are
  intentionally excluded — this repo is public.
- `dashboard/` — mirror of `~/apps/home-dashboard` on the Ubuntu server: a Node.js command
  center (telemetry, service launcher with DNS fallback, Docker controls, Pi-hole pause,
  live log stream, command palette). See "Working with the dashboard" below.
- `pihole/` — docker-compose for the local DNS resolver (see "Pi-hole / local DNS" below).
  Only the compose file is mirrored; `etc-pihole/` and `etc-dnsmasq.d/` (live state:
  gravity DB, query log) stay server-side only, never committed.
- `homepage/` — docker-compose + config for [Homepage](https://gethomepage.dev), a static
  start page linking out to the other services (see "Homepage (start page)" below).

## Hosts

| Host | Address | Role |
|---|---|---|
| HA server | `root@192.168.0.121` | Home Assistant OS VM |
| Ubuntu server | `joecastagna@192.168.0.186` | Docker host: dashboard, Nginx Proxy Manager, Portainer |
| iMac | `joecastagna@192.168.0.89` | UTM host for both VMs |

SSH key auth works to all three from the MacBook. Credentials (Ubuntu password, HA
long-lived token) are **not** in this repo — see `secrets.local.md` locally (gitignored)
or `~/.zshrc` (`HASS_TOKEN`, `HASS_SERVER`).

## Working with Home Assistant config

Use the `home-assistant-manager` Claude Code skill for any HA automation/config work —
it has the full deploy pipeline (edit → validate → push → pull → reload/restart →
verify), modern automation syntax rules, and template gotchas.

This repo's `ha-config/` is a **snapshot**, not a live git clone of the server. To make a
change live:
1. Edit the file here (or pull the current version from the server first if it may have
   drifted — `scp root@192.168.0.121:/config/automations.yaml ha-config/`).
2. Validate and deploy per the skill's pipeline (`ha core check`, then scp/reload or
   restart).
3. Copy the deployed file back here and commit, so this repo stays the record of what's
   actually running.

Never commit `secrets.yaml`, `.storage/*`, or the Google service-account JSON — they stay
server-side only.

## Working with the dashboard

Rewritten July 2026 as a rack-console command center (see `dashboard/public/index.html`
and `dashboard/server.js`). Source lives in `dashboard/`. To deploy a change:
```bash
scp dashboard/server.js dashboard/docker-compose.yml joecastagna@192.168.0.186:~/apps/home-dashboard/
scp dashboard/public/index.html joecastagna@192.168.0.186:~/apps/home-dashboard/public/index.html
ssh joecastagna@192.168.0.186 "cd ~/apps/home-dashboard && docker compose up -d --build"
```
Then copy the file back here (or just re-push from here — this direction is source of
truth for the dashboard, unlike ha-config which the server can also mutate via the UI).

**`docker.sock` is mounted read-write**, not read-only — required for the container
restart/stop/start controls. This is a real security tradeoff: read-write access to the
host's Docker socket is close to root-equivalent control of the whole host (spawn
privileged containers, mount the host filesystem, etc.). The app only exposes this
through a fixed allowlist (`CONTROLLABLE` in `server.js` — `home-dashboard`,
`nginx-proxy-manager`, `portainer`, `pihole`) with no raw Docker API passthrough, but the
mount itself grants more than that. Don't expose this dashboard's port outside the LAN.

**`~/apps/home-dashboard/.env`** on the server holds `PIHOLE_PASSWORD` (same password as
`~/apps/pihole/.env`) — not committed, not mirrored here. The dashboard authenticates to
Pi-hole's v6 REST API (`/api/auth` → session id → `/api/dns/blocking`) to read/pause
blocking status; sessions are cached and refreshed automatically.

**Docker log streaming** (`/api/logs/stream`, SSE) demuxes Docker's raw log frame format
(8-byte header: stream type + big-endian payload size) manually — there's no dependency
for this, just a small stateful parser in `server.js`.

**Smart fallback routing**: on page load, the frontend probes each `.home` name with a
600ms-timeout `fetch(..., {mode:'no-cors'})` against the client's *own* DNS resolver (not
the server's) — a rejected/timed-out promise means that browser can't resolve or reach the
name, and the UI swaps that service's primary link to the raw IP:port and shows an "IP
FALLBACK" badge. This is why it can show fallback active on one device while working fine
on another — it reflects whatever DNS *that specific browser* is using, which matters
while devices are still catching up to the Pi-hole DHCP change (see below).

## Pi-hole / local DNS

Runs on the Ubuntu server (`~/apps/pihole`), added July 2026 so LAN hostnames
(`dashboard.home`, `ha.home`, etc.) resolve on every device, not just the MacBook's
`/etc/hosts`. Admin UI: `http://192.168.0.186:8080/admin/` (password in
`secrets.local.md`).

- **Port 8080 for admin UI, not 80** — Nginx Proxy Manager already owns 80/81/443 on this
  host.
- **DNS port binds to `192.168.0.186:53` explicitly, not `0.0.0.0`** — a wildcard bind
  conflicts with systemd-resolved's loopback stub listeners (`127.0.0.53`/`127.0.0.54`)
  even though the addresses don't overlap; Linux won't let a wildcard bind coexist with a
  specific one on the same port.
- **`dns.listeningMode` must be `"ALL"`, not the default `"LOCAL"`** — in Docker bridge
  networking Pi-hole misjudges LAN client IPs as "non-local" and silently drops their
  queries otherwise. This is the #1 "Pi-hole works from the host but not other devices"
  Docker gotcha.
- Local records are set via the Pi-hole v6 REST API (`dns.hosts` config key), not the old
  `pihole -a -addcustomdns` CLI (removed in v6). Editing `pihole.toml` directly while FTL
  is running is discouraged; use the API or the admin UI (Settings → Local DNS Records).

**Router DHCP is pointed at it (done July 2026)**: TP-Link router (Advanced → Network →
DHCP Server) has Primary DNS `192.168.0.186`, Secondary DNS `1.1.1.1` (Cloudflare
fallback — if the Ubuntu server is down, devices still get normal internet DNS, just not
`.home` names or ad-blocking until it's back). Devices pick this up on their next DHCP
lease renewal (up to ~2 hours), or immediately if you toggle Wi-Fi off/on.

Current local DNS records (`dns.hosts`): `dashboard.home`, `ha.home`, `npm.home`,
`portainer.home`, `pihole.home` — all mirrored with their real IP:port in
[`docs/startup-guide.md`](docs/startup-guide.md) and on the dashboard's "Local DNS" panel.
Always keep both forms documented side by side: the `.home` name is convenient but
depends on Pi-hole being up; the IP:port always works.

## Homepage (start page)

[Homepage](https://gethomepage.dev) is a static link/status page for the whole lab, added
July 2026. Source in `homepage/`.
```bash
scp -r homepage/docker-compose.yml homepage/config joecastagna@192.168.0.186:~/apps/homepage/
ssh joecastagna@192.168.0.186 "cd ~/apps/homepage && docker compose up -d"
```
Then copy any config changes made server-side back here and commit — this direction is
source of truth, same as the dashboard.

- **Port 3001**, not the default 3000 — `home-dashboard` already owns 3000 on this host.
- **`docker.sock` mounted read-only** — enables the Docker widget (container name/state
  shown on each service card) without granting start/stop/restart control. Far less risky
  than the dashboard's read-write mount, but a read-only socket still exposes all
  container names, images, and env-derived labels on the host to anything that can reach
  the Homepage container.
- **`config/`** (`settings.yaml`, `services.yaml`, `widgets.yaml`, `bookmarks.yaml`,
  `docker.yaml`) is bind-mounted, so edits here take effect on the next
  `docker compose up -d` (most Homepage config is hot-reloaded, no rebuild needed).
- **Pi-hole widget** reads `PIHOLE_PASSWORD` via `HOMEPAGE_VAR_PIHOLE_PASSWORD` (same
  `.env` file/value as `pihole/` and `dashboard/` already use on the server).
- NPM and Portainer service cards don't yet have `container:` mappings in
  `services.yaml` — fill those in with the real container names on the server if you want
  live status for them too.
- Needs an NPM proxy host (`homepage.home` → `192.168.0.186:3001`) and a Pi-hole local DNS
  record for `homepage.home`, same as the other `.home` names — neither is done yet since
  both live server-side.

## Known issues (see startup-guide.md for details)

- Spectrum TV channel tuning was abandoned (July 2026) — don't revive it, it's a dead end.
- `media_player.living_room` is a ghost Cast group; delete from the Google Home app.
- HA MCP integration enabled but untested.

## Keeping this in sync

Nothing here auto-syncs with the servers. Home Assistant's UI/automation editor and the
dashboard's docker-compose can both change files server-side without this repo knowing.
When in doubt, treat the server as ground truth and re-pull before editing.
