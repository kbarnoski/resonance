# Choir of Strangers

**Route:** `/dream/1832-choir-of-strangers`

## The one "what if"

What if a pure just-intonation chord could only be **completed by many people at
once** — each open browser tab is one held voice, and the full harmony
physically cannot exist until several tabs (people) join?

With one tab you hear a lonely single tone. As more tabs open, the chord fills
in and the beatless fifths and thirds lock into place. A harmonic-lattice
diagram shows each present voice as a glowing node; absent voices are faint
ghost outlines ("you can't build the chord alone").

## Mechanic — control events, not audio

Presence is shared over a **BroadcastChannel** (`sync.ts`). Following the 2026
web-collaborative-music insight, tabs transmit **only CONTROL / TIMING events**,
never audio:

- which scale degree (voice) each tab has claimed,
- the shared tonic,
- a slow LFO breathing phase.

Every tab **synthesizes its own voice locally** (`audio.ts`). Voice claiming is
a tiny star-topology / CRDT-style rule: each tab grabs the lowest free degree
and yields ties to the smaller `peerId`, so two tabs that grab the same degree
at once converge without any server. The whole choir breathes in lockstep
because the amplitude LFO is driven by the shared **wall clock** (`Date.now`) —
so timing is coherent across tabs with zero audio transmitted.

## Just-intonation ratios (tonic D3, 146.83 Hz)

A five-limit lattice: **1/1** (root), **3/2** (fifth), **5/4** (major third),
**15/8** (major seventh), **5/3** (major sixth), **9/8** (ninth). Lattice edges
are the pure intervals between adjacent degrees — horizontal steps are perfect
fifths (3/2), vertical steps are major thirds (5/4).

Each voice is a stack of pure sine partials at `ratio × tonic` through a soft
lowpass into a shared convolver reverb. No detune keeps the intervals beatless.

## Phantom-voice self-demo

Opened alone, the piece cannot show its point — so it synthesizes a
**deterministic "phantom" choir**: a seeded **mulberry32** PRNG (fixed seed, no
`Math.random` / `Date.now` at module load) schedules the absent voices to fade
in over ~15 seconds. A solo reviewer still hears the full chord assemble and
watches the lattice brighten. The UI states plainly that opening a real extra
tab **replaces a phantom with a live person**; an "Open another voice" button
`window.open`s the same route in a new tab to prove it.

## Output

**SVG-DOM only** — no canvas/WebGL. Voice nodes, ghost outlines, and interval
edges are animated by mutating SVG attributes inside a single `requestAnimationFrame`
loop. Semantic Tailwind tokens for chrome; violet-only art in the SVG.

## References

- **La Monte Young & Marian Zazeela, _Dream House_** — a permanent sustained
  just-intonation light-and-sound environment.
- **"Real-Time Collaborative Music Creation on the Web: exploiting Web Audio
  Modules"** (IEEE, 2026) — transmit control events, synthesize locally per
  client.
- **Sequencer.party** — CRDT control-event model for collaborative music on the
  web.
