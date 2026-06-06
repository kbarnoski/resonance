# Morning digest — last updated 2026-06-06 (UTC), cycle 333 (adult · DEEP)

> Acting on your **jury verdict** (`docs/dreams/JURY.md`): *feed the legible/instructional lane (358/353/345), starve the adult JI-drone monoculture, and stop the screen hiding inside SVG.* Today's odd cycle is **adult**, so I built the jury's explicitly-named "obvious next one" — a chord/key analyzer — and pushed it past mere chord-naming into **functional/cadence teaching**.

## ☀️ Open this first
- **[/dream/365-cadence-ladder](https://getresonance.vercel.app/dream/365-cadence-ladder)** — press **▶ Begin**. A real-time **harmonic analyst** names the **KEY** you're in (Krumhansl-Schmuckler key-finding), the **Roman-numeral function** of every chord, and renders harmony's pull-and-resolve as a tension ladder: **Tonic** (rest, bottom) · **Subdominant** (departure, middle) · **Dominant** (tension, top). Chords drop into their zone; **cadences flash named arcs** — V→I *authentic* (emerald), IV→I *plagal* (violet), V→vi *deceptive* (amber); when it **modulates**, a ripple sweeps and every chord re-labels. **Plug in a MIDI keyboard to play your own chords in.**
  - *Why this one:* it's the lab's **first key-estimation + functional analysis** — `229-chord-canvas` can say "Cmaj" but never "that's IV in G, and you just made an authentic cadence." It teaches *why* harmony moves, not just *what* the chord is — your instructional lane, deepened. It proves itself 358-style: the demo is a **known progression** (C major → modulates to G), so you can check every label against the right answer on your phone with no hardware.

## Also explored this fire (2 more — banked in IDEAS §333, both build-clean)
- **364-tonal-orbit** — **Elaine Chew's Spiral Array** in 3D: chord/key "center of gravity" spheres travel through a helix of fifths, and you *watch* the tonal center migrate across space when the music modulates. The most ambitious technique of the three — **I've teed it up as the multi-cycle thread to actually deepen next adult cycle** (your standing "deepen something" ask, in a fresh non-Mirror-Canon form). Lost today only on legibility (an abstract drifting sphere vs. the ladder's named arcs).
- **363-key-compass** — a **circle-of-fifths** wheel that *rotates to re-center* when you modulate (the cleanest single "the ground moved" gesture). The most iconic/readable take; lost only because it "just" names key+function without teaching cadence. A great simpler companion.

## How this was made (the studio choreography)
- **DEEP fan-out** (alternating off last fire's WIDE): ONE concept — *"name the key + function you play, live"* — attacked three ways (functional ladder / spiral-array tonal space / circle-of-fifths wheel) by three parallel builders, curated to the **most instructional** winner. Shipped one, banked two. One commit, `npm run build` ✓.
- Dodged every jury ban: **MIDI/internal input** (not touch, not mic), **three.js** output (not SVG — and it cools the over-used raw-WebGL2), an **instrument-analysis tool** (not a drone).

## Open questions for you (your call unblocks these)
- **Deepen `364-tonal-orbit` (Spiral Array) next adult cycle?** It's the cleanest answer to your "actually deepen something" provocation and it's banked build-clean. Say the word, or tell me to keep going WIDE.
- **`351-erosion`** (a tape more ruined each morning) is still triple-banked — its hook is invisible on a first open. Ship unconditionally? Reframe to open already-eroded? Or leave it?
- **AI-pipeline-chain in an AV piece** still blocked on a small paid FAL budget grant — one word and I build it.
- **GPU verification debt:** `323-latent-condensation` + `327-physarum-choir` have never run on real hardware — worth a browser pass before the next big WebGPU build.

## Caveats
- `365` is **build-verified, not browser-verified** — the K-S key-finding, Roman-numeral/cadence logic, and three.js scene are written correct and `npm run build` passes clean, but **the hysteresis feel on short demo chords, the cadence-arc/drop-animation/label rendering on a phone, iOS AudioContext unlock, and real Web MIDI** are unverified here (no GPU/MIDI in this sandbox). Likely small tunes if off.
