export const README = `THRESHOLD LOOM — a sleep-onset instrument

What if falling asleep were an instrument? Type. The letters are ignored —
only the CADENCE matters, the rhythm of the gaps between your keystrokes. Type
slow and steady and drowsy and the field deepens, carrying you toward the
threshold of sleep. Type frantically and you pull yourself back toward waking.
Stop, and a phantom typist takes over at a drowsy pace and keeps sinking.

THE STATE — hypnagogia
Hypnagogia is the borderland between waking and sleep: the mind loosens, the
senses drift, and unbidden imagery blooms. This piece stages it as a Ganzfeld —
an unstructured, near-uniform luminous field. Deprived of edges to hold onto,
the visual cortex begins to hallucinate its own structure: phosphenes and
"form constants" (Klüver) — speckles, faint lattices, drifting spots of light.

HOW IT LISTENS — cadence, not letters
Every keystroke's inter-keystroke interval feeds a slow state integrator called
DEPTH (0 = awake, 1 = at the threshold). Long, even intervals read as drowsy and
push depth up; short, jittery bursts read as frantic and pull it down. Steadiness
counts too — an even rhythm sinks faster than a ragged one. Nothing here reads
what you typed; a poem and a password drive it identically.

WHAT YOU SEE — Canvas2D only
A full-viewport Ganzfeld ground: dim warm-dusk violet with a soft vignette when
you are awake, brightening and losing its edges toward a boundless soft-white as
you approach the threshold. Each keystroke blooms a phosphene form-constant —
frantic keys scatter tight speckle; steady drowsy keys grow soft drifting spots
and organized hex lattices. Blooms swell and fade on a gentle sine envelope;
nothing snaps or flashes. Near the threshold the imagery loses contrast and
dissolves into the uniform field — structure, and language, let go.

WHAT YOU HEAR — descending forever
Master gain is low, behind a limiter. A Shepard–Risset glissando descends
endlessly (Shepard 1964 / Risset): octave-spaced partials under a fixed envelope
glide down with no audible bottom, so the ear is carried downward toward sleep
without ever arriving. A soft detuned cosmic pad swells as you deepen, and each
keystroke rings a quiet phosphene chime that drops an octave in the deep state.

THE PHANTOM TYPIST
So the piece is never blank or silent, a deterministic, seeded phantom typist
types at a drowsy cadence on its own after Begin — driving the field and the
sound. The moment you touch a real key it yields to you, and re-arms only after
a long stretch of stillness.

SAFETY
This is an altered-states piece and it is built to be gentle. No strobe or
flicker: every luminance change is a slow sub-Hz drift, blooms fade over
seconds, and the theta-band feeling lives in AUDIO amplitude, never in light.
prefers-reduced-motion freezes the field to a calm still state. The audio is
gated behind the Begin gesture and kept quiet under a compressor.

DETERMINISM
No Math.random, Date, or performance.now touches anything you see or hear —
timing rides the animation frame's own clock and a fixed-seed mulberry32 PRNG,
so the piece is byte-reproducible (the 06:30 headless review sees the same
dream every morning).

REFERENCES
· Wackermann, Pütz & Allefeld, "Brain electrical activity and subjective
  experience during altered states: ganzfeld and hypnagogic states"
  (Cortex, 2002; PMID 12433389) — form-constants ≈ 86% of hypnagogic imagery;
  Ganzfeld EEG resembles relaxed waking.
· 2020 fMRI: multimodal Ganzfeld induces progressive thalamo-cortical
  decoupling (PMC7596232).
· Roger Shepard (1964) / Jean-Claude Risset — the endlessly descending
  Shepard–Risset glissando (the auditory barber-pole).
· The "Tetris effect" and the hypnagogic-imagery literature — repeated waking
  activity replays as sleep-onset imagery.

Type slowly. Let the letters go. Only the rhythm remains.`;
