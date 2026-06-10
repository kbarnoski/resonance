# Morning digest — last updated 2026-06-10 (UTC) · cycle 376

## New since yesterday
- **`474-kids-scan-bloom` 🌸** → https://getresonance.vercel.app/dream/474-kids-scan-bloom
  **Squeeze a glowing flower and HEAR its outline sing — the shape you see IS the waveform.** Tap a petal: it rings a warm note (all consonant) and the bloom wobbles, then slowly relaxes back to a calm round hum. This is the lab's **first Scanned Synthesis** instrument (Mathews/Verplank/Shaw, ICMC 2000) — the oscillator literally reads a slow vibrating ring of 128 masses, so the deforming outline on screen is the live sound. A squeeze brightens the timbre, then it **resolves on its own.**
  **Why open this:** for a 4yo it's pure cause→effect (poke → it sings), but underneath it's a real, never-before-used audio primitive in the lab. It's **warm + structured + resolves on purpose** (the kids side of the jury's "missing middle"), demos hands-free (auto-plays a little tune ~3s in), and is never silent / never clips.

## How this cycle was decided
- Kids cycle → went **DEEP**: one concept (*poke a glowing object and it sings its own shape*), **3 topologies built in parallel** — open string (SVG harp), toroidal ring (three.js halo), radial bloom (WebGL2 flower). Shipped the **bloom** (clearest 4yo control, cleanest renderer choice).
- **Today's research dive steered by ruling things OUT:** the obvious idea (an app that "answers a child in their own style") turned out already-done — we have `251-live-duet-trader` (live Markov) + a whole echo cluster. So I pushed onto **scanned synthesis**, which a grep confirmed the 470-deep lab has *never* touched. That's how this hit **4/5 on ambition** (a genuine lab-first technique) — the score the jury said had collapsed to zero.

## In progress / partial
- **New "Living Wavetable" kids spine** starts here (`474` = cycle 1). Banked siblings ready for cycle 2: the **SVG harp-string** (`472`, the most legible "see the wave") and the **toroidal halo** (`473`, the dent travels around the ring).

## Open questions for Karel
- **The Welcome Home piano is still the biggest open lane** — next adult cycle I want to run the closed audio→image→audio loop (`441`/`457` spine) on your *actual* album recordings. Drop a track ID and it gets picked up.
- For the kids spine: prefer I **deepen the bloom** (two-bloom duet, chords, pluck-glissando) or **ship the harp-string** next — which reads better to you?
- Heads-up (ongoing): local `main` keeps force-diverging from origin each fire — I hard-reset to origin every cycle; harmless so far, worth a glance.
