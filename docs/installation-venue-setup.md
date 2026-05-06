# Installation Venue Setup

Operator runbook for deploying Resonance to a venue kiosk. Everything you need to install + monitor remotely.

Last updated: 2026-05-04

## Cost expectations (read this before going live)

The kiosk generates an AI image roughly every 7s during a journey (~514 frames/hr). With full quality enabled on `/installation` paths, that's:
- **~$13/hr per kiosk for 4 of 5 journeys** (flux/dev at $0.025/frame)
- **~$28/hr per kiosk during Ghost** (flux/pulid at $0.055/frame)
- **Mix-weighted ~$15-18/hr per kiosk** running continuously

Per-IP rate limit caps abuse at the same rate (~$18-40/hr/IP worst case for a single IP). Run a kiosk 12hr/day → expect **~$200/day in fal cost per kiosk**. If the bill matters, consider:
- Pre-baking the fallback library (§3) — when fal is "intentionally down" via the cost-cap, fallback kicks in
- Cutting the AI cadence in `ai-image-layer.tsx` `GEN_INTERVAL_MIN_BASE` from 6.5s to 12s+ (~halves cost)
- Disabling AI on certain journeys via the journey's `aiImageEnabled` flag

---

## 1. One-time Supabase setup

Apply the heartbeat migration in the Supabase dashboard SQL editor (project `mgzgyisesfvftrfowsus`):

```sql
CREATE TABLE IF NOT EXISTS public.installation_heartbeats (
  token       text PRIMARY KEY,
  payload     jsonb NOT NULL,
  last_seen   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.installation_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "installation_heartbeats_no_direct_access"
  ON public.installation_heartbeats;
CREATE POLICY "installation_heartbeats_no_direct_access"
  ON public.installation_heartbeats FOR ALL USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_installation_heartbeats_last_seen
  ON public.installation_heartbeats (last_seen DESC);
```

Source of truth: `supabase/migrations/20260504000000_installation_heartbeats.sql`.

---

## 2. Per-venue token + URLs

Generate one token per kiosk. Tokens are 16-byte hex; treat them as secrets shared only with whoever needs visibility.

```bash
TOKEN=$(openssl rand -hex 16)
SLACK_WEBHOOK="https://hooks.slack.com/services/..."   # optional

echo "Kiosk URL (paste in venue display, opens fullscreen):"
echo "  https://getresonance.vercel.app/installation?heartbeat_token=$TOKEN&webhook_url=$SLACK_WEBHOOK"
echo
echo "Phone status URL (open from your phone, refreshes every 8s):"
echo "  https://getresonance.vercel.app/installation/status?token=$TOKEN"
```

Save the token + URLs in 1Password (or wherever) keyed by venue name.

### URL parameter reference

| Param | Required? | Where | Effect |
|---|---|---|---|
| `heartbeat_token` | optional | kiosk | Enables heartbeat POSTs every 60s. Without this, no remote monitoring. |
| `webhook_url` | optional | kiosk | HTTPS-only. Slack/Discord/generic webhook URL. POST every 10min + on boot. |
| `start` | optional | `/demo` only | `?start=ghost` or `?start=N` to jump straight to a journey for testing. |
| `token` | required | status page | Must match kiosk's `heartbeat_token` to read its row. |

---

## 3. Pre-baked fallback images (optional)

When fal.ai is unreachable for 3+ frames in a row, the kiosk picks a random image from a per-journey fallback library so the visualizer keeps moving instead of freezing on the last frame.

**Folder layout:**
```
/public/installation-fallback/manifest.json
/public/installation-fallback/<journey-id>/01.jpg
/public/installation-fallback/<journey-id>/02.jpg
…
```

**Journey IDs**: `ascension`, `inferno`, `first-snow`, `abyssal-dive`, `ghost`.

**Manifest** at `/public/installation-fallback/manifest.json` — list public paths to whatever you've dropped in:
```json
{
  "ghost": [
    "/installation-fallback/ghost/01.jpg",
    "/installation-fallback/ghost/02.jpg"
  ]
}
```

Empty bucket = no fallback for that journey (kiosk freezes on last frame, default behavior). Source of truth: `src/lib/journeys/fallback-image-library.ts`.

**Recommended bake count**: ~30 images per journey. The runtime avoids serving the same image twice in a row, so larger buckets read more naturally.

---

## 4. Operator status panel (on the kiosk display itself)

