# 14240 · Ink Score

**What if you could compose a brand-new coherent piece by weaving phrases sampled
from your whole recorded catalog onto a paper-white, ink-on-paper graphic score —
and a harmony engine kept the woven result in key, so it's music, not collage?**

Ink Score is the horizontal, melodic/sequential model of that idea: a left-to-right
scrolling time-score you play with the **computer keyboard**, like a composer rather
than a pianist. Number keys pick which recording the next phrase comes from; `SPACE`
drops the "next best" in-key phrase onto the score at the sweeping playhead. Every
mark is a **real slice of one of Karel's takes** — there is no synthesis anywhere.
The score loops; as the playhead re-crosses a mark, that phrase sounds again.

## The three subsystems

1. **Phrase corpus (`corpus.ts`).** Each of the 16 verified tracks (Welcome Home +
   Snowflake) has its analysis note-roll split into *phrases* — contiguous note-runs
   broken at silences > 0.6 s, capped at 8 s. Each phrase stores its `{startTime,
   endTime}` into the decoded buffer, a unit-normalised 12-bin **chroma**, its mean
   MIDI register, mean energy, and a compact melodic **contour** for drawing. Tracks
   with no note analysis fall back to flat, unpitched time-slices (drawn dashed).
   The recordings *are* the sound bank.

2. **Audio.** A phrase plays as one `AudioBufferSourceNode` reading its track's
   lazily-decoded buffer from `startTime` for its length, through a per-voice gain
   with equal-power fades (no clicks), into the shared `createSafeMaster` bus — never
   `ctx.destination`. Zero oscillators, zero generated tone.

3. **Harmony engine.** A **running key** drives everything. When you weave a phrase,
   the engine correlates each candidate's chroma against a Krumhansl-Schmuckler key
   profile for that key and ranks them; it then applies a small playback-rate
   **detune** (`rate = 2^(semitones/12)`, ≤ ±4 semitones) that snaps the phrase's
   mean pitch onto the key's nearest diatonic degree.

### The consonance tradeoff

The **consonance** slider (0..1) is what turns collage into music, and it's audible:

- **0** — raw collage: selection cycles through *all* of a track's phrases in rank
  order and no detune is applied. You hear the catalog's real, un-corrected pitches
  colliding.
- **1** — every weave selects the single best-fitting phrase and its mean pitch is
  fully snapped to the running key.
- In between, selection widens toward the rank list and the detune is scaled down.

Because the detune is re-computed **live at each loop pass**, changing the running
key (`[` / `]`, `M` for minor) re-voices every mark you already placed — the whole
piece transposes into the new key as it loops. The cost, documented on-screen: a
playback-rate detune also shifts a phrase's tempo and timbre, so snaps are kept
small (≤ ±4 semitones) on purpose.

## Playing it

- `1`–`8` — pick a recording (from the current bank); `` ` `` swaps bank A/B (16 tracks).
- `SPACE` — weave the next in-key phrase at the playhead (auditions immediately).
- `Enter` — play / pause; scroll-speed (loop length) slider sets the sweep.
- `[` `]` / `←` `→` — nudge the running key; `M` — toggle major/minor.
- `↑` `↓` / `−` `=` — consonance.
- `D` — seed a short in-key weave (one-click first sound); `Backspace` — undo; `\` — clear.

## The graphic score (paper-white ink)

Canvas 2D on warm cream paper (`#f2ecdd`) with near-black/sepia ink and a single
restrained sienna accent for the playhead + trigger flash. Each phrase is a
hand-drawn-looking ink glyph: **height = register**, **length = duration**, **ink
weight = energy**, and the stroke traces the phrase's actual pitch contour with a
small deterministic wobble. Faint octave staff lines and time ticks sit under it.
The aesthetic is Cardew/Xenakis — expressive abstract marks on paper, not a
piano-roll grid, not neon. The playhead's ink weight pulses with the live audio
level from `safe.analyser`.

## What's rough

- Triggering is **frame-quantised** (rAF), not sample-accurate Web Audio scheduling,
  so onsets carry a few milliseconds of jitter — fine for this gestural aesthetic,
  not for tight rhythm.
- Large detunes audibly change tempo/timbre; the ±4-semitone clamp is a deliberate
  compromise, not transparent pitch-shifting.
- Unpitched fallback slices are key-neutral: they sit in the weave but the harmony
  engine can't pull them into key.
- Selection ranking is recomputed per weave; with very large corpora that would want
  caching.

## References

- **Cornelius Cardew, _Treatise_ (1967)** — 193 pages of abstract ink glyphs as an
  open score with no fixed sound-mapping; the lineage for reading marks as music.
- **Iannis Xenakis, UPIC (1977)** — drawn/composed gesture → sound. See the 2025
  open-access book *From Xenakis's UPIC to Graphic Notation Today* (ZKM / Hatje Cantz).
- **"The Concatenator: A Bayesian Approach to Real-Time Concatenative Musaicing"**
  (arXiv:2411.04366) — the corpus-reconstruction framing: the recordings themselves
  are the sound bank being re-assembled.

## Next-cycle deepening (folded in from the DEEP runner-up `14256-inkloom`)

The runner-up in this DEEP race, `14256-inkloom`, attacked the same "compose from
your whole catalog on paper-white ink" concept via a **vertical / polyphonic** model:
each key adds a looping horizontal *thread* and a harmony engine keeps the
simultaneously-sounding voices consonant (union-chroma overlap → per-thread
`playbackRate` transposition). Ink Score is horizontal and largely one-line-at-a-time;
the natural next step is a **"loom mode"** toggle that lets marks stack and sound
together, borrowing inkloom's vertical union-chroma voice-leading — but driven by
Ink Score's swept-playhead audio scheduler (so the weave stays loop-locked to the
score rather than free-running). That merges the melodic time-score and the
polyphonic weave into one instrument. (Runner-up banked in IDEAS §1158.)
