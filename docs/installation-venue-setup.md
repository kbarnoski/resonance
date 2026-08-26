# Installation Venue Setup

Operator runbook for deploying Resonance to a venue kiosk — online (Vercel +
fal) or fully offline (the Tramokyo content pack). Everything you need to
install, keep alive, and monitor.

Last updated: 2026-08-25 (post full-system audit — supervision, sleep,
phone-remote reload, quarantine exclusion, derived journey caps all landed).

## What the loop actually plays (2026-08 format)

The attract loop runs a **two-program cycle, ~65 minutes end to end**, then
wraps:

1. **Welcome Home** — the full album path (13 journeys, one per track, plus
   the Cosmic Homecoming culmination = 14 journeys), resolved from the
   shared path `d2c79111528a46cf`.
2. **Snowflake EP** — three built-in journeys: `first-snow` → `inferno` →
   `ghost`.

Each program runs intro screen → journeys → dedication screen; after the
last program's dedication the loop wraps to the first. Program content lives
in `src/lib/journeys/installation-sequence.ts`.

Journeys pair with tracks via `recordingId` → `PAIRED_TRACKS` → fallback
pool, in that order. The fallback pool **excludes the quarantined 17th St /
Folsom St uploads** (unverified authorship — Karel's ruling 2026-08-25; the
canonical list is `QUARANTINED_RECORDING_IDS` in
`src/components/audio/installation-machine.ts`, imported from the dream
lab's `welcomeHome.ts`). Per-journey safety caps are now **derived from the
track's duration + 90s margin** (floored at 8 min), so a long track is never
cut mid-piece.

---

## Cost expectations (online mode only; read before going live)

Offline (OFFLINE_PACK=1) costs nothing — skip this section for Tramokyo
unless you enable the optional live-fal overlay.

### `/installation` — venue kiosk (full quality)
Anon `/installation` traffic routes to dev/PuLID. ~7s gen cadence
(~514 frames/hr):
- **~$13/hr** on dev journeys (flux/dev at $0.025/frame)
- **~$28/hr** during Ghost (flux/pulid at $0.055/frame)
- **Mix-weighted ~$15-18/hr** running continuously
- 12hr/day kiosk → **~$200/day in fal cost**

Per-IP rate limit (720 frames/hr) caps abuse at ~$18-40/hr/IP.

### `/demo` — broad reviewer link (cheap, LOWER quality)
Anon `/demo` traffic routes to flux/schnell ($0.003/frame) — ~$0.50 per
full cycle. Reviewers see a representative-but-lower-quality version
(4 inference steps vs 28, no Ghost identity lock). Acceptable tradeoff for
unbounded sharing.

> Note: an earlier version of this doc claimed `/demo` got full quality —
> that was wrong. The referer check in
> `src/app/api/ai-image/generate/route.ts` matches `/installation` only;
> `/demo` is deliberately schnell. To grant a small qualified audience full
> quality, widen the regex there to `/\/(demo|installation)(\?|$|\/)/`.

### If the venue bill matters even at full quality
- Cut the AI cadence in `ai-image-layer.tsx` (`GEN_INTERVAL_MIN_BASE`
  6.5s → 12s+, ~halves cost)
- Disable AI on certain journeys via the journey's `aiEnabled` flag
- Populate the fallback image library (§ Fallback images) so a cost-cap
  cutoff degrades gracefully

---

## 1. One-time Supabase setup (online monitoring only)

Apply the heartbeat migration in the Supabase dashboard SQL editor (project
`mgzgyisesfvftrfowsus`):

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

## 2. Per-venue token + URLs (online monitoring)

Generate one token per kiosk. Tokens are 16-byte hex; treat them as secrets
shared only with whoever needs visibility.

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
| `debug` | optional | kiosk / demo | `?debug=1` renders the live audio + journey debug HUD. |
| `start` | optional | kiosk / demo | `?start=ghost`, `?start=snowflake-ep`, or `?start=N` to jump straight to a journey/program for testing. |
| `token` | required | status page | Must match kiosk's `heartbeat_token` to read its row. |

### Monitoring reality check: what works offline

- **Offline (Tramokyo) monitoring = `/remote` on the hotspot LAN.** The
  phone remote works with zero internet — phone and laptop just need the
  same hotspot.
- **The `/installation/status` page and Slack webhooks need internet** —
  both POST to Vercel/Slack. In the desert they are dead weight unless the
  hotspot has real upstream. Plan around `/remote` + the on-kiosk ⌘⇧S panel.

---

## 3. Fallback images (online kiosk backup — currently NOT populated)

**Status: the library is empty (verified 2026-08-25).** For the offline
Tramokyo kiosk this is fine — the pre-harvested pack imagery is the
guaranteed offline backbone and this library never triggers. It only
matters for an **online** `/installation` kiosk: when fal.ai is unreachable
for 3+ consecutive frames, the kiosk would pick from this library instead
of freezing on the last frame. Empty bucket = freeze on last frame
(default behavior).

To populate (~30 images per journey reads naturally):

```
/public/installation-fallback/manifest.json
/public/installation-fallback/<journey-id>/01.jpg …
```

Current loop journey ids: `first-snow`, `inferno`, `ghost` (built-ins;
Welcome Home path journeys are keyed by their DB row uuid). Source of
truth: `src/lib/journeys/fallback-image-library.ts`.

---

## 4. Operator status panel (on the kiosk display itself)

Press **⌘⇧S** on the kiosk to toggle an overlay showing uptime, current
phase + journey, audio playback state + position, AudioContext state, FPS,
and last play/priming errors. Press again to hide. Source:
`src/components/audio/installation-status-panel.tsx`.

`?debug=1` on the kiosk URL adds the live audio + journey debug HUD
(re-enabled 2026-08-25 after being dead-wired for a while).

---

## 5. Phone status page (off-site, needs internet)

`https://getresonance.vercel.app/installation/status?token=<TOKEN>`

Refreshes every 8s. Health pill: green <90s, amber 90s–5min, red >5min.
Source: `src/app/installation/status/page.tsx`. **Internet-only** — for
offline venues use `/remote` (§10) instead.

---

## 6. Slack/Discord webhook setup (optional, needs internet)

**Slack**: Apps → Incoming Webhooks → Add to Slack → copy URL.
**Discord**: Server Settings → Integrations → Webhooks → New Webhook.

Paste into the kiosk URL's `webhook_url` param. Beacon on boot + every
10 minutes:
> Resonance kiosk · phase=journey 2/14 (Inferno) · audio=playing 120/240s · audioCtx=running · uptime=3h 12m

---

## 7. Built-in resilience features

| Feature | What it does | Trigger |
|---|---|---|
| launchd supervision (offline kiosk) | Restarts the server on crash; starts it at login | `com.resonance.tramokyo` KeepAlive (§9) |
| Bootstrap page | Chrome opens a local page that polls :3000 and redirects when up — a launch/reload into a dead server self-heals | `scripts/tramokyo-bootstrap.html` |
| `caffeinate -disu` | Machine cannot sleep for the whole run | Wraps the server + a session-level instance from the launcher |
| WebGL context recovery | Re-creates shaders + buffers on a fresh GPU context | `webglcontextrestored` event |
| Sleep/wake recovery | Re-primes audio after laptop wakes | Detects >30s tick gap |
| Audio stall watchdog | Force-reloads source if currentTime stops advancing for 5s+ | Polled every 2s |
| Auto-reload watchdog | `location.reload()` if no phase change in 2× the longest journey cap — and only once the server answers a probe, so it can't reload into a dead server | Phase machine wedge |
| Derived journey caps | Safety timeout = track duration + 90s (floor 8 min) — long tracks no longer cut at 8:00 | `journeyCapMs` |
| Phone-remote `reload` | Full kiosk reload from `/remote`, no laptop access needed | Recovery button (§10) |
| Blob-URL hygiene | Object URLs revoked on re-mint; `blob:` never persisted to sessionStorage (dead after reload) | `resolve-audio-url.ts` |
| Fallback image library | Cycles cached images when fal is down — **currently unpopulated** (§3) | 3+ consecutive REST failures |
| Cost cap on anon traffic | Caps fal spend per IP via rate limiter | Always on (online) |
| Full image quality on `/installation` (NOT `/demo`) | Routes anon kiosk visitors to dev/PuLID; `/demo` stays schnell | Referer-based |
| Tauri local audio cache + pre-warm | Downloads + caches all installation tracks locally; persists across restarts | Desktop app only |
| M4A transcode for cloud `/demo` | Tracks served as compressed AAC (~5MB) instead of raw WAV (~80MB) | `recordings.aac_file_name` populated |

---

## 8. Smoke test before going live (online kiosk)

1. Open kiosk URL with `heartbeat_token` set
2. Open status URL on phone — green within ~60s
3. Wait ~5min — verify phase advances naturally
4. Press ⌘⇧S on kiosk — status overlay appears, FPS ≥30
5. (If using webhook) confirm boot beacon arrived
6. Sleep the laptop briefly, wake it — audio resumes within ~5s

For the offline kiosk, use the PRE-SHOW checklist in
`docs/tramokyo-plan.md` instead — it covers the desert-specific passes
(power pull, wifi-off, hotkeys, phone remote).

---

## 9. Offline mode — Tramokyo content pack

For fully-offline venues (no reliable network at all), the app runs
entirely from a local content pack instead of Supabase + fal.

### Build the pack (on a connected machine)

```bash
node --env-file=.env.local scripts/build-tramokyo-pack.mjs
```

Output lands in `public/tramokyo-pack/` (gitignored, GBs). ALAC files are
transcoded to AAC automatically so Chromium can play them. Re-runs are
incremental.

**Pre-harvested journey imagery** (the offline AI-image backbone):

```bash
node --env-file=.env.local scripts/harvest-journey-images.mjs
```

Re-runs are resumable. Offline, the AI image layer pulls these instead of
live fal, and the app forces the full installation tier.

> **GOTCHA — restart the server after any re-export / re-harvest.** The
> pack manifest and `local-images.json` are read once and **cached for the
> life of the node process**. If you rebuild the pack or harvest new images
> while the server is running, the kiosk keeps serving the OLD content
> until the server restarts (`scripts/tramokyo-stop.sh` then relaunch, or
> `launchctl kickstart -k gui/$(id -u)/com.resonance.tramokyo` when
> supervised).

### Build + run

```bash
nvm use 20        # REQUIRED for builds — see below
npm run build
OFFLINE_PACK=1 npm run start
```

> **Node version gotcha:** `next build` dies with `spawn EBADF` during
> static generation under Node 22 on macOS. **Build with Node 20**
> (`nvm use 20`). `next start` runs fine on any recent Node — the launch
> scripts resolve node dynamically (Homebrew → PATH → newest nvm install)
> and no longer hardcode an nvm version path.

### Launchers (Desktop apps)

**Tramokyo.app** wraps `scripts/tramokyo-kiosk.sh`:
- starts a session `caffeinate -disu` (PID-filed) so nothing sleeps
- re-loads launchd supervision if installed-but-unloaded
- starts the server (via launchd `kickstart` when supervised, otherwise a
  PID-filed background `scripts/tramokyo-server.sh`)
- opens Chrome kiosk on the **local bootstrap page**
  (`scripts/tramokyo-bootstrap.html`), which polls :3000 and redirects to
  the attract loop when the server answers — launching into a
  still-starting or crashed-and-restarting server self-heals

**Tramokyo Stop.app** wraps `scripts/tramokyo-stop.sh`. It only kills what
the launcher started — the dedicated Chrome profile, the PID-filed server
process group and caffeinate, and it `bootout`s the launchd job so KeepAlive
doesn't respawn the server. It never kills arbitrary processes on :3000.

Rebuild the .apps on a new machine:

```bash
osacompile -o ~/Desktop/Tramokyo.app -e 'do shell script "<repo>/scripts/tramokyo-kiosk.sh >/dev/null 2>&1"'
osacompile -o "$HOME/Desktop/Tramokyo Stop.app" -e 'do shell script "<repo>/scripts/tramokyo-stop.sh >/dev/null 2>&1"'
```

### Supervision (install at the venue, NOT on a dev laptop)

```bash
scripts/tramokyo-install-supervision.sh              # install + load
scripts/tramokyo-install-supervision.sh --uninstall  # stop + remove
```

Installs `com.resonance.tramokyo` as a LaunchAgent
(`~/Library/LaunchAgents/`): the OFFLINE_PACK server runs at login
(RunAtLoad) and restarts on crash (KeepAlive, 5s throttle). Logs to
`/tmp/tramokyo-server.log`. Template:
`scripts/com.resonance.tramokyo.plist` (repo path substituted at install).

With supervision + macOS auto-login + the bootstrap page, the full
power-loss story is hands-free: power returns → auto-login → launchd starts
the server → relaunch Tramokyo.app (or leave Chrome in Login Items) → the
bootstrap page waits for :3000 and enters the loop.

### What OFFLINE_PACK=1 changes

- Middleware skips Supabase auth entirely — no login, no redirects
- All page data comes from `public/tramokyo-pack/data/*.json`
- `/api/audio/{id}` returns static pack URLs (range requests supported)
- Library + recording pages are read-only
- Live fal generation is off — journeys use their exported local images
- Quarantined 17th St / Folsom St uploads are excluded from the
  fallback/DJ track pool (curated pairings unaffected)

**Never set `OFFLINE_PACK` on Vercel.** It disables auth; it is strictly
for a trusted-operator kiosk laptop.

**Live fal over the hotspot (optional):** put `FAL_KEY` in the kiosk's
`.env.local`. Packed images remain the guaranteed backbone; live gens are
a bonus layer when the network happens to work, with silent fallback.

### Operator hotkeys (offline kiosk)

| Combo | Where | Action |
| --- | --- | --- |
| `Cmd+Shift+B` | attract loop | Break in — exit to The Room to DJ |
| `Cmd+Shift+B` | The Room | Return to the attract loop |
| `Cmd+Shift+N` | attract loop | Skip to the next journey |
| `Cmd+Shift+S` | attract loop | Toggle the on-screen status panel |

Audience-facing keys stay trapped — only modifier combos reach the
operator handlers.

---

## 10. Phone remote (offline monitoring + control)

With the phone on the same hotspot as the laptop, open
`http://<laptop-ip>:3000/remote` (find the IP via
`ipconfig getifaddr en0`). Shows now-playing and offers:

- play/pause, skip journey, break in / resume loop
- launch any built-in journey, volume presets
- **Reload kiosk display** (confirm-gated) — full `location.reload()` on
  the kiosk; the one recovery that fixes most wedges without physically
  reaching the laptop
- failed commands surface an error banner (HTTP failure or hotspot drop)
  instead of failing silently

Commands flow through an in-memory bus at `/api/pack/remote`; the kiosk
polls every 2s, so allow a beat.

### Trust model — read this once

`/api/pack/remote` is **deliberately unauthenticated**. It only exists
when `OFFLINE_PACK=1` (404s in production), and the security boundary is
the network: the hotspot LAN is assumed to contain only the operator's
devices. Anyone who can reach `laptop:3000` can drive the kiosk — which
also means they could open the whole app anyway (OFFLINE_PACK disables
auth globally). Keep the hotspot password-protected; don't bridge the
laptop onto venue-public wifi.

---

## 11. Desert power & sleep checklist (do at venue setup)

Work through this top to bottom on the installation laptop:

- [ ] **macOS auto-login**: System Settings → Users & Groups → Login
      Options → Automatic login = kiosk user. (A power cut must not strand
      the machine at the login screen.)
- [ ] **FileVault off** (or auto-login can't work unattended).
- [ ] **Screen saver off**: Settings → Lock Screen → Start Screen Saver
      when inactive = Never; Turn display off = Never (on power adapter).
- [ ] **Require password after sleep = Never** (belt-and-braces; caffeinate
      should prevent sleep entirely).
- [ ] **Notifications off**: Settings → Focus → Do Not Disturb scheduled
      24h, share across devices OFF. No update toasts over the projection.
- [ ] **Software update auto-restart OFF** (Settings → General → Software
      Update → uncheck automatic installs).
- [ ] **Install supervision**: `scripts/tramokyo-install-supervision.sh`.
      Verify: `launchctl print gui/$(id -u)/com.resonance.tramokyo`.
- [ ] **Verify caffeinate is live** after launching:
      `pmset -g assertions | grep -i caffeinate` (expect display + idle +
      system assertions).
- [ ] **Brightness**: set display/projector brightness manually and
      disable auto-brightness + TrueTone.
- [ ] **Volume**: set system output level, disable alert sounds.
- [ ] **Power-loss restart drill** (do this once for real): pull the
      laptop's power AND hold the battery until shutdown (or
      `sudo shutdown -h now`), restore power, power on — the machine must
      reach the attract loop with NO keyboard/mouse input. If Chrome
      doesn't auto-open, add Tramokyo.app to Login Items (Settings →
      General → Login Items).
