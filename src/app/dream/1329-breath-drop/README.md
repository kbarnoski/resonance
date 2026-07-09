# 1329 · Breath Drop

**The one question:** *What if you had to **breathe the drop into being**?*

A psychedelic club / altered-states instrument where the EDM build-and-drop
tension is **not** a self-running timer — it is a scalar `T ∈ [0,1]` you *charge*
with a sustained rising hum into the mic and *release* with a sharp exhale that
triggers the drop. This is the played, embodied counterpart to the lab's
self-running `387-drop-engine`, and it puts a **real input** on the mic (which
had been passive-gain-only).

`state: breath-trance club-peak · pole: intense`

## How to use

1. Tap **Begin — allow the mic**. Wear **headphones** (keeps the mic from
   hearing the beat and re-triggering).
2. **Hum a steady, rising tone.** The louder and steadier the hum, the faster
   the tension charges. Watch the big tension meter climb; the beat stacks up as
   it rises. Pitch drives the hue and the filter, so a rising hum audibly and
   visibly climbs.
3. When the meter passes the **READY** marker (~0.7), give a **sharp loud
   exhale / vocal hit** — that transient fires the drop: hard downbeat, full
   four-on-the-floor, and a cosmic-gold visual slam.
4. After the drop the tension decays (the breakdown). Breathe it back up. It
   loops, player-shaped, never identical.

**No mic?** Hold **SPACE** to charge, tap **ENTER** to drop. If the mic is
denied or silent for ~2.5 s, a gentle **auto-demo** runs a scripted
charge → drop → breakdown cycle hands-free and stops the instant real input
arrives.

## The mechanic

- **T is player-driven.** A mic tone above the noise floor charges T upward
  (louder ⇒ faster); silence decays it slowly.
- **Layers gate on T** at 126 BPM via a lookahead step-sequencer:
  `T>0.05` kick · `T>0.35` closed hats · `T>0.55` riser (Shepard drive-up +
  bandpass noise sweep + drone filter opening) · `T→1` snare fill.
- **The drop** = a sharp spectral-flux onset above an *adaptive* threshold
  (`mean + 2.5σ` of recent flux) while `T ≥ 0.7`. It fires a hard impact
  (kick + sub + noise burst), the full groove, and SLAMS the visual:
  saturation / scale / brightness bloom of a **log-polar Klüver form-constant**
  field that densifies with T.
- **Mic-feedback control:** the detection band is high-passed (~90 Hz), browser
  AGC/NS/echo-cancel are off (raw signal), the analyser is never connected to
  the destination, the onset threshold is adaptive, and the UI prompts for
  headphones.

## Safety (non-negotiable)

The drop is a **luminance / saturation / scale bloom + a full beat — NOT a
strobe.** Any repetitive luminance flicker routes through the shared
`SafeFlicker` (opt-in, ≤3 Hz, instant kill) and honors `prefers-reduced-motion`
(reduced motion pulls saturation / contrast / flow speed down, never flickers).
Audio: master gain ≤0.24, a `DynamicsCompressorNode` limiter before the
destination, short envelopes (bounded polyphony), and full teardown (stop nodes,
disconnect mic, close context, remove listeners, `cancelAnimationFrame`) on
Stop and unmount.

## Tags

- **INPUT:** microphone as a real input (loudness + pitch drive the charge; a
  spectral-flux transient triggers the drop). Keyboard fallback: SPACE / ENTER.
- **OUTPUT:** WebGL2 full-screen fragment shader (no Canvas2D, no three.js).
- **CORE TECHNIQUE:** a real rhythmic step-sequencer beat engine (lookahead
  scheduler) gated by player-driven tension, plus a log-polar form-constant
  visual that densifies with T.
- **PALETTE/VIBE:** intense → cosmic; breath-built neon that blooms at the drop.

## Living references

- **Imogen Heap** — *Mi.Mu* gloves and voice-driven live performance: the body
  and voice as the instrument that shapes the mix in real time.
- **Holly Herndon** — voice-as-instrument audiovisual work.
- **Max Cooper** — the club-AV lineage where a single tension scalar drives
  sound and generative visuals together.

**Research hook:** real-time embodied gesture / voice → musical tension / drop.
Cf. *"Real-Time Control of a Virtual Orchestra by Recognition of Conducting
Gestures"* (arXiv 2604.27957, 2026) — the same idea of a live human signal
steering the arc of a piece, here voice/breath instead of a baton.

## Files

- `page.tsx` — client component: WebGL2 setup, the per-frame control loop
  (input → T → drop → uniforms), HUD, keyboard fallback, auto-demo, teardown.
- `audio.ts` — `DropAudio`: 126-BPM lookahead step-sequencer, layer gating,
  drop impact/groove, Shepard riser + drone bed + noise sweep, master limiter.
- `breath.ts` — `BreathInput`: mic graph, RMS level, spectral centroid (pitch),
  spectral flux + adaptive-threshold onset detection.
- `shader.ts` — WebGL2 GLSL (uses shared `LOGPOLAR_GLSL`) + program compile.
