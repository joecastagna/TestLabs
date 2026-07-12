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
- `dashboard/` — mirror of `~/apps/home-dashboard` on the Ubuntu server: a small Node.js
  status dashboard (ping checks, HA health, Docker container status).
- `pihole/` — docker-compose for the local DNS resolver (see "Pi-hole / local DNS" below).
  Only the compose file is mirrored; `etc-pihole/` and `etc-dnsmasq.d/` (live state:
  gravity DB, query log) stay server-side only, never committed.

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

Source lives in `dashboard/`. To deploy a change:
```bash
scp dashboard/server.js dashboard/public/index.html joecastagna@192.168.0.186:~/apps/home-dashboard/
ssh joecastagna@192.168.0.186 "cd ~/apps/home-dashboard && docker compose up -d --build"
```
Then copy the file back here (or just re-push from here — this direction is source of
truth for the dashboard, unlike ha-config which the server can also mutate via the UI).

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

**Still needed — a manual step only you can do**: point the router's DHCP-assigned DNS
server at `192.168.0.186` (usually Router admin → LAN/DHCP settings → DNS Server field).
Until that's done, devices need to be manually configured to use `192.168.0.186` as their
DNS server, or continue relying on per-device `/etc/hosts` entries.

## Known issues (see startup-guide.md for details)

- Spectrum TV channel tuning was abandoned (July 2026) — don't revive it, it's a dead end.
- `media_player.living_room` is a ghost Cast group; delete from the Google Home app.
- HA MCP integration enabled but untested.

## Keeping this in sync

Nothing here auto-syncs with the servers. Home Assistant's UI/automation editor and the
dashboard's docker-compose can both change files server-side without this repo knowing.
When in doubt, treat the server as ground truth and re-pull before editing.
