# Home Server Startup Guide

## Quick Access

| Resource | URL / Command |
|---|---|
| **Home Dashboard** | http://dashboard.home |
| **Home Assistant** | https://192.168.0.121:8123 |
| **HA (DuckDNS)** | https://joecastagna-ha.duckdns.org:8123 |
| **Portainer** | http://192.168.0.186:9000 |
| **Nginx Proxy Manager** | http://192.168.0.186:81 |
| **SSH - HA Server** | `ssh root@192.168.0.121` |
| **SSH - Ubuntu Server** | `ssh joecastagna@192.168.0.186` |
| **SSH - iMac** | `ssh joecastagna@192.168.0.89` |

## Network Map

```
MacBook (you) ── LAN ── iMac (192.168.0.89, UTM host)
                           ├── Ubuntu VM (192.168.0.186) ── Docker
                           │     ├── home-dashboard (port 3000, proxied via NPM on :80)
                           │     ├── nginx-proxy-manager (ports 80/81/443)
                           │     └── portainer (port 9000)
                           └── HA OS VM (192.168.0.121:8123) ── Home Assistant
```

## SSH Keys & Auth

- **MacBook → HA Server**: SSH key auth works (`ssh root@192.168.0.121`)
- **MacBook → Ubuntu Server**: SSH key auth works (`ssh joecastagna@192.168.0.186`)
- **Ubuntu password**: see `secrets.local.md` (not in this repo)
- **HA API Token (JWT)**: stored in `.zshrc` as `HASS_TOKEN`, also in `/config/.storage/auth` on the HA server. Value kept out of this public repo — see `secrets.local.md`.
- **NPM login**: `joecastagna@gmail.com` (password changed from default during initial setup; already logged in via browser session)

### Quick API test from MacBook

```bash
curl -sk https://192.168.0.121:8123/api/ -H "Authorization: Bearer $HASS_TOKEN"
```

### Quick API test from HA SSH add-on

```bash
curl -sk https://172.30.32.1:8123/api/ -H "Authorization: Bearer $HA_TOKEN"
```

Note: From inside the HA SSH add-on, use `172.30.32.1:8123` (internal supervisor address), not `192.168.0.121`.

## Tools Installed

### On MacBook

- **hass-cli**: `hass-cli state list` (aliased with `--insecure` for self-signed cert)
- **Env vars in `~/.zshrc`**: `HASS_SERVER`, `HASS_TOKEN`
- **Claude skill**: `~/.claude/skills/home-assistant-manager/` (HA expertise skill)
- **`/etc/hosts`**: `192.168.0.186 dashboard.home`

### On HA SSH Add-on (Alpine, does NOT persist across add-on restarts)

- **ADB**: `apk add android-tools` (must reinstall after add-on restart)
- **Python3**: available, `pyyaml` installed
- **pychromecast/gtts**: installed

### On Ubuntu Server

- **Docker + Docker Compose**: running
- **Node.js**: inside home-dashboard container

## Key HA Config Files

All on HA server at `/config/`, mirrored in [`../ha-config/`](../ha-config/):

| File | Purpose |
|---|---|
| `automations.yaml` | All automations |
| `configuration.yaml` | Main config, input_booleans, recorder excludes |
| `scripts/tune_spectrum.sh` | UNUSED — Spectrum tuning abandoned July 2026, CNN automation deleted |
| `SPECTRUM_TV_AUTOMATION.md` | Docs on the abandoned Spectrum TV ADB automation |
| `TTS_GUIDE.md` | TTS quick reference for Google speakers |
| `.storage/auth` | Auth storage with long-lived token — **not in this repo** |
| `.storage/core.config_entries` | Integration config entries — **not in this repo** |

## Working Automations (as of July 11, 2026)

| Automation | ID | Trigger |
|---|---|---|
| Office Off Weeknights | `office_off_weeknights` | 2:00 AM Sun-Thu, TTS warning + 2min cancel window |
| TV Bed Lights Off | `1783798571903` | Pillow TV turns on after 8:08 PM |
| Mets Game Start | `mets_game_start_gemini` | Sensor PRE → IN |
| Mets Score Update | `mets_score_gemini` | team_score attribute changes |
| Mets Game End | `mets_game_end_gemini` | Sensor IN → POST |
| FIFA WC Kickoff 5min | `fifa_wc_kickoff_5min` | Template: 5 min before kickoff |
| FIFA WC Halftime | `fifa_wc_halftime` | Template: halftime detected |
| FIFA WC Game Start | `fifa_wc_game_start` | Template: kickoff detected |

### Gemini/AI Automations Pattern (fixed July 11)

All Mets + FIFA automations use this pattern:

