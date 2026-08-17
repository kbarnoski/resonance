# Between Us

**The one question:** What if a chord could only complete when TWO people are
present — a relational instrument where the music lives *between* two listeners,
not conducted by either one?

## How it works

Two independent browser contexts (two tabs, two windows, or two devices on the
same origin) each become **one presence**: a soft point of light you drag around
a shared circular field. Each presence continuously loops one of Karel's real
piano takes — presence A plays *Interplay*, presence B plays *Welcome Home*.

The musical payoff is **distance = consonance**, measured as the normalized
separation `d ∈ [0,1]` between the two lights in the shared field:

- **Far (`d → 1`):** the two voices sit detuned apart — A nudged slightly sharp,
  B slightly flat (via `detune` cents) — a gentle, dissonant wobble, and no
  "between" layer.
- **Near (`d → 0`):** presence B's pitch glides up to lock into a **just major
  third** (5:4, ≈ +386 cents) above A, and a **"between" resonance blooms** — a
  third audible layer that exists only when both presences are near. Both voices
  are summed into a shared wet bus: a `ConvolverNode` fed a locally-synthesized
  short decaying-noise **impulse response** (a reverb kernel — not synthesized
  music), whose wet gain rises as `d → 0`. The bloom is a shimmering
  combination-resonance of Karel's own takes meeting.

### Two-presence coordination (no server)

Cross-context sync is genuine and server-less via **`BroadcastChannel`** (channel
`resonance-betweenus`). Each context picks a random id on mount, broadcasts its
normalized field position on pointer move (throttled ~30 ms), and sends a
heartbeat every ~1 s. The partner presence is the most-recently-seen non-self id
within ~2.5 s.

**Ghost-partner fallback:** if no real partner is heard within ~3 s, an autonomous
**ghost** presence drifts in on a slow Lissajous path, so a single reviewer can
demonstrate the full two-presence harmony alone. The instant a real partner
heartbeat arrives, the ghost yields to the real partner. Status text tracks the
transition: `waiting for another…` → `a ghost drifts with you` → `two present`.
Open two real tabs on the same origin and the two real presences find each other.

### Audio integrity

All audible sound is Karel's real catalog (`REAL_TRACKS` via
`loadRealTrackBuffer`), routed entirely through one `createSafeMaster` bus — zero
oscillators, zero synthesized tones. The only synthesis anywhere is the
noise-burst impulse response used purely as the reverb convolution kernel. Pitch
changes are done with `AudioBufferSourceNode.detune` (never by reloading buffers).

### Visual

Full-viewport Canvas2D on a near-black ground. Two presences are two soft
radial-gradient glows in complementary art hues — sea-green
`hsl(158, 72%, 58%)` and magenta-rose `hsl(322, 70%, 62%)` — drawn additively
(`globalCompositeOperation = "lighter"`). A white-hot core is drawn at the
**midpoint** between the two lights, its radius and brightness scaled by
`(1 − d)` and the shared analyser's energy, with a faint filament joining the
lights when near. Motion is slow luminance only — no strobe (photosensitive
safety), and it honors `prefers-reduced-motion`.

## Lineage

Named for **The Hub** and the **League of Automatic Music Composers** — the first
computer-network band (1970s–80s), whose members wired their machines together so
that no single player produced the music; it emerged *between* the networked
nodes. Between Us is a two-node, browser-native descendant of that idea.

## What's rough / what I'd deepen next

- The "beating when far" is an honest gesture but imperfect: the two voices are
  *different* recordings, so their partials don't share exact frequencies the way
  two detuned copies of one tone would. The detune spread reads as a subtle
  wobble/coloring rather than clean acoustic beats. Deepening it would mean giving
  each presence the *same* take as a tunable reference layer, or cross-analyzing
  live partials to place the detune where real beating occurs.
- `BroadcastChannel` is same-origin, same-browser only. True two-*device*
  presence would need a tiny signaling relay (WebRTC/WebSocket) — deliberately
  out of scope here to keep the piece server-less.
- The just-third lock is a single fixed interval; a next pass could let the pair
  negotiate *which* consonance (fifth, third, unison) they settle into based on
  how they approach each other.
