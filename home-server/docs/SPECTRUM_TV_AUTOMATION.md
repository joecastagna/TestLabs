# Spectrum TV Automation via ADB

## Overview
Automates tuning the Spectrum TV app on the Window TV (Google TV) to any channel by name, using ADB commands sent from the Home Assistant SSH add-on.

## Architecture
```
Home Assistant Automation
  → shell_command.tune_spectrum
    → /config/scripts/tune_spectrum.sh <CHANNEL_NAME>
      → ADB commands to Window TV (192.168.0.141:5555)
```

## How It Works
The Spectrum TV app is a WebView-based app that only responds to d-pad navigation (no touch, no direct text input, no deep links). The script:

1. **Wakes the TV** via ADB KEYCODE_WAKEUP
2. **Launches Spectrum TV** via `am start` with package `com.spectrum.stva.androidtv`
3. **Navigates to the search icon** using d-pad (up to nav bar, left to HOME, right 6 times to search)
4. **Types the channel name** by navigating the on-screen A-Z keyboard with d-pad left/right + center to select each letter
5. **Selects the first search result** by pressing down twice + center

## Key Files
- `/config/scripts/tune_spectrum.sh` — Main script, takes channel name as argument (e.g. `CNN`, `ESPN`)
- `/config/configuration.yaml` — Contains `shell_command.tune_spectrum`
- `/config/automations.yaml` — Contains time-based triggers

## ADB Setup
- **TV IP:** 192.168.0.141
- **ADB Port:** 5555 (standard, set via `adb tcpip 5555`)
- **ADB installed via:** `apk add android-tools` on the SSH add-on
- **TV Developer Options:** Wireless Debugging enabled, then switched to TCP port 5555
- **No re-pairing needed** after TV reboots (port 5555 persists)
- If ADB stops working: re-enable Developer Options on TV, run `adb connect 192.168.0.141:5555` from SSH

## Spectrum TV App Details
- **Package:** `com.spectrum.stva.androidtv`
- **Activity:** `.ui.HostedMainActivity`
- **UI:** Entirely WebView-based (no native Android widgets)
- **Keyboard layout:** `[space] [backspace] A B C D E F G H I J K L M N O P Q R S T U V W X Y Z`

## Adding a New Channel
1. Add an automation to `/config/automations.yaml`:
```yaml
- id: evening_espn
  alias: "Evening ESPN on Window TV"
  triggers:
    - trigger: time
      at: "18:00:00"
  conditions: []
  actions:
    - action: shell_command.tune_spectrum
      data:
        channel: ESPN
  mode: single
```
2. Reload automations in HA (Settings → Automations → Reload)

## Manual Usage via SSH
```bash
/config/scripts/tune_spectrum.sh CNN
/config/scripts/tune_spectrum.sh ESPN
/config/scripts/tune_spectrum.sh FOX
```

## Limitations
- **Search-based:** Uses the search keyboard, so the channel name must match what Spectrum returns as the first result
- **Timing-dependent:** Uses sleep delays between d-pad presses; may need adjustment if TV/app is slow
- **ADB persistence:** If the TV fully power-cycles (not just sleep), ADB port 5555 may revert and need `adb tcpip 5555` re-run
- **Single TV:** Currently hardcoded to Window TV (192.168.0.141). Can be extended to Big TV (192.168.0.160) with similar setup
- **SSH add-on restart:** `adb` is installed via `apk add` which doesn't persist across SSH add-on restarts. If the add-on restarts, run `apk add android-tools` again.
