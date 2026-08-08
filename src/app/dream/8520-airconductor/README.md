# 8520 · Air Conductor

**The one question it answers:** *What if you could CONDUCT a small consonant
ensemble with your bare hands in the air, over a webcam — height shaping
dynamics, a beat-gesture cutting a section in?*

The verb is **conducting**, not painting. Your hands are a controller for an
ensemble of voices, not a brush over pixels.

## The instrument

A fan of **seven voice-columns** radiates from a focal point at the bottom of
the frame — a small consonant choir tuned to a two-octave major triad
(C3·E3·G3·C4·E4·G4·C5 ≈ harmonics 4·5·6 of a low fundamental, a subset of the
overtone series). Voices are **struck/bowed** on cue — short 2-op FM tones with a
percussive-to-bowed envelope, a per-voice lowpass, stereo pan across the fan, and
a shared plate reverb + delay. **There is no sustained drone bed**: the ensemble
is silent until the conductor cues it.

Rendered in Canvas2D as a **warm cue-light on graphite** — no violet, no
cosmic-nebula look. Idle bars are graphite; a cue floods a column with warm
amber and throws a beat-flash.

## The conducting mapping

| Gesture | Control |
| --- | --- |
| **Left hand HEIGHT** | Global **dynamics field** (0..1). Raise it and the whole ensemble swells; lower it and it hushes. Shown as the `DYN` meter on the left. |
| **Right hand HORIZONTAL** | Which **section** of the fan is foregrounded — the pointed column brightens and leans in. |
| **Right-hand DOWN-FLICK** | A **CUE** fires on the foregrounded section: it strikes and its neighbours arpeggiate in — a phrase, not a drone. A beat-flash pulses. |
| **Pinch** (thumb↔index) | **Articulation / brightness** — tight pinch = staccato + bright, open = legato + soft. |

A live readout names what each hand currently controls
(`L: dynamics 0.62 · R: section 3 · artic staccato · beats N · dtw 0.71 · src …`).

## The beat detector

A lightweight recognizer (`conductor.ts` → `BeatDetector`) keeps a short **ring
buffer of the right wrist's vertical velocity**. A robust **velocity-peak +
direction-reversal** trigger arms on a fast downward plunge and fires on the
reversal (the baton's "hit" point), throttled by a cooldown. The shape is
confirmed by a **tiny dynamic-time-warping (DTW) distance** against a canonical
downbeat velocity template — the DTW confidence is surfaced in the readout.

## How it degrades

- **No camera / no permission:** a seeded **phantom conductor**
  (`mulberry32(0x8520)`) drives invisible hands through a ~28s conducting arc —
  swelling the dynamics, sweeping across sections, and throwing periodic
  down-flicks that the *same* beat detector catches. The instrument plays and is
  demoable on load with zero permissions and zero gestures.
- **No webcam:** the mouse is a **pointer-fallback right hand** — move to aim a
  section, click for a downbeat.
- **Real hands, once detected,** take over from the ghost (hands are assigned by
  screen side: far-left = dynamics, far-right = baton). Drop your hands or turn
  the camera off and the ghost resumes after a short grace period.
- Audio is gated behind a user gesture (autoplay policy) — **Play** starts the
  ensemble; **Start camera** starts both.
- `prefers-reduced-motion` softens the flash, glow, and baton trail while keeping
  everything functional.
- Full teardown on unmount: cancels rAF, closes the AudioContext, closes the
  HandLandmarker, and stops all camera tracks.

## Named references

- **Gesture2Music** (arXiv:2511.00793, Nov 2025) — real-time conducting-gesture
  recognition via dynamic time warping. The velocity-ring-buffer + DTW template
  match here is a lightweight homage.
- **Michel Waisvisz, *The Hands*** (STEIM, 1984) — the hands as a gestural
  instrument controller.
- **Imogen Heap, Mi.Mu gloves** — gesture-to-music performance gloves.

## Files

- `page.tsx` — component, rAF loop, arbitration (camera / pointer / ghost),
  Canvas2D conductor's-fan render, chrome.
- `conductor.ts` — `GhostConductor`, `BeatDetector` (ring buffer + DTW),
  `mulberry32`, shared types.
- `audio.ts` — `ConductorAudio`: the 7-voice struck/bowed FM ensemble + FX.
- `handLoader.ts` — CDN-runtime MediaPipe HandLandmarker loader (never bundled).

## Next-cycle deepenings

- Recognize more of a conductor's vocabulary: legato sweeps (crescendo hairpins),
  a cutoff/release gesture, tempo inference from beat spacing (a real DTW over
  multi-beat patterns, not just the downbeat).
- Two-handed independence: left hand shaping a phrase envelope while the right
  keeps time, instead of dynamics being a single scalar.
- Per-section timbre families (bowed strings vs. struck mallets vs. breathy
  choir) so foregrounding a section changes colour, not just loudness.
- A recorded/looped "score" you can conduct against, with the ghost as a
  rehearsal partner you can overrule bar by bar.
