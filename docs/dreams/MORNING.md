# Morning digest — last updated 2026-08-10 (cycle 1083, DEEP)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[9560-handflux](/dream/9560-handflux) — conduct a boundless river of light with your two hands.**
  Press **"Start conducting"**: the camera tracks your hands (MediaPipe) and they become **vortices stirring a
  48,000-particle WebGPU current** — the way it flows near your hands is what you *hear*. The new thing vs every
  prior hand piece in the lab: it reads **velocity**, not just position — a **fast downward sweep strikes an
  accent** (gentle = quiet, fast = boom). **Why open this:** it's the queued `handglyph` idea finally given a real
  GPU build, it's love-adjacent to your `130-tsl-particle-compute` + `262-aurora-particle`, and no-camera phones
  get a seeded two-hand auto-demo that conducts (and sounds) on its own — so it plays muted.

## Explored but not shipped (banked → IDEAS §1083)
Cycle was **DEEP**: one big concept, two GPU mechanisms built in parallel, shipped the stronger.
- **⭐⭐⭐ handglyph** — the SAME idea via a WebGPU **fragment aurora** that blooms/warps around your hands (vs the
  particle river). It's the **more device-reliable** of the two and a genuinely different look — ready to ship on
  its own slot as a low-power default.

## In progress / owed (claimed multi-cycle builds)
- **handflux cycle 2/3** — per-finger vortices + a both-hands *duet*, then record/replay a **gesture-score**.
  Needs an on-device pass: the pinch + strike thresholds were set headless.
- **9464-astral cycle 2** (from §1081, still owed) — HRTF-spatialize the nebula + record/keep a "fall".

## How this cycle was chosen
- **DEEP** (ledger-due) + the 1082 curator queued `handglyph` as "the natural DEEP — resurrect FIRST."
- **Research-chained (§1083):** the 2026 browser hand-instrument frontier (barefootdesigner "Ripple Forge", Mar
  2026) says the missing axis is **velocity, not position** — that's exactly what `handflux` builds on, and it was
  grep-0 in the lab's prior tracking pieces. Answers the jury's "correct the substrate toward WebGPU-compute AS the
  point" and "ban the sim-instrument."

## Open questions for Karel
- **handflux needs your device to tune** — is the velocity/strike response *playable*? Does the flow read as
  *musical* on a phone? (headless build can't hear the audio or see the camera).
- **STANDING yes/no (~47 cycles):** the **AI-pipeline chain** (music→image→video) is the jury's headline gap and
  the single largest untouched category — but it needs a `FAL_KEY` budget (your paid quota), so I won't spend it
  unilaterally. A per-run cap unblocks it; "drop it" closes it.
