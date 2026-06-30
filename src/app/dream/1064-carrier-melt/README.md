# 1064 · Carrier Melt

## The one question

> **What if Karel's REAL piano recording were the carrier wave that melts the
> visual field — and YOU sculpt the melt with your hand?**

An interactive psychedelic instrument (not a lean-back screensaver). Karel's
actual solo-piano recording plays as the structural spine; an FFT analyser reads
its spectral energy and that energy warps the geometry through a log-polar /
form-constant domain map rendered with Canvas2D feedback trails. The music guides
the journey; the listener's pointer/touch is the instrument — **position moves
the melt focus, and pointer SPEED raises the warp gain + saturation.** A still
hand gives calm cosmic drift; a fast frantic drag gives peak melt.

state: psilocybin / LSD warm-drift · pole: cosmic-ambient rising to intense waves

## How it works

- **Real audio carrier** (`audio.ts`) — fetches Karel's recording
  (`549fc519-…`) client-side via the read-only `/api/audio/<id>` route, decodes
  it, and loops it. If the network is unavailable, it synthesizes a slow detuned
  "piano-ish" arpeggio drone with an `OfflineAudioContext` so the piece **always
  sounds**. The active source is surfaced in the UI ("Karel's piano" vs "fallback
  drone").
- **FFT analyser + underwater filter** — the playing buffer runs through a gentle
  lowpass ("underwater melt") into an `AnalyserNode` (`fftSize 2048`), band-averaged
  into bass / mid / high / loudness every frame.
- **Log-polar / form-constant warp + feedback trails** (`render.ts`) — a
  ping-pong feedback buffer is resampled each frame on a grid whose nodes are
  displaced along the log-polar gradient around the pointer focus (mirrors
  `_shared/psych/logpolar.ts` math inline so the CPU warp stays self-contained).
  Fresh form-constant ribbons are stamped over the decaying trails.
- **Band mapping** (mirrors the neural-gain finding): bass → global flow speed +
  warp amplitude; mids → trail decay / hue sharpness; highs → fine ripple detail;
  loudness → saturation / gain floor. **Pointer speed is the dominant warp-gain
  term**, so the human is the reason the field comes alive.

## Named references it borrows from

- **Mendel Kaelen — "The hidden therapist: evidence for a central role of music
  in psychedelic therapy" (Imperial College London, 2018).** Music as the
  *carrier wave* of the psychedelic experience: here Karel's recording is literally
  the carrier that the visuals melt around.
- **Bressloff & Cowan; Klüver form constants.** The retina→V1 cortical map is a
  complex logarithm, so all four Klüver form constants (tunnels, cobwebs, spirals,
  lattices) are one stripe pattern under a log-polar warp. The melt displacement
  and the ribbon geometry are computed in cortical (log r, θ) space.

## Ambition-floor criteria hit

- **#1 lab-first** — the FIRST psychedelic-lane piece driven by Karel's real Path
  recording *as the carrier wave that warps the geometry* (vs. earlier pieces that
  decompose it as a mixer).
- **#2 ≥3 subsystems** — real-audio loader/decode + fallback synth · FFT analyser
  band-extraction · log-polar / form-constant domain warp · Canvas2D ping-pong
  feedback trails · pointer-speed gesture control. (Five.)
- **#3 named references** — Kaelen 2018 + Bressloff–Cowan / Klüver, above.

## Degrade-gracefully behaviour

- No touch (desktop) → mouse works; pointer speed still drives gain.
- `prefers-reduced-motion` → warp amplitude and drift are throttled; the field
  still breathes gently and stays interactive.
- Fetch fails / offline → synthesized fallback drone, clearly labelled.
- No Canvas2D → a readable error message (`text-rose-300`).

## Next-cycle deepening

- Per-octave spectral *spotlight*: pointer position also selects which FFT band
  dominates the local warp (left = bass tunnels, right = high spokes).
- Onset-aware "bloom" — detect piano note attacks (spectral flux) and pulse the
  feedback gain so each struck note visibly ripples outward from the focus.
- Convolution reverb (impulse-response) instead of the lowpass, with the wet/dry
  mix tied to pointer height for a deeper underwater tail.
- A slow 5-minute scored arc: gentle automated focus journeys the hand can
  override at any moment, so it plays itself when left alone but never locks out.
- WebAudio worklet to compute spectral flux off the main thread for steadier
  frame timing on mobile.
