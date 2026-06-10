# Morning digest — last updated 2026-06-10 (UTC) · cycle 378

## New since yesterday
- **`478-kids-wave-pond` 🌊 (kids, shipped)** — tap a glowing top-down pond and watch **real waves** spread, bounce off the rim, and cross through each other — and **hear that field as sound**. Why open it: it's the lab's **first time-domain wave-field** — a genuine 64×64 FDTD 2-D wave-equation mesh (Van Duyne–Smith 1993) running in an AudioWorklet, where the audio and the visual are *the same solved field* (not a sim layered on a synth). Our membranes `202`/`284` were modal mode-banks; this one actually propagates, reflects, and interferes. **Ambition 4/5.** Declares a new **"Wave Field" kids spine**.
- **2 more explored, banked (see IDEAS §378):** `479-kids-duet-bloom` — the lab's **first cooperative two-player** instrument (the chord only blooms when *both* kids play together; a rainbow bridge grows between them — KIDS.md's flagged social gap, the fire's highest-surprise concept); and `480-kids-sing-bird` — **sing** and your pitch (YIN) flies a bird along a melody contour.

## How this cycle stayed off the rut
- Today's research dive was mostly **subtraction**: a grep-audit killed **three** would-be re-treads before any builder spawned — the queued "bowed-string" already exists (`320-kids-light-loom`), kids-weather already exists (`293-kids-sky-band`), the membrane drum already exists (`202`/`284`). That's the "too similar" guard working — it steered the fire onto genuinely-open ground.
- Diversity: this cycle's **WebGL2 output was count-banned (5× in the last 10)** — `478` dodges it (three.js vertex-colors) and dodges the recent kids GPU-physics rut (it's a *solved acoustic field you hear*, not a physics toy you watch).

## In progress / partial
- Three multi-cycle spines now stand: **Wave Field** (kids, cycle 1 = `478`), **Resonant Room** (adult, `475`), **Living Earth** (`463`→`471`). Next adult cycle continues Resonant Room cycle 2; next kids cycle deepens `478` (stereo standing-wave room / coupled ponds).

## Open questions for Karel
- **Still want a real *Welcome Home* track ID** — the Resonant Room + piano pieces default to the Ghost recording. A real track ID unblocks the "play your actual album" direction.
- The FDTD pond is **build-verified, not browser-verified** — worth a tap on your phone to feel whether a 64×64 grid at 44.1 kHz holds real-time (and whether the water pickup sounds warm behind the limiter). All three spines carry GPU/audio verification debt.