- [ ] **Hotspot**: password-protected, laptop + phone joined, `/remote`
      loads from the phone.

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Chrome shows "waiting for server" forever | Server crash-looping (no `.next` build, node missing) | `tail -f /tmp/tramokyo-server.log`; rebuild with Node 20 |
| Kiosk shows old tracks/images after a pack rebuild | Manifest cached for process lifetime | Restart the server (§9 gotcha) |
| Phone status page 404 / "no heartbeat" | Offline venue (page needs internet) OR migration/token wrong | Use `/remote` offline; else apply §1 SQL, check token |
| `/remote` shows "waiting for kiosk…" | Kiosk page not open, or phone not on the hotspot | Open the loop on the laptop; rejoin hotspot |
| `/remote` shows red error banner after a command | Command didn't reach the bus (hotspot blip) | Re-send; check phone wifi |
| Visualizer black for >30s | WebGL context lost without restore | `/remote` → Reload kiosk display; consider Chrome ≥120 |
| Audio paused, won't start | Autoplay block (browser tab without the kiosk launcher) | One tap anywhere unlocks; launcher Chrome has autoplay pre-allowed |
| Machine slept anyway | caffeinate not running (launcher bypassed?) | Launch via Tramokyo.app; check §11 checklist |
| Repeated `[fal] returned null` (online) | Cost cap hit OR fal outage | Fallback library is unpopulated — expect freeze-on-last-frame (§3) |

---

## 13. When something changes

This doc lives at `docs/installation-venue-setup.md`. Edit + push to main
when: new URL params, new env vars, new migrations, recovery-threshold
changes, or new install-mode features ship. The Tramokyo-specific plan +
pre-show checklist live in `docs/tramokyo-plan.md` — keep both current.

The accompanying memory entry at
`~/.claude/projects/-Users-karelbarnoski/memory/project_installation_venue_setup.md`
reminds Claude to check + update this doc whenever installation-mode work
happens.
