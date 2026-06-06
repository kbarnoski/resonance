# Morning digest — last updated 2026-06-06 12:35 UTC, cycle 331 (adult · WIDE)

## ☀️ Open this first
- **[/dream/358-beat-mirror](https://getresonance.vercel.app/dream/358-beat-mirror)** — the lab's **first beat tracker**. Press Start: an internal **112 BPM** groove plays and the machine **finds the pulse** — a big BPM readout settles near 112, a confidence bar climbs amber → violet → **emerald (locked)**, and a clinical pulse flashes on each predicted beat. A scope along the bottom shows *what it heard* (onset ticks) vs *what it predicts* (beat ticks) — when they line up, it's locked. Switch to **Mic** and clap/play at it (analysis only, never recorded).
  - *Why this one:* it's the most **legible** adult piece in a while (your "make the machine's listening visible" note) and a real **live-performance** tool — "it found my tempo." The internal 112 groove is a *known answer*, so the demo proves the pipeline even on a phone with no mic.

## Also explored this fire (2 more — banked in IDEAS, both build-clean, near-ship)
- **357-euclidean-orrery** — a self-playing **polyrhythmic clockwork**: five coprime rings of Euclidean rhythms (Bossa clave E(5,16), tresillo-family…) phasing in and out of alignment over minutes (Reich *Piano Phase*). The lab's first Euclidean-rhythm piece. **Strong next-adult build.**
- **359-tonnetz-walk** — **walk through harmonic space** on Euler's Tonnetz: a self-touring lattice where neo-Riemannian P/L/R moves glide between triads in just intonation, every chord named. The closest runner-up — the lab's most legible *harmony* piece (the perfect complement to 358's *rhythm* legibility).

## How this was made (the studio choreography)
- **WIDE fan-out** (alternating off last fire's DEEP): three *unrelated* adult directions — rhythm-analysis (358), generative-rhythm (357), harmony-navigation (359) — built by three parallel builders, each clearing the ambition floor via different input × output × technique. Shipped the most legible + most self-verifying; banked the other two. One commit.
- Diversity audit banned **touch INPUT (4×)** and **kids VIBE (5×)** from the last 10; 358 dodges both (mic + internal groove · three.js · clinical). All three explorers avoided Canvas2D, HRTF, and the his-piano→nebula rut.

## Open questions for you (carried — your call unblocks these)
- **`351-erosion`** (a tape that's more ruined each morning) is triple-banked and ready but keeps losing curation because its hook is **invisible on a first open**. Ship it unconditionally next adult? Reframe it to open already-half-eroded? Or leave banked?
- **AI-pipeline-chain in an AV piece** is still blocked on a small paid FAL budget grant — one word and I build it.

## Caveats
- `358` is **build-verified, not browser-verified** — the internal-groove lock is engineered-reliable, but **mic-path tempo lock and audio latency are unmeasured** (the visual pulse phase vs room sound on the mic source is approximate). three.js visual fit + iOS unlock unconfirmed without a device.
- **GPU verification debt (still open):** `323-latent-condensation` + `327-physarum-choir` have never run on real hardware — worth a browser-verify pass before the next big WebGPU build.
