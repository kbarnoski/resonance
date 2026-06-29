# 1056 · Key Bloom

**What if a keyboard were a psychedelic organ — each key you play blooms a
chrysanthemum of form-constant geometry, and chords stack into a living mandala
you compose in real time?**

A drug-free altered-states instrument. `state: psilocybin · pole: intense-warm`.
This is something you **play**, not a screensaver: press a key and you sound a
warm just-intonation tone *and* seed a blooming form-constant figure that grows,
folds into an N-fold kaleidoscope ("chrysanthemum opening"), and slowly fades.
Held chords sustain overlapping mandalas; release lets them dissolve.

## How to play

- **Computer keyboard (primary):** `A S D F G H J K L` are the nine scale
  degrees (just-intonation, off a warm A root). `Z` / `X` shift the octave down
  / up. Hold keys to sustain; release to dissolve. Press any key to start audio
  (a gesture is required to wake the AudioContext).
- **On-screen keyboard (touch / pointer):** tap the nine keys at the bottom —
  fully playable on a phone.
- **MIDI (bonus):** if a MIDI keyboard is present, `navigator.requestMIDIAccess()`
  wires note-on/off automatically; **velocity drives bloom size and brightness**.
  An emerald "MIDI keyboard connected" note appears only when a device is found.
  No device → silent, the computer/on-screen keyboard is unaffected.
- **Shimmer:** an opt-in, OFF-by-default luminance pulse routed through the shared
  safe-flicker engine (hard-clamped ≤3 Hz, soft sine, never a strobe). A **Kill**
  button stops it instantly. `prefers-reduced-motion` is honored by the engine.

## Subsystems

1. **Keyboard + Web MIDI + on-screen input** — three input paths into one note
   model with polyphonic note-on/off tracking.
2. **Polyphonic just-intonation organ** (`audio.ts`) — each voice is a small
   additive partial stack (1·2·3) plus a 2-op FM shimmer, soft attack / long
   release, subtly pitch-panned. 5-limit JI ratios off a movable root. Voice cap
   12 with oldest-steal. A low root+fifth drone bed ties chords together.
3. **Log-polar kaleidoscope bloom renderer** (`bloom.ts`) — Canvas2D, additive
   `lighter` glow, warm-organic palette.
4. **Convolution reverb** — a warm impulse response synthesised at startup in an
   `OfflineAudioContext` (no asset fetch), feeding a `DynamicsCompressor` glue
   limiter.

That is four subsystems, above the ambition floor of three.

## How it composes the shared engines

Imported from `src/app/dream/_shared/psych/`:

- **`logpolar.ts`** — the load-bearing piece. Each bloom's petals are laid out in
  **cortical space** and warped to the screen with `cortexToScreen(u, v)`, with
  the radius modulated by `formConstant(u, v, phi, freq, phase)` (or
  `honeycomb(...)` for the lattice form). So the geometry genuinely **is** the
  Bressloff–Cowan / Klüver form constants — concentric-ring tunnels, radial
  spokes, spirals, honeycomb — not arbitrary flowers. Mappings:
  - pitch → `freq` (higher notes → denser rings),
  - note index → `phi` / form-constant choice (cycles tunnel → spoke → spiral →
    honeycomb) and palette offset,
  - time-since-onset → `phase` drift **and** the N-fold kaleidoscope fold count,
    which blooms `2 → ~12 → settles ~6`,
  - velocity → bloom size and brightness.
- **`safeFlicker.ts`** — `createSafeFlicker({ maxHz: 3, defaultHz: 1.5, floor:
  0.6 })` is the ONLY luminance-pulsing path, wired to the opt-in OFF-by-default
  Shimmer toggle + Kill button; its `value(tSec)` multiplies global brightness
  (visual and a touch of master gain).

## Named references

- **Bressloff, Cowan, Golubitsky, Thomas, Wiener (2001)** — geometric visual
  hallucinations and the retino-cortical (log-polar) map; the formal basis for
  generating stripes/hexagons in cortical space and warping to screen.
- **Heinrich Klüver** — the four "form constants" (lattices/honeycombs, cobwebs,
  tunnels/funnels, spirals) recurring across psilocybin, LSD, migraine, flicker.
- **Iñigo Quílez** — kaleidoscope / domain-folding and domain-warp techniques
  (the N-fold wedge mirroring used for the "chrysanthemum opening").
- **Psilocybin "open-eye fractal enhancement"** phenomenology — slow organic
  bloom, warm-saturated palette, breathing geometry that intensifies then settles.

## Honest notes / unverified

- Built and type-checked, but **not yet verified against a real MIDI device** —
  the note-on/off parsing (status `0x90` with `vel>0` → on, `0x80` or `0x90`
  vel 0 → off) is standard but untested on hardware here. Web MIDI types are a
  local minimal interface (`MIDIAccessLike` etc.), not the full `lib.dom` set.
- 60fps with many simultaneous blooms is the target; petal sampling
  (`rings × angSteps × fold`) is tuned conservatively but heavy chords on
  low-end devices may dip. The trailing-wash floor keeps it warm under load.
- The synthesised reverb IR is a decaying low-passed noise burst — a plausible
  warm room, not a measured space.
