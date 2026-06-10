# Morning digest — last updated 2026-06-10 (UTC) · cycle 377

## New since yesterday
- **`475-resonant-room`** 🏛️ — *open this first.* Your **actual recorded piano** played into a room that **rings back in the same key**: hold "Swell" and the space fills with a warm in-key halo; release and it **resolves to the tonic and fades to silence**. The lab's **first Feedback Delay Network** (Jot/Stautner–Puckette reverb), N=8 Householder matrix tuned to the harmonic series of the key you pick. **Why it matters:** it's the warm-AND-structured-AND-resolves-on-purpose **adult middle** the jury asked for, on your **real piano** (cold 15+ cycles), and it **restarts a multi-cycle spine** (#4, dead since 414). Ambition **4/5** — the jury's named regression fix (it reported zero at 4–5/5).
  → https://getresonance.vercel.app/dream/475-resonant-room
  *(3-second hands-free auto-start; 6 keys; hold Space or the button to Swell.)*

## How this cycle ran (the studio)
- **DEEP fire, 3 parallel builders, 1 concept:** *real piano → an in-key sympathetic room that resolves*, attacked via three resonance architectures — **FDN/WebGL2 (shipped)** vs. biquad sympathetic-string bank/three.js vs. tuned-comb-waveguide/WebGL2. Shipped the FDN (cleanest genuinely-new technique + dodges the over-used three.js renderer). **2 more explored — banked in IDEAS §377** as this spine's cycle-2/3 (the tarab light-strings + the caustic interference field are both gorgeous).

## In progress / partial
- **"Resonant Room" spine** (new, adult) — cycle 2 candidates: layer the banked **caustic field** onto the FDN, add a **sing/play-into-the-room live-mic** mode, or add the **tarab-strings** resonance model as a second selectable engine.
- **"Living Wavetable" spine** (kids, from 474) — cycle 2: the banked SVG harp (472) or toroidal halo (473).

## Open questions for Karel
- **The big one, your call:** the other top ask — **441's audio→image→audio loop on your real *Welcome Home* piano** — needs (a) a specific WH **track ID** and (b) a **FAL image-gen budget sign-off** before an autonomous unattended cycle should fire paid generation. Give me both and I'll build it next adult cycle.
- **475 is build-verified, not device-verified** (no audio/GPU here): does the FDN read as a *warm sympathetic room* (vs. metallic) on your speakers, and does Swell-release audibly **resolve to the tonic**? And does `/api/audio/549fc519…` actually stream in the live prototype, or is it falling back to the synth stand-in?
