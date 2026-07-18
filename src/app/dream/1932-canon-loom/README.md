# Canon Loom

**The one question:** *What if the notes you play never disappear — what if Resonance wove your performance into a living loom that plays your own past back as counterpoint?*

Canon Loom is a compositional-**memory** instrument. You play a keyboard; every note is knotted permanently into a scrolling cloth and keeps playing back as a canon beneath whatever you play next. Your earlier self accompanies your present self, and the accompaniment thickens as you weave.

## The technique

- **Input** — Web MIDI (`navigator.requestMIDIAccess()`) when a device is present, otherwise a computer-keyboard fallback. White keys `a s d f g h j k l ; '` climb a two-octave C-major scale; `w e t y u o p` are the accidentals. The active input is shown on screen. No MIDI support degrades silently to the keyboard — never an error.
- **Output** — Canvas2D. The surface is a punched **roll seen as a loom**: time is the warp (horizontal, scrolling continuously past a fixed read-head), pitch is the weft (vertical). Every played note becomes a durable indigo thread at the loop-phase where it was struck. Threads persist — what you played 90 seconds ago is still woven and still audible. Playing the same spot again **over-dyes** the thread (deeper indigo, thicker weft), so the fabric visibly densifies.
- **Compositional-memory canon** — the roll is cyclic. Each thread re-sounds every time it scrolls back under the read-head, so the accumulated phrase loops as counterpoint under the live performance. This is memory made structural, **not** a physics-scalar-to-pitch reactive mapping: the sound now is a function of everything you have already played.
- **Agency** — a loop-length control (4 / 8 / 16 beats, which re-scales the whole weave) and a "Clear the loom" reset.
- **Self-demo** — if no input arrives for ~6s, a **seeded, deterministic ghost weaver** threads a short canon subject into the loom so the piece demonstrates itself headless (visuals run with no gesture and no MIDI). The instant a real key/MIDI note arrives the ghost yields; its threads remain as accompaniment.

## Audio

Pure Web Audio API, no libraries. Each voice is a warm plucked/struck timbre — triangle + a soft octave, a lowpass that closes as the note rings, fast attack and gentle exponential decay — routed through a compressor so overlapping canon voices stay legible. Master gain is `0.16` (≤ 0.17), ramped up on the first user gesture, and the AudioContext is resumed on gesture and **fully closed** (oscillators stopped) on unmount.

## Determinism

No `Math.random`, `Date.now`, or `new Date()` anywhere in state/audio/visual logic. `performance.now()` is used only for animation/transport timing. The ghost phrase is a fixed table; the only randomness is a seeded `mulberry32` that stipples the linen texture a single time.

## Palette

Indigo-dyed textile on natural fibre: warm neutral linen ground, undyed-fibre warp lines, indigo weft threads that deepen with over-dyeing, a warm-gold read-head/shuttle. No violet-on-black. All raw colours live inside the Canvas layer; every UI chrome element uses Tailwind semantic tokens.

## Named references

- **Conlon Nancarrow — *Studies for Player Piano***: a performance punched permanently into a paper roll that scrolls past a tracker bar. The read-head here is that tracker bar.
- **The Jacquard loom**: a punch-card-driven weave — durable, replayable pattern, ancestor of the stored program.
- **Bach's canons**: a single voice chasing itself in time.

## How it clears the ambition floor

It is genuinely audio-visual (nothing static), the visual and the instrument are the *same* object (a thread is simultaneously a woven mark and a scheduled sound), and it commits to a real thesis — durable compositional memory — rather than a reactive parameter map. It self-demonstrates headless via the ghost weaver, and it degrades cleanly from MIDI to keyboard.

## What I would deepen next

- **Sample-accurate scheduling**: canon notes currently trigger on read-head crossing per animation frame (fine for a warm pluck, but ~one-frame of jitter). A Web Audio lookahead scheduler would tighten it.
- **Voices/dyes per octave register** so the fabric reads as coloured bands and the counterpoint is easier to follow by ear.
- **Retrograde / inversion cards** (true Nancarrow/Bach canonic devices): weave the roll backwards or mirror it about a pitch axis as selectable "cards".
- **Beat-quantise toggle** so loose playing snaps to the warp grid for tighter canons.
