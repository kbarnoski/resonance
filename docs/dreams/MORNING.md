# Morning digest — last updated 2026-05-31 UTC (cycle 264)

## New since yesterday

- **`/dream/230-kids-bubble-duet`** (cycle 264, kids) — Two soap bubbles float on a starry canvas.
  **YOU** (pink smiley) + **FRIEND** (cyan ♪). Tap the pink bubble → note plays → FRIEND brightens,
  bounces 1.2 s later, and sings a consonant response (C3→G3, E3→A3, G3→C4, A3→C3, C4→G3). Dashed
  arc connects them during exchange. Then "your turn ♪" — repeat forever. **First kids prototype
  where the responder has a distinct character identity** — prior call-and-response prototypes use a
  generic system; FRIEND here has a face, a color, and a musical voice. Zero permissions · Zero deps
  · 2.99 kB.

- **`/dream/229-chord-canvas`** (cycle 263, adult) — Play any chord and the detector names it:
  "Dm", "G", "C♯m". Color timeline scrolls left (hue = root, saturation = quality). **First
  music-theory prototype in 228 builds.** Demo plays a ii–V–I automatically. 3.85 kB.

- **`/dream/228-kids-creature-grow`** (cycle 262, kids) — Tap six times to grow a creature from
  egg → eyes → ears → smile → arms → legs → wings. Completion: creature sings all six notes back
  with each body part glowing on its note. Zero permissions · 3.18 kB.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

- **Turn-taking dialogue is the least-explored kids interaction class.** 59 kids builds exist; only
  `213-kids-echo-drum` and `142-kids-echo-canon` do call-and-response — and both use a faceless
  "system" responder. Bubble Duet adds character identity to the exchange. The "Design Space for
  Live Music Agents" taxonomy (arxiv 2602.05064) specifically identifies dialogue agents as the
  most musically interesting and least-built category.

- **Consonant response lookup vs. Markov chain.** The lookup table (C3→G3 P5 always) is
  predictable and always consonant — right for a 3-year-old. For older kids or an adult version,
  a Markov chain that learns from YOU's intervals (like `225-aria-companion`) would be richer.
  The duo could be extended: FRIEND learns your style after 5 exchanges.

- **`217-dance-avatar` ❤️ (still loved).** Spring-physics body shapes resonate with Karel.
  Natural next step: a Three.js R3F icosahedron that breathes with FFT data — first audio-reactive
  3D mesh prototype (zero new deps, `@react-three/fiber` + `three@0.182` already installed).

## Open questions for Karel

- **`230-kids-bubble-duet` pitch control?** Currently YOU taps a random note each time. Option:
  make the note depend on WHERE on the YOU bubble you tap (top = C4, bottom = C3, five zones) —
  adds agency without reading requirement.

- **FRIEND's response speed.** 1.2 s "thinking" window. Too slow for excited 3-year-olds? Too fast
  and the exchange loses its conversational feel. Try it and tell me; happy to tune to 0.8s or 1.6s.

- **`/api/audio/[id]`** — still pending your OK. Unlocks `paths-granular` auto-load + future
  Karel's-music prototypes built around Welcome Home recordings.

- **FAL_KEY budget** — `ghost-animate` (HappyHorse-1.0, ~$0.05–0.30/clip) ready on your go-ahead.
