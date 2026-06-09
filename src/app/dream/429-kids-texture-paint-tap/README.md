**For**: kids (4+)

## Texture Paint — Foley Brush Lab

Texture Paint is a touch-first canvas toy where every brush stroke produces both a hand-drawn visual texture **and** a matching procedural foley sound — no notes, no melody, only raw material timbre. A child dabs or drags on a dark canvas; a tap on a large swatch selects one of five "texture brushes" (Crunch, Pop, Tap/Wood, Scratch, Splash), each with a distinct look and a distinct non-musical sound. Two fingers / two children can paint simultaneously via the Pointer Events multi-touch model.

## Impulse + Resonator Foley — how the sounds are made (and kept pitch-less)

Each sound is a **foley event**: a brief noise excitation (white-noise burst, click, or friction sweep) fed into one or more band-pass / resonant filters whose centre frequencies are **randomised within a wide inharmonic range on every hit** — so no fixed frequency is ever struck twice, and no sequence of hits can accidentally spell a scale or melody. Heavy per-filter damping (short decay, high Q) gives each material its characteristic "snap" or "rub" without sustaining long enough to register as a note. The five textures:

- **Crunch** — a cluster of 4–7 randomised noise-burst crackles through high-frequency inharmonic bandpasses (1.8–4 kHz), mimicking leaves/gravel.
- **Pop / Bubble** — a single band-pass blip (Q 6–14, centre 300–1200 Hz randomised), fast envelope, soft round character (bouba).
- **Tap / Wood** — a tiny click excitation through two short-decay BPs at inharmonic centres (~1.3 kHz + ~2.7 kHz), randomised per hit so repeated taps never form a tune.
- **Scratch** — a high-pass + bandpass friction sweep (3–7 kHz), short, raspy (kiki character).
- **Splash / Drip** — a noise burst followed by a low-pass sweep tail (1.6 kHz → 80 Hz) with inharmonic Q, never a pitched glide.

A `DynamicsCompressor` (threshold −6 dB, ratio 20:1) and a very low master gain (0.22) act as a brick-wall limiter ensuring the output can never blast small ears. Per-brush cooldowns (45–90 ms) prevent machine-gun saturation on rapid drags. A soft always-on ambient bed — wide-Q bandpass noise at ~400 Hz and ~150 Hz, gain 0.018 — keeps the app textural and non-silent without any pitched drone.

## Cross-modal Sound-Symbolism (Bouba / Kiki)

The visual design deliberately mirrors the audio character using **sound-symbolic shape correspondence** (Wolfgang Köhler, *Psychological Research*, 1929): spiky star/shard shapes (Crunch, Scratch) pair with sharp, high-frequency sounds; rounded bubbles and blobs (Pop, Splash) pair with soft, low-frequency timbres; angular blocks (Tap) pair with a dry, percussive knock. This is not decorative — it is intended to make the cause-and-effect mapping legible to pre-literate children who cannot yet read the brush names.

## Kids Design Guarantees

- All swatch tap-targets are ≥64 × 64 px with generous spacing; no reading required to play (icon + colour carry the message).
- Every touch produces an immediate visual stamp and audio event (<50 ms).
- No fail states, no scoring, no sudden-loud surprises. The limiter is always active.
- Auto-demo fires at ~1.8 s on load so a reviewer (or a child) sees and hears the prototype without touching anything.
- iOS-safe: `AudioContext` is created and resumed inside the first user gesture; a "Tap to Start" overlay appears if autoplay is blocked.
- Full teardown (cancel timers, suspend/close `AudioContext`) on React unmount.

## References

- **Wolfgang Köhler**, "Gestalt Psychology" / bouba–kiki sound-symbolism experiments (1929) — round shapes map to voiced soft sounds; angular shapes to sharp sounds.
- **Andy Farnell**, *Designing Sound* (MIT Press, 2010) — procedural/physical foley synthesis, noise-excitation + resonator models for material textures.
- **Perry Cook**, "Physically Informed Sonic Modeling (PhISM): Synthesis of percussive sounds" (*Computer Music Journal*, 1997) — particle/crunch foley modelled as stochastic excitation through resonant filters.

## Build & Verification Status

Build-verified (TypeScript + ESLint `next/core-web-vitals` + `next/typescript`): no unused imports or variables, no `use`-prefixed helper functions, all JSX special chars escaped, `react-hooks/exhaustive-deps` satisfied via refs for audio/rAF state.

**Unverified surface** (build-verified, not browser-verified): Web Audio API filter behaviour across Safari/iOS vs Chrome/Android may differ slightly in resonance damping; the `setPointerCapture` call is wrapped in try/catch for environments that restrict it; canvas resolution on high-DPI screens will double pixel density but not cause functional failure.
