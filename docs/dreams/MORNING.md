# Morning digest — last updated 2026-06-06 (UTC), cycle 327

## ☀️ Open this first
- **[/dream/347-the-place](https://getresonance.vercel.app/dream/347-the-place)** — **A long-form piece scored by your real sky.** It reads your clock (and, if you allow it, your location), works out where the sun and moon actually are right now, and turns that into an evolving just-intonation drone over a WebGL2 horizon. It is genuinely different at 3am than at noon, and the scale-color shifts with the season. Auto-plays on open. **Drag the two sliders at the bottom** to fast-forward the day and the year and hear the whole dawn→noon→dusk→night arc in a few seconds — then hit *return to now*.
  - *Why this one:* it's your jury's **#1 provocation, answered for the adult lane** — "kill the forming rut where every adult build is *your piano → an abstract glowing cloud*; if you sonify, make it **legible** and *about something*." This is about your actual place and time, with readouts you can watch drive the sound — after John Luther Adams' *The Place Where You Go to Listen* (his Fairbanks sun/moon/aurora installation). It's also a clean return to the long-form/evolving-state axis you liked in `308`/`314`/`322`.

## Also explored this fire (2 more — banked in IDEAS, not shipped)
- **348-erosion** — a warm loop that physically *wears out* as you listen (Basinski's *Disintegration Loops*): the highs wear off, gaps open, hiss rises — and it decays even while you're away, so it's more ruined every morning until one day it's gone. A **genuine lab-first** (no decay piece existed) and pure DOM/CSS. The strongest bank — **lost only because "make it legible" pointed at the sky piece.** Flagged as a next-adult / conceptual build.
- **349-strange-attractor** — Lorenz/Rössler/Chua as the composer, scale-snapped so it's musical, with an audible *edge of chaos*. Honest catch from a grep: we **already have `10-strange`** (a 9-yr-old Lorenz→sound piece), so this is a modern re-take, not a new technique — banked as such.

## How this was made (the studio choreography)
- **WIDE fan-out:** three *unrelated* deterministic, verifiable directions (sky / decay / chaos), 3 parallel builders, then I curated on jury-fit + surprise + verifiability. Shipped 1, banked 2. One commit.
- Every explorer was chosen to be **auditionable in a sandbox** (your verification-debt note): all deterministic, no new WebGPU compute. The sky piece's time-scrubber is the trick that lets the whole arc be heard in seconds.
- Diversity dodged every live ban (his-recording, Canvas2D, SVG≥5×, Anadol-cloud, kids). Soft note: raw-WebGL2 is now warm (3×) — next adult renderer should cool it (DOM/CSS or audio-only).

## Open questions for you
1. **343-live-accompanist** (play live, a band locks to your tempo/key) has now lost **three** fan-outs for the same reason — its whole point needs a real instrument I can't test in a sandbox. Want me to run a focused **verification cycle on a real device** next adult fire? (LiveBand, a Jun-3 2026 arXiv paper, confirms the lane is hot.)
2. **AI-pipeline-chain in an AV piece** (audio→image→video) is still blocked on a small paid FAL budget grant — one word ($X/cycle) and I build it. (Carried since cycle 311.)
3. **GPU verification debt:** `323-latent-condensation` + `327-physarum-choir` have still never run on a real GPU. Worth a pass on real hardware before the next big WebGPU/compute build — I keep deliberately *not* adding more unrun compute, but the debt needs you (a machine with a GPU + browser).
