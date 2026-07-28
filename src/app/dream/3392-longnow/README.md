# The Long Now (3392-longnow)

## The one question

**What if a piece of music were on a 1000-year clock — so slow it never repeats
in a human lifetime — and everyone who opens it right now, anywhere, drops into
the SAME instant of it?**

This is a deep-time, no-stakes, observational piece. You do not play it and you
cannot win, lose, or break it. You **visit** it. Its entire state — every pitch,
gain, filter, and dial angle — is a deterministic function of the real wall-clock
time elapsed since a fixed epoch, so two strangers opening the URL at the same
moment hear the identical "now" of a composition that has been unfolding for
years and will unfold for centuries. The relationship is presence / quiet company
with unseen others through synchrony.

## The deep-time engine (the novel technique)

- **Fixed epoch:** `2000-01-01T00:00:00Z` (Longplayer's era). `elapsed = Date.now() - EPOCH`.
- **Six independent slow layers** cycle at distinct **prime** periods in seconds:
  `181` (≈3 min), `1511` (≈25 min), `9721` (≈2.7 hr), `86413` (≈1 day),
  `604801` (≈1 week), `31557601` (≈1 year).
- **Why it does not repeat:** a sum of sinusoids returns to its starting
  configuration only after the least common multiple of the periods. Because the
  periods are distinct primes, they are pairwise coprime, so their LCM is their
  **product ≈ 10^30 seconds** — far longer than a human life, or the age of the
  universe. This is exactly Jem Finer's Longplayer mechanism: a few loops of
  mutually-prime lengths sounding together, never repeating within the span.
- **Genuinely different across timescales:** the fastest layer (181 s) bends the
  chord audibly over **30–90 seconds** of listening — the chord you hear now
  measurably migrates. Meanwhile the day/week/year layers reshape the whole
  voicing over hours and years, and the outermost dial barely moves. Same
  `elapsed` → same state, on every machine. No `Math.random`; the composition is
  fully reproducible.

## Subsystems (≥3 → this has 4)

1. **Deep-time phase engine** (`engine.ts`) — pure `computeState(elapsedMs)`
   returning per-voice continuous frequency + gain, layer phases, brightness,
   and a fictional deep-time calendar.
2. **Multi-layer ambient synth** (`audio.ts`) — six sustained sine/triangle
   voices (each warmed by a slightly detuned partner) through a shared low-pass,
   summed into a soft `tanh` WaveShaper limiter, master gain ≤ 0.15, every
   parameter ramped with `setTargetAtTime`. Continuous pitch — never quantised to
   a scale.
3. **Deep-time visual clock** (`page.tsx`) — an inline-SVG orrery of six
   concentric dials (one per layer) whose markers rotate to each layer's phase.
   Near-still, contemplative, no strobe. Explicitly **not Canvas2D**.
4. **Time-telescope scrubber** — jump ±1 hr / ±1 day / ±1 yr / ±100 yr to
   preview how the piece will sound then, with a live deep-time readout
   ("Year 27 · day 114 · 06:31") and a "Return to the now" that snaps back to the
   shared present.

## Ambition floor — cleared (a)+(b)+(c)+(d)

- **(a) Novel technique:** deterministic deep-time (Longplayer-clock) synthesis —
  grep-0× in the lab.
- **(b) Named reference:** Jem Finer's *Longplayer* (1999–2999); John Cage's
  *ORGAN²/ASLSP* ("As Slow As Possible"), running in Halberstadt until 2640;
  Brian Eno's generative-ambient lineage (*Discreet Music*, *Reflection*).
- **(c) ≥3 subsystems:** four, listed above.
- **(d) Long-form evolving:** state differs across seconds, minutes, hours, days,
  and a year; it evolves regardless of the visitor.

## Degrade / safety

- Audio only from the Start gesture; clean teardown on unmount (rAF cancelled,
  nodes stopped, `ctx.close()`).
- No AudioContext → `text-destructive` on-brand notice, and the SVG deep-time
  clock keeps turning from the real wall clock.
- No motion faster than ~2°/sec anywhere — no strobe/flicker; inherently
  reduced-motion-safe.
- Self-contained: no cross-prototype imports, no npm deps, no network, no API
  route, no secrets.

## Next-cycle deepening

- Add a faint per-voice halo in the orrery so you can *see* which layer is
  swelling, not only where each phase sits.
- A shareable timestamp permalink ("meet me at Year 40, day 200") so two people
  can rendezvous at a chosen deep-time instant.
- A three.js orrery variant with the layers as slowly-precessing orbital shells.
