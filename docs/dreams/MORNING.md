# Morning digest — last updated 2026-10-02T01:0xZ (17:45 PT fire, cycle 1274)

> **Jury verdict today** (landed mid-fire): great divergence, but the lab is minting fresh ideas faster than it finishes them — **the new #1 is "finish ONE concept to cycle-3, not a seventh new one."** I'd already shipped tonight's fresh build before this verdict posted; I've flagged the cycle-3 tension as the open question below (every cycle-3 candidate is two-hand, which collides with the earlier "break off two hands"). See `docs/dreams/JURY.md`.

> **Tonight: your body makes the music run backward.** This fire conducts the one axis
> the lab had *never* touched: **time itself**. Lean forward and your recording surges
> onward; lean back and the very same music **runs in reverse**. WIDE ×3 — one shipped,
> two strong SVG siblings banked.

## New since yesterday
- **`18576-ebbline`** → https://getresonance.vercel.app/dream/18576-ebbline
  **Lean your torso to run your recording forward or backward.** Sit so the camera
  sees your head and shoulders. Lean **forward** → the take flows onward and faster.
  Sit **upright** → a near-still shimmer, held in place. Lean **back** → the *same*
  music ebbs in reverse (piano attacks become swells — it's lovely). It's two synced
  copies of your take — one forward, one reversed — crossfaded and locked to a shared
  playhead so the reversal reads as the music itself running back, not a second track.
  Drawn as a **garnet-to-smoke tide** of filaments streaming left when it flows forward,
  right when it runs back. All-fresh: torso-lean (not hands, not face), **SVG** (rests
  both WebGPU and three.js), a new wine-and-ash palette, and a TIME-DIRECTION verb the
  lab had never conducted.

## In progress / partial
- Nothing half-built. **WIDE ×3** fire — two fully-built, QA-passed SVG siblings are
  **banked** (IDEAS §1274): **`swellform`** (open your whole body to bloom the take,
  curl in to pull it to an intimate near-silence — a dynamics pedal, nacreous bloom;
  this is its 2nd bank, the ready no-new-work next winner) and **`formnav`** (your
  posture scrubs through the piece's *sections* — intro at the bottom, climax at the
  top, a thermal spine).

## Research findings worth a look
- **Variable-Rate Harmonic-Percussive TSM** (arXiv:2609.18999): a real-time engine
  whose whole premise is that playback rate "must change continuously in response to a
  live performer." Ebbline makes **your torso** that performer — conducting not just
  speed but **direction**. (It's ~2.5mo old, so I didn't badge it as "last-14-days"
  research — just the honest anchor the build came from.)

## Open questions for Karel
- **30-second check on ebbline:** allow the camera, then lean forward and back — does
  the music surge and reverse smoothly, and does the reversal sound like *your* piece
  ebbing? (Cloud can't test a webcam or play audio — the demo drive, the dual-buffer
  engine and the full control path are code-verified; the live lean feel and the
  reversal's sound on your real take are the only unconfirmed parts.)
- **Cycle-3 is the aging ask.** The jury wants me to prove a concept can reach *part
  three*, not just part two — but every candidate (chordfold, throatmorph) is a two-hand
  piece, which collides with "break off two hands." Want me to take the cycle-3 merge on
  a future fire anyway, or keep minting fresh non-two-hand signals? One word decides it.
- `main` synced cleanly again — the force-rewrite problem stays fixed.
