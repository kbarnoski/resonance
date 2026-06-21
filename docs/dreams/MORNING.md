# Morning digest — last updated 2026-06-21 ~14:15 UTC (cycle 504 · KIDS · WIDE)

> **Jury verdict yesterday**: the renderer wall broke and the depth ceiling recovered — but the kids lane leans **pentatonic-never-wrong 6×** and re-runs the **UPIC pitch-painter 3×**, so the jury banned both and asked for *"a kids piece where harmony or rhythm can be **shaped**, not one where every note is pre-approved."* This cycle is the direct answer. See `docs/dreams/JURY.md`.

Kids **WIDE** fire — three orthogonal explorers built in parallel, each letting a 4-year-old *shape* harmony or rhythm (off both banned kids tags), on three different renderers. Shipped the one that hits the rarer, harder register: **harmony-shaping**.

## New since yesterday
- **🧱🎶 [/dream/816-kids-tone-tower](https://getresonance.vercel.app/dream/816-kids-tone-tower)** — *A 4-year-old builds a **chord** by stacking glowing blocks.* The bottom block is a soft warm root; each block they stack sits a musical **interval** above the one below, and **how big a gap they drag chooses the interval** — snapped to a just-intonation lattice so every stack is consonant and never harsh, but the child genuinely controls open-vs-close, simple-vs-rich, bright-vs-dark. Tap to drop a friendly third, drag up to reach for a wide bright one (a ghost block + reach-line preview it live), ▶ strums the tower, 💥 knocks it over with a downward sparkle then re-seeds. **Why open it:** it's the lab's first kids toy where the child shapes the **harmony itself** — the directest answer to yesterday's jury (no pentatonic crutch, no draw-a-pitch). No reading, no wrong moves, loops an arpeggio on load so it's sounding the moment you glance.
- **2 more explored this fire** (banked to IDEAS §504): **`817-kids-clap-back-band`** — clap a rhythm and an animal band plays *your own* clapped groove back, layering instruments on it (mic onset → WebGL2; a full tap-pad fallback for no-mic). De-selected because rhythm-capture rhymes with the recent `773-parade-caller`. **`818-kids-pendulum-choir`** — pull back a row of pendulums and watch/hear a slowly-phasing polyrhythm converge and diverge every 30s (Harvard pendulum wave / Ligeti). Lovely and calm, but its chimes used a pentatonic palette — the exact banned crutch; flagged for a just-intonation fix before resurrecting.

## In progress / partial
- None shipped-partial. `816` is demoable. The two banked siblings are one rebuild away each (briefs in IDEAS §504).

## Research findings worth a look
- **RESEARCH §504:** **uCue** (Interaction Design and Children 2025, ACM) is the academic proof that kids *can* be given real harmonic agency — its harmony layer lets children shape "common and **unusual** harmonizations" without it ever sounding wrong. Our lab has dozens of kids toys and every one picks notes from a pre-approved pentatonic or paints a pitch contour — **none let a child shape the chord**. Tone Tower fills that gap (Froebel's building-block "Gifts" made to sound, on a Partch just-intonation lattice).

## Open questions for Karel
- **Is "drag higher = a wider, brighter chord" legible to a 4-year-old without being told?** That's the one thing I'd want your eyes on — the mechanic is sound (literally), but the discoverability is unverified by hand.
- **Next adult cycle (505) should rest your "Welcome Home" recording** — it's gone adult-heavy again (the jury's open #3). I'm steering toward a data-sonification or full-body organ piece on the **cold WebGL2/WebGPU surfaces** instead of more SVG.
- Standing infra ask unchanged: the container's ~4096-fd ceiling blocks local static-gen (compile + lint + types verified green this cycle; Vercel deploys fine).
