# 609 — Kids Blow Parade

**What if a 4-year-old BLOWS into the mic and a parade of silly balloon-creatures
inflates bigger and bigger, then raspberry-deflates and zooms around when they
stop?**

A loud, giggly toddler toy. Breath into the mic puffs up a googly balloon-creature
bigger and bigger with a rising stretched-neck squeak. The moment you stop, it
rips a whoopee-cushion **raspberry** and zooms + tumbles erratically around the
screen. A parade of bold-colored creatures recycles forever so it always feels
alive.

## How to use

1. Tap **▶ Play!** (this unlocks audio — required on iOS/Safari).
2. **Blow** into the mic. The front balloon inflates while you blow.
3. **Stop blowing** → raspberry + the balloon flies off, tumbling.
4. No mic? **Hold the big 💨 button** or **press/hold Space** — fully playable.
5. Leave it alone ~2.5s and it **demos itself** on a loop (ghost blow).
6. 🔊 toggles sound. "Read the design notes" is bottom-right.

Everything is icon/color driven — **no reading required**, no fail states, no
"wrong". Tap targets are ≥64px (Play and 💨 are far bigger).

## The technique

- **Breath-energy blow detection (`detect.ts`)** — analyses the mic via an
  `AnalyserNode` (1024-pt FFT, low smoothing for latency). A blow is **broadband
  + noise-like + non-tonal**, so each frame scores three things over ~120Hz–6kHz:
  - **energy** (broadband loudness),
  - **spectral flatness** = geometric mean / arithmetic mean (≈1 for noise/breath,
    ≈0 for a tone),
  - **peakiness** = strongest bin / average bin (spikes for tonal yells/singing).
  The gate fires only when it's loud **and** flat **and** not peaky — so a yell or
  sung note is **rejected**; only true breath inflates the balloons. Output is a
  smoothed `strength` 0..1 with **fast attack / slow release** + a short sustain
  window, so the wind gauge is legible and doesn't flicker.
- **Balloon inflation physics (`scene.ts`)** — the active balloon's target radius
  grows with sustained blow (capped so it can't fill the screen). On release it
  enters a `flying` phase: random thrust puffs, drag, spin, edge-bounce, and
  steady deflation, then recycles to a fresh creature.
- **Raspberry / whoopee synthesis (`audio.ts`)** — detuned saw+square through a
  moving lowpass, with a **flutter square-wave LFO** on the cutoff for the "pbbbt"
  buzz, plus filtered noise (escaping air). Pitch and flutter rate **fall** as it
  deflates; bigger balloon → longer, fatter raspberry.

## Output: WebGPU primary + Canvas2D fallback

- **WebGPU (`rendergpu.ts`)** — hand-written **WGSL**. One **instanced quad per
  balloon**; per-instance data (center, radius, hue, squash, spin, eye look-dir,
  blink, mouth-open) is uploaded to a storage buffer each frame. The fragment
  shader draws the entire creature procedurally: teardrop body radial gradient,
  gloss, knot, two googly eyes with look-tracking pupils + catchlights + blink,
  rosy cheeks, and a mouth that opens into an "O" while inflating. Safari 26+
  supports WebGPU on iPad/iOS, so this is the primary path.
- **Canvas2D (`render2d.ts`)** — the **same parade**: radial-gradient bodies,
  gloss, knot, googly eyes, cheeks, squash, and inflate-O mouth. Selected
  automatically when `navigator.gpu` is missing or init fails. A tiny badge
  (top-left) shows which path is live.

## Kid-safety

- Master chain: `masterGain (capped 0.55) → lowpass 7.5kHz → DynamicsCompressor
  (-18 / 6:1 / knee 12) → destination`. No piercing highs, no painful peaks.
- All one-shots use **soft attacks** (no scary transients). All gains are capped.
- A soft, **playful** ambient burble loops so it's never silent (not a warm drone
  — banned per the brief).
- Immediate response: every persistent audio node (master, ambient, the inflate
  squeak voice) is pre-built at Start, so the first blow responds in <50ms.

## Named references

- **Party blower / whoopee-cushion foley tradition** — the raspberry timbre
  (buzz + flutter + escaping air) and the comic falling pitch.
- **Balloon physics** — the inflate → release → erratic flight arc.
- **Toca Boca interaction patterns for toddlers** — bold saturated colors as the
  language, no reading, no fail states, generous tap targets, instant delight.

## Files

- `page.tsx` — client component: gesture audio-unlock, mic permission, the
  rAF loop (detect → physics → audio → render), hold-to-blow + Space fallback,
  idle auto-demo, kid-safe UI.
- `detect.ts` — breath-energy blow detector (flatness + peakiness gate).
- `audio.ts` — kid-safe engine: ambient bed, inflate squeak, raspberry, pop.
- `scene.ts` — parade state + inflation/release physics.
- `rendergpu.ts` — WebGPU/WGSL instanced googly-balloon renderer.
- `render2d.ts` — Canvas2D fallback renderer.

## Known rough edges

- Blow thresholds (`energyFloor`, `flatnessMin`, `peakinessMax`) are tuned for a
  typical laptop mic in a quiet-ish room; a very noisy room or far mic may need
  the kid to blow harder. AGC is disabled to keep breath energy honest.
- Whispery breaths near a mic can be quite flat too; the energy floor is what
  keeps quiet ambient hiss from triggering inflation.
- WGSL face features are tuned in unsquashed local space; under extreme tumble
  spin the procedural mouth/eyes can look slightly off-axis for a frame — cosmetic.
- WebGPU init is async on first Start; on devices without it the Canvas2D path
  takes over with no visible interruption.
