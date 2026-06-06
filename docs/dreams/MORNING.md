# Morning digest — last updated 2026-06-06 (UTC), cycle 335 (adult · DEEP)

> Odd cycle → **adult**. I did the thing the **jury** kept asking for and I kept deferring: **I deepened a multi-cycle thread instead of shipping a fourth fresh explorer.** The Spiral-Array idea (banked as `364-tonal-orbit`) that lost twice on being "an abstract sphere in a 3-D helix" — I shipped it *fixed*: flattened into a readable **map** of tonal space. Dodges every jury ban (no touch, no mic, no SVG) and cools the over-used DOM/CSS renderer.

## ☀️ Open this first
- **[/dream/370-tonal-map](https://getresonance.vercel.app/dream/370-tonal-map)** — press **Begin**. A bright **comet of tonal gravity** glides across a top-down **map of keys** (the circle of fifths laid out as labeled territories). It auto-plays a progression that modulates **C → G → D → Em → C**, so you literally **watch the comet cross from the "C" territory into "G"** as the key changes — modulation as a map crossing. The comet's **halo blooms wide the instant it's unstable** and tightens back when a new key settles (that's the live *tonal-focus* readout, straight from a March-2026 paper). HUD names the key, the chord, its Roman numeral, and flashes the key change. Plug in a MIDI keyboard and it tracks *you* instead.
  - *Why this one:* it's the lab's **first Chew Spiral Array** (a real spatial model of tonality) and the first time I've actually **advanced a multi-cycle thread to shipping** instead of banking it again. It feeds the **legible/instructional** lane you flagged as the real win (358/353/365), without being another slow drone.

## Also explored this fire (2 more — banked in IDEAS §335, both build-clean)
- **369-tonal-orbit** (three.js, 3-D) — the *literal* Chew helix with labeled regions, a comet trail and an auto-framing camera. The most theory-faithful version — lost only because the 3-D helix is exactly the "abstract" reading that sank this idea before. Saved for a desktop/installation view where orbiting the spiral is the point.
- **371-tonal-journey** (three.js, scrolling timeline) — the most *teaching* take: a journey ribbon that spells the modulation as a story ("C → pivot Am → G → Em → C") with **pivot-chord callouts** and a focus-over-time graph. Lost only because it drifts from the *spatial* idea toward a piano-roll-ish timeline. A great future "modulation explainer."

## How this was made (the studio choreography)
- **DEEP fan-out:** ONE concept — *"watch your music's tonal center of gravity travel tonal space"* — attacked three ways (map / 3-D helix / journey-timeline) by three parallel builders, curated to the **most legible that still keeps the idea's identity**. Shipped one, banked two. One commit, `npm run build` ✓.
- Today's research → today's build: arXiv:2603.27035 (Mar 2026) frames tonal motion as *gravitational centering* with a **focus scalar that loosens during modulation** — that became the comet's halo. (RESEARCH §335.)

## Open questions for you (your call unblocks these)
- **The score-follower / live-accompanist** you (the jury) keep asking for is **stuck on two walls**: a real one (`26-score-follow` + `251-live-duet-trader` already exist) and the mic-input ban + needing a real instrument to verify. Want me to build the **MIDI-only** version (a band that locks to a keyboard, verifiable with an internal known performance, no mic)? That dodges both walls.
- **`351-erosion`** (a tape more ruined each morning) still triple-banked — invisible on a first open. Ship unconditionally? Reframe to open already-eroded?
- **AI-pipeline-chain in an AV piece** still blocked on a small paid FAL budget grant — one word and I build it.
- **GPU verification debt:** `323` + `327` have never run on real hardware.

## Caveats
- `370` is **build-verified, not browser-verified** — the map, comet, focus-halo, key/chord/Roman HUD and modulating demo are written correct and `npm run build` passes clean, but on real hardware the **key-estimation hysteresis may lag the short demo chords** (the modulation banner could trail your ear by a chord or two), the focus-halo bloom needs a phone-screen eyeball, and the focus normalization constant is empirically chosen, not derived from the paper. iOS AudioContext unlock + real Web MIDI also unverified here (no GPU/MIDI in this sandbox). Likely small tunes if off.
