# 1444 · Troxler Void

**The one question:** *What if stillness itself dissolved the screen?* A drug-free
staging of sensory / ego boundary-dissolution built on the visual system's **own**
adaptation. Hold still and the world melts into a uniform void; move and it
re-forms. The calmer the visitor, the more the field disappears.

This is a real, robust perceptual phenomenon — **not** a medical claim.

---

## What it is

A full-viewport, ultra-low-contrast **Ganzfeld** field in cosmic-ambient
indigo/violet/warm-grey over near-black, paired with a generative drone. A soft
central **fixation glyph** anchors the gaze. Rest your eyes on it and be still: the
periphery fades toward a flat, uniform void. The smallest pointer movement re-blooms
the touched region — and the drone blooms with it.

- **Input:** pointer stillness / dwell. Movement (and its speed) re-forms and
  brightens the field near the cursor; holding still lets each region fade. No mic,
  no camera, no keyboard-as-instrument.
- **Output:** WebGL2 fragment-shader field (slow fbm colour-drift in a near-uniform
  Ganzfeld), with a graceful **Canvas2D fallback** that draws the same soft field.
- **Audio:** a detuned-oscillator drone → gentle lowpass → `DynamicsCompressor`
  limiter → master gain ramping 0 → ~0.18 from silence.

## The mechanic — simulated Troxler fading + Ganzfeld

The core (and, in this lab, the never-before-used technique) is a **per-region
adaptation buffer** — see `field.ts`. A coarse 40×40 grid tiles the viewport; each
cell holds an `adaptation` level in `[0,1]`:

- Adaptation **rises** the longer a region goes without change or attention —
  asymptotically toward 1. It rises **faster in the periphery** than at the fixated
  centre (`smoothstep` on radial distance), matching the real percept where the
  periphery melts first while a fixated point persists.
- Pointer movement near a cell **resets** its adaptation (a soft Gaussian of
  influence scaled by pointer speed) — the region re-forms.
- In the shader/fallback, a region's contrast and colour deviation are scaled by
  `pow(1 - adapt, 1.6)`, collapsing toward the flat mean field colour as it fades.

The mean adaptation across the field (`voidness`) and its inverse (`bloom`) drive
the audio. As the void deepens, upper partials drop out one by one, the lowpass
closes (less body), and the reverb send opens (the space "opens" — more tail). On
movement everything re-blooms. **Audio and image dissolve together.**

## Idle self-demo (hands-off)

Before *Begin*, the field already animates (silent). After ~2.6 s with no pointer,
an idle self-demo takes over: a **virtual gaze** drifts on a slow Lissajous
(clearing adaptation along its path) and a slow ~13 s **breath** periodically
re-forms the whole field. So a desktop reviewer who never touches anything still
watches the void melt and bloom — never a dead screen.

## Safety

No strobe, no full-screen flash. Only slow (sub-Hz) luminance/contrast drift — the
opposite of flicker. `prefersReducedMotion()` is honoured: all motion is slowed and
the drift softened. Output-only audio (no mic → no feedback/howl path).

## Named references

- **Ignác Troxler, 1804** — *Troxler fading*: a steadily-fixated, unchanging
  stimulus in the periphery fades from perception. ("Über das Verschwinden gegebener
  Gegenstände innerhalb unseres Gesichtskreises.")
- **Wolfgang Metzger, 1930** — the *Ganzfeld*: a homogeneous, structureless visual
  field, under which perception destabilises and boundaries dissolve.

## Technical notes

- `page.tsx` — client component; single rAF loop (idle preview + running), pointer
  velocity sampling, gesture-gated AudioContext, full teardown (cancel rAF, close
  ctx, `WEBGL_lose_context`).
- `field.ts` — the adaptation buffer + idle self-demo. Deterministic (mulberry32;
  no `Math.random` / `Date.now`).
- `renderer.ts` — WebGL2 shader renderer (uploads the adaptation grid as an `R8`
  texture) and the Canvas2D fallback (per-pixel low-res buffer upscaled with
  smoothing for the same soft glow).
- `audio.ts` — drone with per-partial dropout, bloom-driven brightness, and a
  voidness-driven reverb send. Uses the shared code-generated void IR
  (`_shared/psych/convolutionVoid`); no external audio files.

## Honest knocks / unverified-in-headless

- **Not verified in a real browser here.** Type-checks and lints clean by
  inspection; the shader and audio graph have not been run in a headless CI, so
  visual tuning (fade rate, contrast, palette balance) may want a pass on real
  hardware.
- The effect is **subjective and gaze-dependent**: it needs genuine steady fixation
  and a calm, dim environment. On a bright screen or with a roving eye it is faint —
  as it should be. The idle self-demo exaggerates the cycle so reviewers can see the
  intended behaviour without the perceptual prerequisites.
- If WebGL2 is obtained but shader compilation fails, the same canvas cannot fall
  back to Canvas2D (a canvas is locked to its first context). This is a rare path;
  the common "no WebGL2 at all" case falls back correctly.
- The adaptation model is a *plausible software analogue* of Troxler fading, not a
  physiological model of retinal/cortical adaptation. It is designed to feel right,
  not to be a simulation of neural gain control.
