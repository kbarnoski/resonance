# 9304 · passage

**The one question:** *What if spatial sound alone could carry you through the
archetypal PASSAGE — a receding tunnel, voices streaming past, a growing
being-of-light ahead, a lucid clarity-snap, and a warm return?*

This is the lab's deliberate first **audio-first** piece. The payoff lives in the
headphones; the screen is a single near-blank luminous bloom that grows through
the phases. State = `nde-tunnel-toward-light`, pole = `cosmic-ambient` — warmer
and brighter than a pure void, because the arc climbs to a lucid peak.

## The arc (≈ 4:45, stateful, with memory)

| phase | time | sound | screen |
| --- | --- | --- | --- |
| **the threshold** | 0–42s | sparse, distant voices; dark corridor | dim, cool, blurred bloom |
| **the tunnel** | 42–150s | warm voices spawn AHEAD (−z, far), travel through the ears and behind (+z), passing faster and faster | bloom widening, warming |
| **the light** | 150–214s | a centre bloom of additive partials swells; voices resolve toward chord tones | widest, brightest, warm gold |
| **clarity** | 214–238s | the lucid snap — micro-detune collapses to zero for a moment of impossible consonance | a smooth crispness ramp (never a flash) |
| **the return** | 238–285s | voices thin, the bloom resolves, warmth settles | dimming to a warm rest |

Minute 4 does not sound or look like minute 1: the timeline
(`timeline.ts`) is a single pure function both the visual and the audio read, so
the two streams stay locked to one phase clock (anchored to
`AudioContext.currentTime` during the real journey).

## How the corridor is made

- **Moving sources.** Each voice is a transient (note-gated, not a drone) placed
  on an HRTF `PannerNode` and ramped from far ahead through the head to behind —
  a Chowning-style moving-source pass-by that the auditory system reads as
  forward motion. Density and pass-speed rise through the tunnel.
- **No static drone bed.** The centre "light" is additive partials on a resolving
  chord whose per-partial gains breathe and whose detune collapses at the snap;
  it swells and then RESOLVES rather than holding a pad.
- **Resolving mode.** Voices are quantized to a warm major-pentatonic mode and
  biased ever more toward the consonant root triad as the light grows.
- **Fallback.** If HRTF panning is unavailable, voices render on a
  `StereoPanner` + L/R `DelayNode` (ITD) + gain (ILD) sweep instead — coarser,
  but still a pass-by. The UI shows a note when this happens.

Everything routes into the shared `safeMaster` ear-safety limiter and through a
`convolutionVoid` reverb for corridor depth.

## Controls

- **Begin (headphones)** — one gesture; the passage then unfolds itself.
- **Preview the whole journey (~30s)** — time-compresses the full arc so a muted
  reviewer sees every phase with no audio or permissions.
- On mount a muted auto-run animates the bloom within ~1s (no audio, no prompts).
- Optional *lean forward to move faster*: `deviceorientation` tilt, with a
  pointer fallback (move toward the top of the screen). Purely optional — it
  nudges voice density, never the arc clock.

## Safety

No visual strobe or flicker anywhere — even the clarity-snap is a smooth
luminance/scale ramp, never a flash. Slow drift only; `prefers-reduced-motion` is
honoured (breathing amplitude is damped). Audio is gentle and limited.

## References (motifs, not claims)

- **Chowning, J. (1971)** — *The Simulation of Moving Sound Sources* — the moving
  binaural pass-by that gives the corridor its forward motion.
- **van Lommel et al. (2001, Lancet); Greyson (NDE Scale)** — the recurring
  phenomenology (tunnel, being-of-light, boundlessness, return) the arc traces.
- **Borjigin et al., PNAS (2013)** — the surge-of-gamma-at-death observation, the
  motif behind the lucid "clarity-snap."
- **Aparicio-Terrés et al., Annals of the NYAS (2025/26)** — sound-induced
  altered states of consciousness, framing the audio-first approach.

## Honest limits

- HRTF is generic (a browser-averaged head), so externalization varies by
  listener and by headphones; some ears will localize the pass-by better than
  others. It is best on a recent desktop Chrome or Safari.
- The "clarity-snap" is a musical and luminance gesture, an evocation of a
  reported phenomenon — not a physiological simulation.
- The piece describes the STATE/phenomenon (passage, tunnel, being-of-light,
  lucid, return) only.

## Next-cycle deepening (this is a claimed multi-cycle build)

`passage` is cycle 1 of the lab's first audio-first line — the spatial-arc
engine and the muted-legible growing-light visual. Deepenings, grafting the
best of the two runner-up explorations from the same fire:

1. **Karel's REAL Path piano as the carrier voice.** Replace the FM/additive
   tones with grains of his actual recording (read-only `GET /api/audio/[id]`,
   seeded fallback), so the voices that stream past you are *his piano* — cashes
   the standing real-piano directive through the new spatial-passage verb.
2. **Breath-pacing (from `9272-boundless`).** Let a slow mic RMS breath-envelope
   pace the approach: each exhale presses you a little further down the corridor.
   Embodied, non-pointer, and it makes the passage yours to walk.
3. **True head-tracking.** Use `deviceorientation` to rotate the whole HRTF
   field with your head (not just nudge density), so turning to look changes
   where the voices are — the strongest externalization upgrade.
4. **The desync option (from `9288-dissolve`).** An optional "dissolve" variant
   where the on-screen bloom is deliberately lagged behind the audio to induce
   derealization — powerful in headphones, but must be made legible even muted
   (a faint "expected vs actual" ghost) so it survives a silent review.
5. **Longer form + memory of the walker.** Extend past 5 min and let the return
   quote a motif from the threshold, so the arc literally remembers where it began.