```yaml
- data:
    task_name: "Descriptive Name"
    instructions: >-
      <Jinja2 template prompt>
    entity_id: ai_task.google_ai_task
  response_variable: gemini_response
  action: ai_task.generate_data
- data:
    message: '{{ gemini_response.data }}'
  action: notify.mobile_app_joe_castagnas_iphone_14_max_2022
- target:
    entity_id: tts.google_ai_tts
  data:
    media_player_entity_id: media_player.office_speaker  # one per call
    message: '{{ gemini_response.data }}'
  action: tts.speak
```

Key rules:
- **One `tts.speak` per speaker** — lists don't work, split into separate action blocks
- **TTS entity**: `tts.google_ai_tts` (NOT `tts.google_generative_ai_conversation`)
- **Response field**: `gemini_response.data` (NOT `.text`)

## Speakers

| Entity | Location | Notes |
|---|---|---|
| `media_player.office_speaker` | Office | Nest Mini, primary test speaker |
| `media_player.bedroom_speaker` | Bedroom | Volume was at 10%, set to 50% |
| `media_player.kitchen_speaker` | Kitchen | |
| `media_player.living_room` | Ghost | Cast Group, not a real device — to be deleted from Google Home app |
| `media_player.office_speakers` | Group | Cast group |
| `media_player.everywhere` | Group | Cast group, unreliable |

**TTS quick test** (run from HA server, with `HA_TOKEN` set — see `secrets.local.md`):

```bash
curl -sk -X POST https://172.30.32.1:8123/api/services/tts/speak \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity_id":"tts.google_translate_en_com","media_player_entity_id":"media_player.office_speaker","message":"Hello from Home Assistant"}'
```

## TVs

| Device | IP | ADB Port | Cast entity | Remote entity |
|---|---|---|---|---|
| Window TV | 192.168.0.141 | 5555 | `media_player.window_tv` | `media_player.window_tv_2` / `remote.window_tv` |
| Big TV | 192.168.0.160 | not connected | `media_player.big_tv` | `media_player.big_tv_2` / `remote.big_tv` |
| Pillow TV | — | — | `media_player.pillow_tv` | `media_player.pillow_tv_2` / `remote.pillow_tv` (Vizio) |

Cast entities (Google Cast) can receive `play_media`, TTS, camera streams, and Lovelace
dashboard casts. Remote entities (Android TV Remote / Vizio SmartCast) handle power,
D-pad, volume, and app launching. Both are needed — not duplicates.

## Home Dashboard (Dynamic)

- **URL**: http://dashboard.home (proxied) or http://192.168.0.186:3000 (direct)
- **Container**: `home-dashboard` on Ubuntu server
- **Source**: mirrored in [`../dashboard/`](../dashboard/)
- **Features**: Live ping checks, HA HTTP check, Docker container status, 15-second auto-refresh, dark mode
- **Docker socket**: mounted read-only for container status
- **Network mode**: host (for LAN ping access)
- **NPM proxy**: `dashboard.home` → `192.168.0.186:3000`

### Rebuild/restart dashboard

```bash
ssh joecastagna@192.168.0.186
cd ~/apps/home-dashboard
docker compose up -d --build
```

## Known Issues / TODO

- **Spectrum TV tuning: ABANDONED (July 2026)**: `shell_command` runs in the HA Core
  container (no adb) — the blind D-pad tuning approach was too clunky and never worked
  cleanly anyway. Morning CNN automation deleted; `shell_command.tune_spectrum` removed
  from `configuration.yaml`. `scripts/tune_spectrum.sh` kept for reference but unused.
- **ADB doesn't persist**: `apk add android-tools` in the SSH add-on is lost on add-on restart.
- **`media_player.living_room`**: Ghost Cast Group — needs to be deleted from the Google Home app on phone.
- **HA MCP integration**: Enabled but not tested/connected yet.
- **Idea, not yet built**: Cast a live Mets/FIFA scoreboard Lovelace view to a TV on game
  start (sensors and Gemini text already exist; just needs a dashboard view + one more
  cast action wired into the existing automations).

## Useful Commands

```bash
# Reload automations (no restart)
ssh root@192.168.0.121 "curl -sk -X POST https://172.30.32.1:8123/api/services/automation/reload -H 'Authorization: Bearer $HA_TOKEN'"

# Check config before restart
ssh root@192.168.0.121 "ha core check"

# Restart HA Core
ssh root@192.168.0.121 "ha core restart"

# Trigger an automation manually
ssh root@192.168.0.121 "curl -sk -X POST https://172.30.32.1:8123/api/services/automation/trigger -H 'Authorization: Bearer $HA_TOKEN' -H 'Content-Type: application/json' -d '{\"entity_id\": \"automation.AUTOMATION_ID_HERE\"}'"

# List all entities matching a pattern
hass-cli state list | grep media_player

# Docker status on Ubuntu
ssh joecastagna@192.168.0.186 "docker ps"
```
