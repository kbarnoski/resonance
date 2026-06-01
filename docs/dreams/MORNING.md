# Morning digest — last updated 2026-06-01 (cycle 276, kids · WIDE orchestration)

## New since yesterday
- **[253-kids-tilt-pour](https://getresonance.vercel.app/dream/253-kids-tilt-pour)** 🫧 — **for kids 4+: tilt the iPad to *pour* a glowing lava-lamp of candy jelly blobs that sing when they merge.** Lean the tablet and 8 luminous blobs slosh and pool toward the tilt; when two fuse, that pair rings a soft pentatonic note (each color = a pitch), and a low pad swells the more you slosh. No touching the screen, no reading, no wrong notes. **Why open this:** it's the lab's **first metaball / smooth-min lava-lamp** — a real raw-WebGL gooey-fluid shader running cheap enough for a tablet — and a genuinely tactile, embodied kids toy. Open it on a phone and tilt. (No tilt/desktop → drag to steer gravity.)
- This was a **WIDE 3-builder kids fire** — three unrelated *non-touch* directions in one cycle (the orchestrator now runs on the kids cadence too, so no more solo "tap-a-chime" regressions). The other two built clean and are **banked** in IDEAS.md.

## In progress / partial
- **Two banked kids siblings from this fire** (both build-verified): `254-kids-blow-bloom` — **BLOW** on the iPad like a dandelion and seeds drift off ringing notes (the lab's **first breath-detection** input — the most surprising of the three) — and `255-kids-sing-garden` — sing → a fbm bedtime sky, hear your melody back.
- **The "AI band" arc (adults):** `251-live-duet-trader` shipped; **Harmonist next adult cycle (277)** — the comping bed under your *chords* (handles polyphony 251 can't) — then Groover (rhythm) completes the trio.

## Research findings worth a look
- **Damian Van Der Merwe, "Painting with Math: Building an Interactive Lava Lamp Shader from Scratch"** (Apr 3, 2026) — a clinic in making a per-pixel fragment shader cheap enough for phones: Hermite-smoothstep falloff (not `exp()`), fixed 8 blobs, 2-octave noise cap, DPR≤2. We adopted all four verbatim in 253. Full note in RESEARCH.md §276.

## Open questions for Karel
- **Which kids direction next — `254-blow-bloom` (blow input, fresh and surprising) or another tilt/voice piece?** Blowing on the iPad is the most novel interaction in 250+ prototypes; its only risk is detection robustness (fricatives can fool it).
- **Adult cycle 277: build the Harmonist?** It's the comping bed under your chords — build-verified, one-cycle-ready, and the most directly useful of the three band members for a pianist.
- The lab's three.js output is now over-represented (6 of the last 10) — I'm deliberately steering the next few builds to raw-WebGL / canvas2d to rebalance. Flag if you'd rather I keep leaning three.js.
