# Tramokyo — Offline Desert Installation Plan

Resonance's first real installation: a projector + laptop kiosk in a
desert Shiftpod, running the two-program attract loop (~65 min: Welcome
Home album → Snowflake EP) entirely from a local content pack — no
network dependency. This doc is the durable home of the 4-phase plan
(agreed with Karel 2026-08-18; previously it lived only in Claude
memory) plus current status.

Operator runbook: `docs/installation-venue-setup.md` (§9-12 are the
offline sections).

---

## PRE-SHOW — requires a human (nothing below ships itself)

These cannot be closed from code. Do them on the REAL hardware, in order,
before load-in:

1. **Full dress rehearsal on the installation laptop + projector.**
   - Complete ~65-min two-program cycle, wifi OFF the entire time.
   - All three operator hotkeys (`⌘⇧B` break-in/return, `⌘⇧N` skip,
     `⌘⇧S` status panel) — these have never been browser-tested on the
     real machine.
   - Phone remote over the actual hotspot: status readout, play/pause,
     skip, journey launch, volume, and the new **Reload kiosk display**
     button — the remote has never been phone-tested.
   - **Forced mid-journey power pull**: cut power, restore, verify the
     machine reaches the attract loop with zero input (auto-login →
     launchd server → bootstrap page → loop).
   - A second full pass with wifi off from cold boot.
2. **Pack re-export + re-harvest right before the event**, then
   **restart the server** (the pack manifest is cached for process
   lifetime — a re-harvest without a restart serves stale content), then
   an offline smoke: first journey plays audio + packed imagery with
   wifi off.
3. **De-risk the build**: back up a known-good `.next` (plus
   `public/tramokyo-pack/`) to an external drive, and/or keep a second
   pre-built laptop. Remember: rebuilds need Node 20 (`nvm use 20`);
   the launch scripts no longer care which node runs `next start`.
4. **Venue checklist**: work through "Desert power & sleep checklist"
   (runbook §11) — auto-login, screensaver/notifications off,
   supervision installed, caffeinate verified, brightness/volume locked,
   hotspot password set.

---

## The 4-phase plan and where it stands

### Phase 1 — Offline content pack · SHIPPED (`44f5989e`, 2026-08-18)
`OFFLINE_PACK=1` mode: all page data from `public/tramokyo-pack/data/*.json`,
`/api/audio` from static pack files (ALAC auto-transcoded to AAC for
Chromium), auth skipped, incremental pack builder
(`scripts/build-tramokyo-pack.mjs`). Passed an 8-hour zero-network test.

### Phase 2 — Pre-harvested journey imagery · SHIPPED (`66b50972`, 2026-08-18)
`scripts/harvest-journey-images.mjs` exports fal imagery for every
built-in + path journey; offline, the AI image layer plays these and the
app forces the full installation tier (max layering, full resolution).
**Deferred**: the bespoke Tramokyo image set — waiting on Karel's vibe
brief before harvesting a curated desert-specific look.

