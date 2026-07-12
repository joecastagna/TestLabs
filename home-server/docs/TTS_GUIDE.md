# Text-to-Speech (TTS) on Google Speakers

## Quick Reference

### From SSH (curl)
```bash
HA_TOKEN="eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJpc3MiOiAiY2xpX2xvbmdfbGl2ZWRfdG9rZW5fMDAxIiwgImlhdCI6IDE3ODM3NTIxMjMsICJleHAiOiAyMDk5MTEyMTIzfQ.knvGY7hQIQw3WeVxyShUt90iWVrUyMtxrHsM9s-USo8"

curl -sk -X POST https://172.30.32.1:8123/api/services/tts/speak \
  -H "Authorization: Bearer $HA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_id": "tts.google_translate_en_com",
    "media_player_entity_id": "media_player.office_speaker",
    "message": "Your message here"
  }'
```

### In Automations (YAML)
```yaml
- action: tts.speak
  target:
    entity_id: tts.google_translate_en_com
  data:
    media_player_entity_id: media_player.office_speaker
    message: "Your message here"
```

## Available Speakers

| Entity ID | Name |
|-----------|------|
| `media_player.office_speaker` | Office Speaker |
| `media_player.office_speakers` | Office Speakers (group) |
| `media_player.bedroom_speaker` | Bedroom Speaker |
| `media_player.kitchen_speaker` | Kitchen Speaker |
| `media_player.living_room` | Living Room |
| `media_player.everywhere` | Everywhere (all speakers) |

## Available Displays / TVs

| Entity ID | Name |
|-----------|------|
| `media_player.big_tv` / `media_player.big_tv_2` | Big TV |
| `media_player.window_tv` / `media_player.window_tv_2` | Window TV |
| `media_player.pillow_tv` / `media_player.pillow_tv_2` | Pillow TV |

## Important Notes
- **TTS entity:** `tts.google_translate_en_com` (NOT `tts.google_translate_say`)
- **Service:** `tts.speak` (NOT `tts.google_translate_say`)
- Speaker must be reachable on the network (Cast protocol)
- If the speaker is off, HA will wake it to play the message
- Set volume first if needed: `media_player.volume_set` with `volume_level: 0.0-1.0`
- **API Token:** Long-lived JWT stored in `/config/.storage/auth` as `cli_long_lived_token_001`
