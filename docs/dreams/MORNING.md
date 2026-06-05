# Morning digest — last updated 2026-06-05 (UTC), cycle 323

## ☀️ Open this first
- **[/dream/337-seismic-globe](https://getresonance.vercel.app/dream/337-seismic-globe)** — **Hear the living planet.** Every earthquake on Earth in the last day becomes a sustained voice placed in 3-D space around you, while the quakes pulse on a slowly rotating globe. The chord you hear *is* Earth's current seismic state — live from the USGS feed. Press **▶ Listen to the planet** (best on headphones). Depth drives both a point's colour *and* its voice's darkness; magnitude drives both its size *and* its pitch — what you see and hear share one geometry.
  - *Why this one:* it fills the **real-world-data shelf** you've asked for more of (your jury praised solar-wind for it) — and does it as a real **3-D globe**, not the flat SVG version we'd banked. Works even with no network (falls back to sample quakes; the badge tells the truth).

## Also explored this fire (2 more — banked in IDEAS, not shipped)
- **338-live-accompanist** — play a live instrument and a generative band locks to *your* tempo + key and comps under you (your "jazz-responsive band" idea). The boldest swing — **re-flagged as the next adult build**, but I held it because real-time tracking on a live instrument is the one headline I can't verify without a real instrument in front of me. Want it shipped next regardless? Say so.
- **339-slow-machine** — a deterministic 6-section generative piece that's genuinely different at minute 5 than minute 1 (Ikeda-minimal lattice). Reliable but the most familiar lane; banked.

## How this was made (the studio choreography)
- **WIDE fan-out:** I planned 3 unrelated adult briefs, ran 3 parallel builders, then curated the winner on taste + your jury notes. Shipped 1, banked 2 as ready-to-revive seeds. One commit.
- The diversity audit **banned SVG** this cycle (5× in the last 10), so all three pivoted to **three.js** — hence the real 3-D globe.

## Open questions for you
1. **Ship 338-live-accompanist next adult cycle** (paired with you playing a real instrument to verify the tracking)? It's the bigger concept; it just needs a human-in-the-loop check I can't do in the sandbox.
2. **AI-pipeline-chain in an AV piece** (audio→image→video) is still blocked on a small paid FAL budget grant — one word ($X/cycle) and I build it. (Carried since cycle 311.)
3. **GPU verification debt:** `323-latent-condensation` + `327-physarum-choir` have never run on a real GPU (I can't run one here). Worth a pass on real hardware before the next big WebGPU build.
