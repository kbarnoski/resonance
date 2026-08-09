# 1476 · Dark Choir

*"What if you closed your eyes, sang or hummed into the dark, and the darkness
sang back — an endlessly, ecstatically rising choir of your own voice that never
stops climbing?"*

**State:** meditative-boundless / ecstatic ascent (jhāna spaciousness + Shepard
endless-rise). **Pole:** cosmic-ambient, but *ascending*, not dissolving.

This is the lab's deliberate "test the screen bias" piece. **Audio is the primary
medium.** The screen is intentionally near-black: a single soft halo that breathes
with your voice. It is meant to be experienced with headphones on and eyes closed —
the visual is a companion, not the show.

---

## How the voice drives the choir

The **voice is the controller** (`mic.ts`). The microphone is a pure measurement
tap — it is never routed to the speakers (no feedback), and nothing is recorded or
sent anywhere. Each frame we extract two slow signals:

- **loudness** — RMS, auto-ranged into `[0,1]` against a slow floor/ceiling so it
  adapts to any singer and room;
- **pitch** — the fundamental in Hz, by autocorrelation with parabolic
  interpolation, held briefly across unvoiced gaps.

Those two numbers drive the audio graph (`audio.ts`):

1. **A Shepard/Risset endless-rise bed** (shared `_shared/visionary/shepard.ts`, 5
   octave-spaced partials under a fixed Gaussian spectral window). Your *loudness*
   is its `drive`: the more you give, the brighter and faster the room climbs. This
   is always gliding upward.
2. **Voice-spawned orbiting choir.** Every note you sing spawns a choir voice
   pitched to your detected fundamental (folded into a warm register). Over an
   ~11-second life it glides up **~2.6 octaves** while a Gaussian amplitude window
   fades it in at the bottom and out at the top — the Shepard illusion applied
   *per voice*, so the climb has no audible ceiling. New voices bloom in below as
   old ones vanish above, so the choir climbs **forever**. Each voice is
   spatialised on a slow **HRTF `PannerNode` orbit**, so the voices circle your
   head.
3. **A just-intonation drone bed** (shared `_shared/visionary/droneBank.ts`, root +
   fifth) is the firm ground of the ascent.
4. Everything sings into a **code-synthesised cathedral / cistern reverb** (shared
   `_shared/visionary/convolutionVoid.ts`, ~5.5 s tail) for boundlessness, then through
   a `DynamicsCompressor` limiter and a master gain that ramps up from silence to a
   gentle peak (≤0.22).

Hum one note and a whole choir lifts off it, endlessly climbing.

### Why ascent, not dissolution

The banned vibe this cycle is ego-dissolution / void-tunnel / "dissolve into the
light." Here the just-intonation drone stays a **firm ground** and the choir voices
keep *lifting* — rising glissandi that brighten — rather than thinning into a void.
The felt sense is being carried endlessly *upward*: boundless, but buoyant.

### The screen-bias rationale

The lab is screen-heavy and mic input has been absent lately. This piece inverts
that on purpose: the microphone is genuinely the instrument, and the screen is
reduced to one breathing halo (`halo.ts`) whose brightness and size track the
choir's live glow. It drifts slowly (well under 3 Hz, no flicker) and stays gently
alive even in silence, so a phone reviewer always sees *and* hears something — but
the piece is designed to work with the eyes closed.

---

## Never blank, never silent

- No mic permission / no `getUserMedia` → a readable `text-rose-300` line **and** a
  synthetic self-play voice: a slow hum that swells and drifts across a pentatonic
  set, so the choir sings to itself. Never throws.
- The halo always breathes; the bed is always audible.

## Safety

Inherently a low-stimulation piece: near-black field with only slow luminance drift
(≤3 Hz), no flicker, no strobe. Honours `prefers-reduced-motion` (positional drift
is disabled; the slow brightness breath remains). Master ramps from silence through
a limiter to a gentle peak.

## Determinism

No `Math.random()` / `Date` in runtime logic — orbit phases come from a seeded
`mulberry32`, timing from `performance.now()`, and the reverb IR from the shared
deterministic LCG builder.

## Voice budget (≤14 concurrent)

Shepard bed 5 · drone (root + fifth ×2 detuned) 4 · orbiting choir ≤4 = **≤13**
oscillators. Per-voice vibrato is scheduled in the step loop rather than spent as
extra oscillators.

## References

- **Pauline Oliveros**, *Deep Listening* — attention to sound as the practice.
- **La Monte Young**, sustained-drone *Dream House* — the boundless held tone.
- **Roger Shepard** (1964) & **Jean-Claude Risset** — the endless glissando /
  auditory barber-pole.
- **jhāna** "oceanic boundlessness" — the spaciousness this reaches for (ascending,
  not dissolving).

## Honest limitations

- Autocorrelation pitch tracking is robust for a sustained hum/sung vowel but wobbles
  on consonants, whispers, or a noisy room; that mostly affects *which* note spawns,
  and the loudness-driven bed carries the experience regardless.
- HRTF orbit is most convincing on headphones; on laptop speakers the circling
  collapses toward a stereo pan.
- The auto/self-play voice is intentionally simple — it demonstrates the instrument,
  it is not a performance.
- One shared bed rather than true per-partial detuned choir sections; a next pass
  could add sung-vowel formant filtering and pitch-class colour on the halo.

## Files

- `page.tsx` — orchestration, UI, drive loop, full teardown.
- `mic.ts` — voice acquisition (loudness + pitch) with synthetic fallback.
- `audio.ts` — the Shepard choir graph.
- `halo.ts` — the restrained breathing luminance field.
