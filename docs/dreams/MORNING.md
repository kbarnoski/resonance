# Morning digest — last updated 2026-05-30 UTC (cycle 246)

## New since yesterday

- **`/dream/213-kids-echo-drum`** (cycle 246) — Four BANDIMAL drum pads. Tap any rhythm;
  after 1.5s silence the drum echoes it back exactly (cool-cyan overlay = drum's voice vs.
  your warm hue). Then fires one +1 bonus beat at the average inter-tap interval — most-used
  pad, with a gold sparkle burst. Phase indicator at canvas center shows recording (pulsing red
  dot + colored orbit dots) vs. echoing (pulsing cyan dot). **First rhythmic call-and-response
  prototype** — echoes exact timing, pure affirmation: whatever you tap comes back perfectly
  plus one more. For kids 3+, zero permissions, 3.18 kB.
  **Why open this**: tap kick three times slowly → hear it back + one more kick. Tap a chaotic
  scatter across all 4 pads → hear exactly that chaos mirrored. Watch the sparkle on beat 9.

- **`/dream/212-diatonic-harmony`** (cycle 245) — Play a melody into the mic; every note is
  instantly harmonized with its diatonic third and fifth, scale-correct and key-adaptive.
  **Why open this**: play a C major scale and watch three lanes scroll in parallel harmony;
  shift to minor and watch the third switch from major to minor automatically.

## Recent (last 4 cycles)

- **`/dream/211-kids-firefly-web`** (cycle 244) — Tap to release fireflies; when two drift within
  range they spin a silk thread and chime. Direct descendant of `140-kids-string-bridge` ❤️.
- **`/dream/210-aria-companion`** (cycle 243) — Play piano, pause, Aria responds with a Markov
  phrase shaped by your own note transitions. First turn-taking dialogue prototype.
- **`/dream/209-kids-drum-tap`** (cycle 242) — Four drum pads, Markov drum talks back after 1.5s.

## In progress / partial

Nothing in-progress.

## Research findings worth a look

**Research sweep now 34 cycles overdue** (last full sweep: cycle 213, 2026-05-19).
Cycle 247 (next adult slot) should be a full research cycle — the IDEAS queue is healthy but
all entries are from 10+ days ago in a fast-moving domain.

Prioritized areas for cycle 247 research:
- June 2026 fal.ai / Replicate model releases (models tagged "new" in last 30 days)
- Three.js r172+ TSL node material updates
- SIGGRAPH 2026 Art Gallery early announcements (usually released in June)
- WebGPU compute audio new demos on HN / CodePen / shadertoy this month
- Any Lyria RealTime API updates (Google DeepMind — real-time music WebSocket)

## Open questions for Karel

- **Echo Drum (213)**: should the +1 beat always be the most-tapped pad, or should it
  "surprise" — picking the *least*-used pad to introduce a new voice? Currently it echoes
  the dominant voice; the alternate design would feel more like the drum adding something new.
- **Diatonic Harmony (212)**: does the 3-lane layout read clearly, or prefer all three voices
  overlaid in one pitch space? The overlaid view shows actual interval sizes; 3-lane makes each
  voice independently readable.
- **Aria Companion (210)**: want (a) velocity mapping, (b) 2nd-order Markov, or (c) Aria
  replies in a contrasting octave? Any worth a polish cycle?
- **Research cycle**: cycle 247 is slated for a full sweep — confirming this is the right call
  unless you want a build instead. Will target June 2026 findings.
