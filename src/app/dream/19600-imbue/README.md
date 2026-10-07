# Imbue

**Status**: wip — the audio cross-synthesis core is verifiable by reading the graph and the build is green, but the live camera path and the dry↔wet balance need a ~30-second webcam + headphones check (no camera or GPU in the cloud where this was built).

**One question:** what if one of Karel's recordings became the resonant *body* that another of his recordings plays inside — and your body chose which *moment* of that second recording the first one gets to resonate in?

## What it is

Two of Karel's real takes, fused by **convolution cross-synthesis**:

- **EXCITER** — *Interplay*. The piano you actually hear.
- **BODY** — *Isolation*. Never heard directly. Instead, five ~0.6-second windowed, energy-normalized slices of it are pre-rendered as **impulse responses** and loaded into five `ConvolverNode`s. The exciter is convolved through them, so it rings with the harmony, decay, and room of whatever moment of *Isolation* you've landed on. One recording plays *through* the body of the other.

The impulse response is **navigable material, not a static filter** — sit tall or low and the scan equal-power-crossfades between adjacent convolvers, so the exciter literally resonates inside a *different moment* of the other recording as you move. This is the lab's first convolution cross-synthesis of one real take by another; every prior convolver prototype used a synthetic reverb IR (`6568-dulcet`, `14864-betweenus`) or a take's own self-tail (`18000-aureole`, `18960-surgeline`).

## How your body conducts it

Full-body pose (MediaPipe PoseLandmarker, shared loader). Gated on **shoulders + nose only** — never hips or legs — so a seated desk webcam from the waist up is all it needs.

| Body signal | Parameter | Effect |
| --- | --- | --- |
| Torso **height** (sit tall ↔ low) | **scan** | which moment of *Isolation* becomes the impulse response |
| Shoulder **width** (lean toward ↔ away) | **imbue** | dry recording ↔ fully dissolved into the other's resonance |
| Lateral **lean** (left ↔ right) | **tone** | cavern-dark ↔ sympathetic-bright (a lowpass on the wet bus) |

No camera, denied permission, or model-load failure → an instant **pointer** fallback (move the mouse: x = tone, y = imbue) and an always-running **autonomous demo** that drifts the identical scan/imbue/tone chain, so the piece breathes with nothing attached. A small mono status line always says which is driving (`tracking · live` / `pointer` / `demo`) and shows a `tracking · lost` state with an actionable hint.

## The visuals

Layered **Canvas2D** — resting the jury-banned three.js *and* the now-overused raw-WebGL2 point field (graft used it last cycle):

1. **The chamber** — a field of sympathetic resonant strings whose standing-wave spatial pattern (wavenumber) is set by **scan** (the current *Isolation* slice) and whose amplitudes read the 12-band spectrum of the *convolved* signal. The body of *Isolation*, made visible.
2. **The voice filament** — a traveling near-white glow for the dry exciter; brightest when the imbue is low (you hear *Interplay* plainly).
3. **The resonance bloom** — a warm amber radial swell that grows at convolution-energy peaks and with deep imbue.

Achromatic nocturne: graphite ground, pearl strings, a single restrained amber accent. Distinct from graft's heartwood and from the cool cyan/teal/violet-clinical register.

## Why it's built this way (safety + honesty)

- **ABSOLUTE rule 10** — audio is only Karel's verified catalog. Both sides are real recordings; there are no oscillators or synthesized tones. The exciter is heard dry and convolved; the body take has **zero path to the speakers** — it exists only as the shape of five impulse responses. So "one take plays through the other" is guaranteed by the graph, not hoped for.
- Every node terminates in the shared `createSafeMaster` bus (never `ctx.destination` directly). The IRs are energy-normalized and the master is brick-wall-limited, so convolution — which can sum energy loudly — can't run away.
- Visuals are driven by the `safeMaster` analyser, so every visible motion has an audible cause.

## Research anchor

**Concatenation-Driven Convolution** (Abate & Hansen, *A Unified Framework for Real-Time Concatenation-Driven Convolution*, DAFx26, 2026) reconceptualizes impulse responses as *dynamic, navigable sonic material* rather than static filters — "any audio material can serve as the navigable source, extending convolution into timbral processing and cross-synthesis via gesture-based traversal." Imbue is that idea built with a five-tap navigable IR bank and, under rule 10, Karel's real recordings on both sides instead of a measured corpus. Classic technique: convolution brassage / cross-synthesis (Curtis Roads, *Microsound*).

## What I couldn't verify here

No webcam or GPU in the cloud build environment. The convolution graph and the control chain (landmark → feature → parameter → audible/visible change) are traced in code, and the build is green, but these need Karel's eyes/ears:

- Whether live pose scanning feels immediate while sitting tall/low.
- Whether the shoulder-width depth proxy suits a real seated body.
- Whether the dry↔wet balance and the per-slice wet level sit nicely on headphones (the wet makeup is a single constant, easy to tune).

If any feel off, it's a one- or two-number pass.
