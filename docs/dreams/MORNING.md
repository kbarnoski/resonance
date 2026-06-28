# Morning digest — last updated 2026-06-28 (cycle 583)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 583 (ADULT · WIDE, 3 explorers, shipped 1)
- **`1011-fm-aurora` — tilt your phone to sculpt an FM synthesizer's timbre, and watch the spectrum bloom.** A soft D-Lydian arpeggio plays itself; tilting through a 2-D timbre-space sweeps the modulator ratio and the FM "modulation index," so a luminous cyan-magenta chrome spectral ridge sprouts more and more sidebands as you move (plus a pulsing DX7-style operator graph). **Why open this:** it's the **lab's first-ever FM synthesis engine** (grep-0× across 1000+ prototypes) — pure timbre, the exact thing you asked the adult lane to get back to, and the *only* build of the fire shipped with a passing headless test suite (11 Bessel-math tests). Tilt works great on your phone; no gyroscope → drag the canvas; do nothing → it auto-sweeps and sings.
- ⚠️ **What I couldn't verify:** no audio or GPU in my sandbox, so the audible voice balance / ADSR feel / that the limiter never clips are *reasoned, not heard*. A 20-second tilt on your phone settles it; worst case the pointer + auto-demo fallbacks keep it sounding.

## Also explored this fire (built complete, banked — not shipped)
- **`1013-mantra-glass`** ⭐ — **your real piano, ring-modulated like Stockhausen's *Mantra*** — a swept carrier turns it to shimmering metallic glass with blooming sidebands (bulletproof synth-piano fallback if the recording won't load). This is my pick to ship **next adult cycle**: it's the one that finally uses *your actual music* in a fresh, pianist-personal way.
- **`1012-fold-tide`** — **sing into a West-Coast wavefolder** (Buchla/Serge, also 0× in the lab): soft voice = pure sine, loud = the wave creases into harmonics on a live oscilloscope. Banked because mic permission is the worst 6:30 phone check.

## Why this shape (WIDE, adult, pure-timbre)
- The jury said the adult lane hardened into one formula ("invert a neural paper, render on parchment, drive from the keyboard") and that the best builds *lead with a novel technique*. My diversity audit also **banned physics-sim-as-instrument (5× of the last 10!) and pointer/touch input (4×)**. So I went WIDE with three classic *deterministic timbre* engines the lab has never touched — FM, wavefolding, ring-mod — each non-physics, non-pointer, pure timbre. Today's research → today's build: the 2026 synthesis frontier is all-neural, so reviving the great offline-DSP engines is the contrarian on-mandate move.

## Open questions for Karel
- Ship **`1013-mantra-glass`** (your piano × Stockhausen ring-mod) next adult cycle, or push deeper on FM (1011) first?
- Small doc-debt I noticed: the RESEARCH.md dive paragraphs for cycles 579–582 were referenced but never actually appended. I added §583 cleanly; want me to backfill 579–582 next research lull?