### Phase 3 — Operator experience · PARTIAL
Hotkeys shipped (`⌘⇧B` / `⌘⇧N` / `⌘⇧S`, audience keys trapped).
**Outstanding: the rehearsal** — hotkeys and the full offline cycle have
never been exercised on the real hardware (see PRE-SHOW #1).

### Phase 4 — Live overlay + phone remote · SHIPPED (`25046c02`, 2026-08-18), NOT PHONE-TESTED
Opportunistic live-fal bonus layer when the hotspot happens to have
upstream (packed imagery stays the backbone; silent fallback), plus the
`/remote` phone page and `/api/pack/remote` command bus. Never actually
driven from a phone over a hotspot (see PRE-SHOW #1).

### Post-plan work
- **Two-program attract loop** (`fc269700`, 2026-08-24) — Welcome Home
  album program then Snowflake EP, back-to-back with per-program intro +
  dedication screens.
- **Double-click kiosk launchers + offline /paths** (`694e36ac`,
  2026-08-24) — Tramokyo.app / Tramokyo Stop.app wrapping the kiosk
  scripts.
- **Kiosk-test feedback fixes** (`52e421c8`, 2026-08-24) — WH images,
  longer intro hold, composer credits.

---

## 2026-08-25 audit — P0 (Tramokyo-critical) status

From `docs/full-audit-2026-08-25.md`, "P0 — Tramokyo-critical":

| # | Item | Status |
|---|------|--------|
| 1 | Supervise the stack (launchd KeepAlive + Chrome retry) | **DONE** — `com.resonance.tramokyo` LaunchAgent + `tramokyo-install-supervision.sh` (+ `--uninstall`); server extracted to `tramokyo-server.sh`; Chrome now opens the local bootstrap page (`tramokyo-bootstrap.html`) that polls :3000 and redirects, so a reload into a dead/restarting server self-heals. Auto-login is a venue step (runbook §11). |
| 2 | Kill sleep (`caffeinate -disu`) + power checklist | **DONE** — caffeinate wraps the server (launchd path) AND runs session-level from the launcher (PID-filed); `tramokyo-stop.sh` now kills only PID-filed processes it started, never whatever is on :3000. Checklist added as runbook §11. |
| 3 | Full dress rehearsal | **HUMAN — outstanding** (PRE-SHOW #1). |
| 4 | Blob-URL leak in `resolve-audio-url.ts` | **DONE** — previous object URL revoked on re-mint (module-level map keyed by recording id); `blob:` URLs never persisted to sessionStorage (signed URL cached instead); persisted legacy `blob:` entries purged on read; `clearCachedUrl` also revokes. All exports/signatures preserved. |
| 5 | 3D force-remount fallback → 2D visualizer | **Other agent's lane** (`visualizer.tsx` is outside this workstream's ownership). |
| 6 | `reload` command on the phone remote | **DONE** — `/remote` Recovery section with confirm-gated "Reload kiosk display", through the `/api/pack/remote` bus, handled in `use-kiosk-remote.ts` (`location.reload()`, any context). Failed sends now surface an error banner instead of a silent catch. |
| 7 | `git fetch` before laptop work | **DONE** — repo synced to prod HEAD `246daf11` before this pass. |
| 8 | Quarantined tracks in the offline pool | **DECIDED: EXCLUDE (Karel, 2026-08-25) + DONE** — `QUARANTINED_RECORDING_IDS` (imported from the canonical `welcomeHome.ts` list, no copy-drift) filters the loop fallback pool and the legacy kiosk pool in `room/installation/page.tsx`. Also: per-journey safety caps now derive from track duration + 90s margin (`journeyCapMs`, floor 8 min) so no track can be cut mid-piece; the wedge watchdog scales with the longest cap and only reloads once the server answers a probe. |
| 9 | Runbook update + plan into docs/ | **DONE** — `installation-venue-setup.md` rewritten (two-program framing, fallback-library truth, power/sleep checklist, reharvest-restart gotcha, offline-monitoring reality, `/api/pack/remote` trust model, `/demo` quality correction, reload + supervision docs); this file is the plan's durable home. |
| 10 | Re-export + re-harvest right before the event | **HUMAN — outstanding** (PRE-SHOW #2). |
| 11 | Fallback image library empty | **Runbook claims corrected** — documented as "not populated; packed imagery is the offline backbone"; manifest keys updated to the current journeys. Populating it (online-kiosk backup only) remains optional. |
| 12 | De-risk the build path | **PARTIAL** — hardcoded nvm v22 path removed (dynamic node resolution; Node 20 documented for rebuilds). `.next` backup / second laptop is PRE-SHOW #3. |

Also closed from the same pass: the dead debug HUD (`?debug=1` works
again on the installation page).

---

## Architecture cheat-sheet (what runs where)

```
Tramokyo.app ──▶ tramokyo-kiosk.sh
                  ├─ caffeinate -disu            (session, PID-filed)
                  ├─ launchd loaded?  ──▶ kickstart com.resonance.tramokyo
                  │        └─ tramokyo-server.sh ──▶ caffeinate -disu npm run start  (OFFLINE_PACK=1)
                  ├─ else: nohup tramokyo-server.sh  (own process group, PID-filed)
                  └─ Chrome --kiosk file://…/tramokyo-bootstrap.html
                           └─ polls :3000 ──▶ /room/installation?loop=1

Phone (hotspot) ──▶ /remote ──▶ /api/pack/remote (in-memory bus, offline-only)
                                   ▲ kiosk polls every 2s (use-kiosk-remote)

Tramokyo Stop.app ──▶ tramokyo-stop.sh  (Chrome profile, bootout launchd,
                                         PID-filed server group + caffeinate — nothing else)
```
