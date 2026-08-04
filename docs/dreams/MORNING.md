# Morning digest — last updated 2026-08-04 (cycle 1013, WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[6392-stemfield](/dream/6392-stemfield)** — **fly INSIDE your own recording, pulled apart into its voices.**
  Drop an audio file — **your Path piano is the ideal input** — and it separates the recording *live, in the
  browser, with no AI model* into four voices (the percussive attacks, the bass, the harmonic body, the air).
  Each becomes a glowing 3D body floating in space. You orbit and fly through them, and **remix by touching**:
  tap a body to solo it, mute it, or push its level — and muting genuinely removes that voice from the sound,
  because the mix is rebuilt from the separated streams.
  **Why open it:** it finally does the thing you keep asking for — **use your real recorded music as the
  material** — in a new way: not "visualize the track," but pull it apart and let you play with its pieces.
  It's alive the moment it loads (a little synthetic four-part bed plays so you can try the mixer with no
  file), then drop a track and fly inside *your* sound. Best on a device where you can drop a file; solo piano
  separates cleanest.

## How I picked it (WIDE fire — 3 unrelated instruments, 1 shipped)
Rule this cycle forced a spread: the last 10 nights leaned hard on WebGL2 shaders (4×) and self-playing
pieces (5×), so both were off-limits. I built three genuinely different instruments on three *fresh* inputs
and shipped the one that cashes today's research and your standing "use my real music" ask:
**drop a file → separate → play the voices.** (Technique: classic median-filter harmonic/percussive
separation, Fitzgerald DAFx 2010 — the no-ML browser version of the 2026 real-time stem-splitting frontier.)

## Also explored, banked verbatim (IDEAS §1013)
- **6424-marble** ⭐⭐ — **draw a landscape and hear it play itself**: glowing marbles tumble across terrain
  you sketch and ring tuned notes as they roll (Iwai *Electroplankton* lineage). The most instantly-legible
  and most robust of the three — resurrect-first, a lovely playful piece.
- **6408-cadence** ⭐⭐ — **play music by WALKING**: your phone's step cadence becomes the tempo and a groove
  phase-locks to your gait. Best experienced moving — I'll resurrect it on a slot where you can test it on
  your actual phone.

## Open questions for Karel (both need your call — stop-or-build)
1. The **shared multi-device room** (two phones in one acoustic space) — asked for ~13 cycles, and I keep
   building solo pieces instead. Build it for real next, or strike the lane? (It needs a signaling store I
   can't stand up headlessly, so it needs your go-ahead.)
2. The **music→image→video AI pipeline** — "queued" ~31 cycles; it needs `FAL_KEY` funded to ever ship.
   Fund it, or strike it permanently?

*(Not runtime-verified — headless, no GPU/speakers. Full `npm run build` passed clean this cycle; the live
feel — do the separated voices read clearly, does soloing sound musical on a real track — wants your device
and a dropped recording.)*
