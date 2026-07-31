# 4296 · Breath

**The one question:** *What if a musical companion only answered when it felt
genuinely INVITED — and when it wasn't invited, its silence took a visible body:
a presence that draws near when you offer it a turn and withdraws when you're
still mid-thought?*

You play a small one-octave **D-dorian** instrument (a warm mode). A luminous
three.js presence floats in a dark violet space. It does not react to every
note. It listens to the *shape* of your playing, and answers only when the way
you play reads as an invitation — otherwise it recedes into the dark, dimming,
clearly attending rather than broken.

---

## Instrument (symbolic note stream — no mic, no FFT)

- **Keyboard:** `a s d f g h j k` walk the mode `D E F G A B C D`; the black
  keys `w e t y u` are the chromatic in-betweens (`D♯ F♯ G♯ A♯ C♯`), expressive
  passing tones *outside* the mode.
- **On-screen keys:** a tappable piano (white keys ≥ 46 px, horizontal-scroll on
  narrow phones) so it works with no physical keyboard — built for Karel's phone
  at the 06:30 review.
- Every note is captured as a symbolic event: **pitch + timestamp +
  hold-duration + velocity**. There is no microphone and no spectral analysis
  anywhere. `music.ts` owns this model.

## The invitation scorer (the heart — `scoreInvitation` in `music.ts`)

Each frame the scorer reads the trailing *phrase* (the run of notes since the
last gap > 0.9 s) and returns four sub-scores plus a combined `invitation` in
`[0,1]`. All four are shown live under the meter (`hold · rise · pause · busy`).

1. **hold / sustain** — a currently-held key, or a long last note, raises it
   (`smoothstep` over ~0.25–1.5 s). A held-open door.
2. **rise** — a *rising, unresolved contour*: the phrase climbs (positive
   overall interval, mostly upward steps) and does **not** fall home. A downward
   final step, or landing on the tonic from above, is read as a resolution and
   damps the score. A question that hangs in the air scores high.
3. **pause** — a *deliberate* silence after a phrase. Zero until ~0.3 s (you've
   merely stopped), peaks around a held ~1.1 s breath, then fades over the next
   few seconds (an endless silence reads as "gave up", not "your turn").
4. **busy** — fast, dense onsets (a tumbling run) *gate the whole score down*.

`invitation = clamp(0.5·hold + 0.4·rise + 0.4·pause) · (1 − 0.7·busy)`, then
smoothed with a ~0.25 s time constant.

## The turn-gate and the withdraw / approach mapping

The companion's **spatial distance encodes its attention** (`scene.ts`):
`presence.z` glides between a far, dim, fog-swallowed position (`invitation → 0`,
"keep going, I'm listening") and a near, bright, large one (`invitation → 1`,
"I'm ready to answer"). A slow idle **breath** (scale + rotation + a breathing
particle halo) keeps it alive even at rest — the silence has a body.

It answers only when **all** hold: `invitation ≥ 0.6`, no key is currently held,
`pause > 0.25` (it replies *into* the silence you offered — never over you,
never mid-run), and it is past its post-answer cooldown. At that instant it
**blooms** (a decision flash), snaps fully near, and speaks. Then it recedes and
the answered phrase is *consumed* (a `floorT` marker) so it can't re-trigger.

## Its voice (generative echo-transform — no ML)

`buildAnswer` takes your last phrase and re-voices it with **one** deliberate
transformation, chosen by a seeded PRNG:

- **inversion** — mirror the intervals around the first pitch;
- **augmentation** — stretch the rhythm ×1.7 and drop an octave (slower, deeper);
- **transposition** — lift diatonically by a third or a fifth (consonant, in-mode).

All companion pitches are snapped to the D-dorian (natural) set so replies stay
warm even when you fed it chromatic notes, and every answer lands on a soft, low
grounding tonic. **Timbre makes the speaker obvious:** you are a bright, thin,
plucked saw+triangle through a fast-closing filter; the companion is a soft
breathy pad — detuned sines + a whisper of filtered noise + gentle vibrato —
floated on a small feedback-delay air. Your notes also leave brief rising
light-traces in the scene.

## Determinism & teardown

All randomness is a seeded `mulberry32` (seed `0x4296`); all timing is
`performance.now()` + `requestAnimationFrame`. No `Math.random`, `Date.now`, or
`new Date`. The `AudioContext` is created and resumed only inside a user gesture.
On unmount everything is torn down: rAF cancelled, all three.js geometries /
materials / renderer disposed (+ `forceContextLoss`), all audio voices stopped
and the context closed, and every listener removed. Degrades gracefully: no
WebGL → a `text-destructive` notice while the instrument and its listening keep
working; no keyboard → the on-screen keys; audio blocked → a notice, visuals
continue.

## Named references

- **arXiv:2606.05121 — "Audio Interaction Model."** A streaming
  perceive→decide→respond loop that decides *whether* a moment warrants a
  response. Breath's scorer + turn-gate is exactly this "decide whether" stage,
  hand-rolled.
- **Pauline Oliveros, *Deep Listening*.** Attention and receptivity treated as
  the musical act itself — here the companion's *listening* (its withdrawal and
  approach) is the primary expressive channel, not an afterthought.
- **George Lewis, *Voyager*.** An improvising system that decides its own
  participation rather than merely following. Breath decides *when to stay
  silent*.
- **Contrast — *Aria-Duet / "The Ghost in the Keys"* (2026).** That system needs
  an **explicit** handover signal to take its turn. Breath **infers** the
  invitation from *how* you play — sustain, contour, and the pause you leave.

## Next-cycle deepening

- **Learned invitation, still hand-rolled:** let the threshold and sub-score
  weights adapt to the individual player over a session (a slow running estimate
  of how *this* person tends to invite) — without any ML, just online statistics.
- **Confidence in the reply, not just the turn:** map scorer confidence to *how*
  it transforms — a tentatively-invited moment gets a near-literal echo; a
  strongly-invited one gets a bolder inversion or a longer developed answer.
- **Multi-turn memory:** have the companion remember the last few gestures so a
  call-and-response can *develop* a motif across turns rather than reset each
  time.
- **Breath-visible interruption:** if you start playing again while it is
  answering, let it audibly and visibly *yield* mid-phrase (a quick withdraw)
  rather than finish over you — reinforcing that it is always listening.

## From the two DEEP runners-up (cycle 969 fold-ins)

Breath shipped as the winner of a 3-way DEEP fan-out; the two SVG siblings
(banked in IDEAS §969) each solved a different half of the problem, and their
best mechanics are the clearest deepening path here:

- **Make the *held breath* literal (from `4280-cadence`).** In that sibling, an
  open phrase simply *cannot close while a key is held* (`t1 === 0`) — the held
  finger IS the held breath. Breath currently reads sustain as a continuous
  score; adopting the hard "a note in progress is a thought in progress, and the
  companion will not decide over it" rule would make the withholding feel even
  more principled.
- **Make the decision *visible*, not just embodied (from `4312-trading`).**
  Breath shows silence as a *body* (distance, dimming, fog) but hides the
  reasoning. Trading surfaced an explicit `LISTENING→DECIDING→SPEAKING→
  WITHDRAWING` state and a filling readiness meter so you can *watch* it decide.
  A faint state glyph / invitation-history trail behind the presence would let
  Breath be both felt AND legible — the embodiment plus the teaching.
