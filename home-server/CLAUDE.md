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
  center (telemetry, service launcher with mDNS fallback, Docker controls, Pi-hole pause,
  live log stream, command palette). See "Working with the dashboard" below.
- `pihole/` — docker-compose for the network-wide ad blocker (see "Pi-hole / ad blocking"
  below). Only the compose file is mirrored; `etc-pihole/` and `etc-dnsmasq.d/` (live
  state: gravity DB, query log) stay server-side only, never committed.
- No directory for local name resolution — that's mDNS (Avahi), config lives entirely in
  systemd unit files on the Ubuntu server, nothing to mirror (see "Local names
  (mDNS/.local)" below).
- `homepage/` — docker-compose + config for [Homepage](https://gethomepage.dev), a static
  start page linking out to the other services (see "Homepage (start page)" below).
- `memos/` — docker-compose for [Memos](https://usememos.com), a self-hosted micro-notes
  app (see "Memos" below).

## Hosts

| Host | Address | Role |
|---|---|---|
| HA server | `root@192.168.0.121` | Home Assistant OS VM |
| Ubuntu server | `joecastagna@192.168.0.186` | Docker host: dashboard, Nginx Proxy Manager, Portainer |
| iMac | `joecastagna@192.168.0.89` | UTM host for both VMs |

SSH key auth works to all three from the MacBook. Credentials (Ubuntu password, HA
long-lived token) are **not** in this repo — see `secrets.local.md` locally (gitignored)
or `~/.zshrc` (`HASS_TOKEN`, `HASS_SERVER`).

**From the iMac specifically** (a separate machine from the MacBook, even though it's also
one of the three hosts above): `~/.ssh/config` needed its own fix. It already had a
`Host homeserver` alias with the right `IdentityFile` for the Ubuntu server, but no stanza
matching the bare IP `192.168.0.186` — so `ssh joecastagna@192.168.0.186` (as opposed to
`ssh homeserver`) failed with `Permission denied (publickey,password)` even though the key
itself (`~/.ssh/id_ed25519_homeserver`) was already installed server-side. Fixed by adding
a second `Host 192.168.0.186` stanza pointing at the same `IdentityFile`. Worth checking
for the same gap if SSH-by-IP ever fails from a machine that already has a working
alias-based config.

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
and `dashboard/server.js`). Source lives in `dashboard/`.

**UI rebranded to "MyDash" (July 2026)** — this is branding only: the `<title>`, header
wordmark, and footer text changed from "HOME/OPS" to "MyDash"/"MYDASH". The container name
(`home-dashboard`), the compose service name, the directory (`dashboard/` here,
`~/apps/home-dashboard/` on the server), and the `CONTROLLABLE` allowlist entry are all
**unchanged** and still say `home-dashboard`. If you're scripting or grepping for the
dashboard, keep using `home-dashboard`; "MyDash" is only what a user sees in the browser.
(The DNS/mDNS name it's reached at is a separate thing again — see "Local names
(mDNS/.local)" below; it moved from `dashboard.home` to `dashboard.local` in the same July
2026 change that retired `.home` entirely.)

The services rack now also has tiles for Homepage and Memos, added the same way as the
original four (HA, NPM, Portainer, Pi-hole) — see "Homepage" and "Memos" below for those
services themselves. Adding another service tile means updating two arrays in parallel:
`HOSTS` in `server.js` (drives the server-side ping/HTTP health check exposed at
`/api/status`) and `SERVICES` in `public/index.html` (drives the tile UI itself, with
`home`/`ip` fields for the DNS-name and IP-fallback links and a `statusKey` back-reference
to the matching `HOSTS` entry). Forgetting one half of that pair is an easy way to add a
service that either doesn't render or never gets health-checked.

An overnight audit pass (July 2026) fixed several bugs found this way — a stale hardcoded
service count in the UI, a header status check that silently excluded newly-added
services, unbounded timeouts on the Docker/Pi-hole backend calls, and a couple of
accessibility gaps — plus a real CSS bug where the logs drawer could render as a raw,
unstyled color gradient instead of collapsing properly on iOS Safari (a `transform:
translateY(calc(100%...))` on a `position: fixed` element doesn't reliably resolve on
WebKit; fixed by collapsing the log panel via `height` instead, with its own explicit
background rather than relying solely on the parent's `backdrop-filter` to composite
through). Nothing about this changed the deploy process below. To deploy a change:
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

**Smart fallback routing**: on page load, the frontend probes each service's `.local`
(mDNS) name with a 600ms-timeout `fetch(..., {mode:'no-cors'})` against the client's *own*
resolver (not the server's) — a rejected/timed-out promise means that browser can't
resolve or reach the name, and the UI swaps that service's primary link to the raw IP:port
and shows an "IP FALLBACK" badge. This is why it can show fallback active on one device
while working fine on another — it reflects whatever that specific browser/OS's mDNS
support looks like (see "Local names (mDNS/.local)" below — this matters most for Android,
which has patchier `.local` support than macOS/iOS). Also worth knowing: this same probe
briefly showed a false fallback for the Home Assistant tile in testing — not a DNS
problem, HA's self-signed HTTPS cert makes any `fetch()` from a browser profile that
hasn't already manually accepted that cert warning fail near-instantly, which reads
identically to a DNS failure from this probe's perspective.

## Pi-hole / ad blocking

Runs on the Ubuntu server (`~/apps/pihole`), added July 2026. Admin UI:
`http://192.168.0.186:8080/admin/` (password in `secrets.local.md`).

**As of July 2026, Pi-hole's job is ad blocking only** — it no longer serves local DNS
records for `.home` names. It used to do both (see "Local names (mDNS/.local)" below for
why that changed and what replaced it), but every device on the LAN should still point at
it as their DNS server for the blocking to apply.

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

**Router DHCP is pointed at it (done July 2026)**: TP-Link router (Advanced → Network →
DHCP Server) has Primary DNS `192.168.0.186`, Secondary DNS `1.1.1.1` (Cloudflare
fallback — if the Ubuntu server is down, devices still get normal internet DNS, just
without ad blocking until it's back). Devices pick this up on their next DHCP lease
renewal (up to ~2 hours), or immediately if you toggle Wi-Fi off/on. **This only covers
IPv4** — see the IPv6 note below, which is what actually broke `.home` names and is why
they were retired in favor of mDNS.

## Local names (mDNS/.local)

**Replaced the old Pi-hole-DNS-record `.home` scheme entirely, July 2026.** Every service
that used to be `name.home` is now `name.local`, resolved via mDNS (Avahi/Bonjour) instead
of a central DNS server. If you're looking for how `dashboard.home` used to work, it
doesn't anymore — this section is what replaced it, and the "why" is worth understanding
before touching any of this again.

**Why the old scheme broke**: the router hands out two *separate* DNS configurations that
don't agree — IPv4 via DHCP (correctly pointed at Pi-hole) and IPv6 via Router
Advertisement/RDNSS (still pointing at the ISP's own public IPv6 resolvers, a completely
independent mechanism unaffected by the IPv4 DHCP setting). Every modern device does IPv6
by default and gets both. When an OS resolver has multiple nameservers, it uses the first
one that gives a *definitive* answer, success or fail — and the ISP's IPv6 resolver
answers `.home` queries immediately and authoritatively with "no such domain" (it's a real
public TLD-adjacent resolver, it's just never heard of your Pi-hole records), so devices
never even got as far as asking Pi-hole. Normal websites still resolved fine through the
same IPv6 server, which is exactly why this was so confusing to diagnose — it looked like
`.home` "just didn't work" with no obvious pattern, on both Joe's phone and the iMac.

**Why mDNS instead of fixing the router**: mDNS isn't a DNS resolver that can get shadowed
by resolver precedence — it's a separate multicast protocol, natively supported by
macOS/iOS with zero client configuration, so this class of bug structurally can't recur.
The alternative (find and disable IPv6 RA/RDNSS on the TP-Link router) was considered and
rejected for now — unverified whether the router firmware even exposes that granular a
toggle, versus mDNS being knowable-to-work today.

**How it's set up** (Ubuntu server, `192.168.0.186`, hostname `cascla-u-serv`):
```bash
sudo apt-get install -y avahi-daemon avahi-utils
```
- **`allow-interfaces=enp0s1`** in `/etc/avahi/avahi-daemon.conf` — without this, Avahi
  also announces on `docker0` and any docker-compose bridge networks, and its own base
  hostname (`cascla-u-serv.local`) resolved to a *Docker bridge IP* (`172.21.0.1`) instead
  of the real LAN IP until this was set. Always check this first if `.local` resolves to
  something that looks like a container-internal address.
- **Per-service aliases** are published via `avahi-publish -a`, one process per
  name+address-family, managed by two systemd template units:
  `/etc/systemd/system/avahi-alias@.service` (IPv4, `avahi-publish -a -R %i.local
  192.168.0.186`) and `avahi-alias-v6@.service` (IPv6 ULA,
  `fdd9:2d63:9e1c:6eab:80b3:2fff:fec6:6511` — the stable ULA address on `enp0s1`, not the
  global/ISP-delegated one, since that can change with prefix re-delegation). `-R`
  (no-reverse) matters here: six different names all point at the same IP, and without
  `-R` each `avahi-publish` process fights the others over who owns the reverse PTR record
  for that address.
- **Both address families are required, not optional** — publishing only the IPv4 (A)
  record caused an ~9 second hang on first load in testing (confirmed via
  `performance.getEntriesByType('navigation')[0].domainLookupStart/End`, and reproduced
  with plain `curl` too — `curl -4` returned instantly, no flag was ~9s). The browser/OS
  does a dual-stack (A + AAAA) lookup and some resolvers wait out a real timeout on the
  *missing* AAAA before falling back to the working A record, rather than failing fast.
  Publishing an AAAA (IPv6) record for every alias fixed it — DNS lookup dropped to
  0–2ms. If you add a new alias later and it feels slow to load the first time, this is
  almost certainly why — check both `avahi-alias@<name>` and `avahi-alias-v6@<name>` are
  enabled and active.
- **To add a new alias**: `sudo systemctl enable --now avahi-alias@<name>
  avahi-alias-v6@<name>` (both, per above) — no daemon-reload needed for a new instance of
  an existing template.

**Current names** — every one of these needs its **explicit port**, since none of them go
through Nginx Proxy Manager anymore (see the NPM note below):

| Name | Port |
|---|---|
| `dashboard.local` | 3000 |
| `homepage.local` | 3001 |
| `memos.local` | 5230 |
| `portainer.local` | 9000 |
| `npm.local` | 81 |
| `pihole.local` | 8080/admin/ |

**`homeassistant.local` needed zero setup** — Home Assistant OS publishes its own mDNS
record natively (this is a standard, well-known HAOS feature). It resolves and serves
HTTPS correctly with no changes on the HA server, which this repo has no working SSH
access to anyway (see "Hosts" above).

**Nginx Proxy Manager is now unused for local naming.** It previously proxied
`dashboard.home` and `homepage.home` on port 80 so those two didn't need a port in the
URL — that convenience is gone under the `.local` scheme (every name needs its port now,
see table above), a deliberate tradeoff to avoid depending on NPM admin credentials, which
weren't available when this was set up. NPM's two old proxy hosts for those names are now
orphaned dead config — harmless, but worth deleting next time you're in the NPM admin UI
(`http://npm.local:81`). If NPM credentials become available later, re-adding proxy hosts
for `dashboard.local`/`homepage.local` → their ports would restore the no-port
convenience for just those two, without touching anything else here.

**Known limitation**: Android's mDNS/`.local` support is historically inconsistent across
versions/OEMs, unlike macOS/iOS's native zero-config support. Not an issue for any current
device on this LAN, but worth knowing if an Android device or guest ever needs these
names.

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
- All service cards now have `container:` mappings in `services.yaml`, including NPM and
  Portainer (their status widget is separately disabled/pending API keys — see the
  Portainer entry's comment in the file).
- **`HOMEPAGE_ALLOWED_HOSTS` is required**, or every request gets rejected with "Host
  validation failed" (a DNS-rebinding protection added in newer Homepage versions — it
  allowlists incoming `Host` headers, not just IP reachability). Discovered when accessing
  Homepage by raw IP:port from a phone failed even though `curl` from the Ubuntu server
  itself returned 200 (the health-check request's `Host` header happened to already match,
  masking the issue). Hit **again** when `.home` was retired for `.local` (July 2026) — the
  new hostname needed adding too, same symptom. Whenever a new way of reaching Homepage is
  added, add it here or it rejects with this error:
  ```yaml
  environment:
    HOMEPAGE_ALLOWED_HOSTS: "homepage.local:3001,192.168.0.186:3001"
  ```
  It does not wildcard by default (though `"*"` is supported if you'd rather trade the
  DNS-rebinding protection for convenience on this LAN-only service).
- **Docker socket permissions**: the socket is `root:docker` (GID `983` on this host, not
  `joecastagna`'s primary group) at `660` — the container must run with that group
  (`PGID: 983` in `docker-compose.yml`) or every Docker status lookup fails silently with
  `EACCES` in the logs, and every service card shows no status at all.
- **URL**: `http://homepage.local:3001` — see "Local names (mDNS/.local)" above for why
  it's `.local` now, not `.home`, and why it needs the port (no NPM proxy).

## Memos

[Memos](https://usememos.com) is a self-hosted micro-notes app, added July 2026. Source
in `memos/`.
```bash
scp memos/docker-compose.yml joecastagna@192.168.0.186:~/apps/memos/
ssh joecastagna@192.168.0.186 "cd ~/apps/memos && docker compose up -d"
```
Then copy any config changes made server-side back here and commit — same source-of-truth
direction as the dashboard and Homepage.

- **Image**: `ghcr.io/usememos/memos:stable` — note this is the GitHub Container Registry
  path, not the `neosmemo/memos` name still shown in some of Memos' own docs/README; GHCR
  is the actively-maintained one.
- **Port 5230** (Memos' own default), which was free on this host at the time (3000
  dashboard, 3001 Homepage, 80/81/443 NPM, 9000 Portainer, 8080 Pi-hole admin, 53 DNS).
- **Data volume**: `./data:/var/opt/memos`, bind-mounted, same pattern as Homepage's
  `./config`.
- **URL**: `http://memos.local:5230` — see "Local names (mDNS/.local)" above; needs the
  port like every other `.local` name now, no NPM involved.
- **`docker.sock` not mounted** — Memos doesn't need Docker awareness, unlike Homepage's
  read-only mount for its container-status widget.

## Known issues (see startup-guide.md for details)

- Spectrum TV channel tuning was abandoned (July 2026) — don't revive it, it's a dead end.
- `media_player.living_room` is a ghost Cast group; delete from the Google Home app.
- HA MCP integration enabled but untested.
- NPM has two orphaned proxy hosts (`dashboard.home`, `homepage.home`) left over from the
  `.home` → `.local` migration — harmless, but worth deleting next time you're logged into
  the NPM admin UI (`http://npm.local:81`).
- The router's IPv6-DNS-bypasses-Pi-hole issue (see "Local names (mDNS/.local)") was never
  fixed at the router level — mDNS sidesteps it for the services documented here, but it'd
  still affect anything else that relies on Pi-hole's DNS overrides specifically over IPv6
  in the future.

## Keeping this in sync

Nothing here auto-syncs with the servers. Home Assistant's UI/automation editor and the
dashboard's docker-compose can both change files server-side without this repo knowing.
When in doubt, treat the server as ground truth and re-pull before editing.
