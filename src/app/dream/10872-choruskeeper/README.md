# 10872 · Choruskeeper

**Route:** `/dream/10872-choruskeeper`

## The one question

> What if a jazz duet had real long-form memory — a bebop partner that banks the
> motifs you play early in a tune and DEVELOPS them across a whole 3-chorus arc,
> so the music is genuinely different at chorus 3 than at chorus 1?

This is the **long-form / stateful** realization (criterion #4): a piece with
memory and evolution, not a loop. It states, develops, and resolves.

## The mechanism

A 32-bar **AABA** standard in **F major** loops for **3 choruses** over a swung
rhythm section (walking bass + rootless comp + spang-a-lang ride) that never
stops. The arc is deliberately, audibly staged:

- **Chorus 1 — STATE.** You (or, when you're idle, a seeded auto-performer) play
  sparse fragments. Every phrase is **banked** into a persistent **motif
  library** — stored not as pitches but as **chord-relative bebop scale
  degrees** (`bankMotif`), so a motif can later be re-fitted to any chord in the
  changes. The ghost mostly comps and drops tiny guide-tone answers.
- **Chorus 2 — DEVELOP.** The ghost stops comping and **grows your banked
  motifs**: it **transposes / sequences** each one diatonically through the AABA
  changes, and applies **inversion** (mirror the contour) and **rhythmic
  augmentation** (`renderMotif` + `DevOp`). Downbeats are snapped to guide tones
  (3/7) and each bar ends on a chromatic approach into the next chord — Barry
  Harris voice-leading.
- **Chorus 3 — TRADE & OUT.** Four-bar trades between you and the ghost, density
  climbing (a second developed motif is layered in), then the final bar's
  turnaround is replaced by a home **Fmaj7** and the melody resolves to the
  tonic. The tune **ends**; it does not loop.

**Scheduling.** A look-ahead scheduler reads `audioCtx.currentTime` and schedules
~130 ms ahead on an eighth-note swung grid (Chris Wilson's two-clock model).
Before audio is booted (it needs a gesture), the *same* logical form-clock runs
on `performance.now()` at ~35× tempo and a seeded auto-performer previews the
entire 3-chorus development — **muted** — in about 11 seconds, so the arc, the
banking, and the development are visible on load. First tap boots audio and
restarts the tune at real tempo.

**Visual (Canvas2D).** The hero is a **FORM MAP**: a horizontal 32-bar AABA strip
with section labels (A A B A), per-bar chord symbols, a sweeping playhead, a
chorus counter (1/2/3), and a live note-activity lane (blue = you, gold = ghost).
Below it, the **motif library panel** shows each banked motif as a tiny contour
glyph; the glyph lights **gold** when the ghost is currently developing it, with
the active operation named (TRANSPOSE / SEQUENCE / INVERT / AUGMENT).

**Input.** Computer keyboard — `a s d f g h j k l` play an F-major row; macro
"conductor" keys: `z`/`x` density, `c`/`v` register, `space` hand-it-to-the-ghost
toggle. On-screen 44×44 tap controls mirror all of it. No mic, no tilt.

## Palette

Midnight blue-note: deep indigo/navy ground, cool-blue (you + playhead) and gold
(ghost + active motif) accents — canvas art layer only.

## Named references

- **Barry Harris's sixth-diminished / bebop-scale method** — the ported living
  technique: bebop scales with the chromatic passing tone so chord tones land on
  downbeats, guide-tone (3/7) resolution at bar lines, chromatic enclosure, and
  rootless sixth-diminished comp voicings.
- **Jazz AABA song form** + **motific development** (statement → development →
  recapitulation).
- **Chris Wilson, "A Tale of Two Clocks"** — the look-ahead audio scheduler.

## Tags

`long-form` `stateful` `generative-jazz` `motif-library` `development-ops`
`bebop` `barry-harris` `AABA` `canvas2d` `scheduler` `keyboard`

## Honest self-assessment

- **Is chorus 3 audibly different from chorus 1?** Yes. Chorus 1 is sparse
  fragments over comping; chorus 2 is a continuous developed line every bar;
  chorus 3 is climbing-density trades that layer a second motif and then cadence
  to a held Fmaj7 and stop. The texture, density, and role clearly evolve.
- **Does the library visibly bank + develop your ideas?** Yes — glyphs appear as
  phrases are banked in chorus 1, and light up gold with a named operation while
  the ghost develops that exact motif in choruses 2–3. Because motifs are stored
  as chord-relative degrees, "develop your idea" is literally re-rendering *your*
  contour through the changes, not a new random line.
- **Weak spots.** The "development" is legible more than virtuosic — the ops are
  transpose/sequence/invert/augment, not full bebop reharmonization, and the
  ghost's lines favour clarity over surprise. The generated fragments are
  pleasant but not deeply idiomatic phrasing. The auto-performer guarantees the
  arc even for a passive listener, which is good for demoing but means a
  hands-off run sounds similar between sessions (it's seeded). Two independent
  melodic layers in chorus 3 can occasionally crowd the register.