Press **⌘⇧S** (or **Ctrl⇧S** on Linux/Windows) on the kiosk to toggle an overlay showing:
- Uptime
- Current phase + journey
- Audio playback state + position
- AudioContext state
- FPS
- Last play / priming errors

Press the same combo to hide. Source: `src/components/audio/installation-status-panel.tsx`.

---

## 5. Phone status page (off-site)

`https://getresonance.vercel.app/installation/status?token=<TOKEN>`

Refreshes every 8s. Health pill colors:
- 🟢 green: heartbeat <90s old (alive)
- 🟡 amber: 90s–5min (stale)
- 🔴 red: >5min (offline)

Source: `src/app/installation/status/page.tsx`.

---

## 6. Slack/Discord webhook setup (optional)

**Slack**: Create an incoming webhook in your workspace (Apps → Incoming Webhooks → Add to Slack), pick a channel, copy the URL.

**Discord**: Server Settings → Integrations → Webhooks → New Webhook.

Paste the URL into the kiosk URL's `webhook_url` param. You'll get a beacon on boot + every 10 minutes:
> Resonance kiosk · phase=journey 2/5 (Inferno) · audio=playing 120/240s · audioCtx=running · uptime=3h 12m

---

## 7. Built-in resilience features (just so you know what's covered)

| Feature | What it does | Trigger |
|---|---|---|
| WebGL context recovery (2D + 3D) | Re-creates shaders + buffers on a fresh GPU context | `webglcontextrestored` event |
| Sleep/wake recovery | Re-primes audio after laptop wakes | Detects >30s tick gap |
| Audio stall watchdog | Force-reloads source if currentTime stops advancing for 5s+ | Polled every 2s |
| Auto-reload watchdog | `location.reload()` if no phase change in 16min | Phase machine wedge |
| Pre-baked fallback library | Cycles cached images when fal is down | 3+ consecutive REST failures |
| Cost cap on anon traffic | Caps fal spend per IP via rate limiter | Always on |
| Full image quality on `/demo` + `/installation` | Routes anon kiosk visitors to dev/PuLID instead of schnell | Referer-based |
| **Tauri local audio cache** | First play: download + cache locally (~5MB M4A); subsequent plays from disk; persists across restarts | `cmd_audio_load` checks cache first |
| **Tauri audio cache pre-warm** | Downloads all 5 installation tracks at app mount so even cycle 1 has zero network audio | `cmd_audio_prefetch` on mount |
| M4A transcode for cloud `/demo` | Installation tracks served as compressed AAC (~5MB) instead of raw WAV (~80MB) | `recordings.aac_file_name` populated |

---

## 8. Smoke test before going live

1. Open kiosk URL with `heartbeat_token` set
2. Open status URL on phone — should turn green within ~60s
3. Wait ~5min — verify phase advances naturally (status page Phase field changes)
4. Press ⌘⇧S on kiosk — confirm status overlay appears, FPS reads ≥30
5. (If using webhook) confirm boot beacon arrived in your Slack/Discord channel
6. Sleep the laptop briefly, wake it — audio should resume within ~5s

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Phone status says 404 / "no heartbeat received" | Migration not applied OR wrong token | Apply the SQL in §1; verify token matches |
| Phone status pill stays 🔴 red | Kiosk URL missing `heartbeat_token` | Re-stamp URL on kiosk |
| Visualizer black for >30s | WebGL context lost without restore (old browser) | Reload kiosk; consider Chrome ≥120 |
| Audio paused but no `play()` button | iOS Safari autoplay block on a tab kiosk URL | One tap anywhere unlocks it; OR use desktop Tauri build |
| Repeated `[fal] returned null` in logs | Cost cap hit OR fal outage | Pre-baked fallback should kick in; check `/installation-fallback/manifest.json` is populated |
| Webhook never fires | URL not HTTPS, or Slack rejected payload | Check Vercel logs; only HTTPS URLs accepted |

---

## 10. When something changes

This doc lives at `docs/installation-venue-setup.md`. Edit + push to main when:
- New URL params added
- New environment variables required
- New migration files added
- Recovery thresholds change
- New tier of features (3D path, IndexedDB caching, etc.)

The accompanying memory entry at `~/.claude/projects/-Users-karelbarnoski/memory/project_installation_venue_setup.md` reminds Claude to check + update this doc whenever installation-mode work happens.
