# 601 · feedback howl

**One question:** What if an instrument had _no input source_ — just a Web Audio
graph fed back into itself, screaming and howling on the edge of runaway — and
you SCULPT the chaos with your keyboard and your phone's tilt, riding the brink
without letting it blow up?

This is a deliberately anti-cozy, abrasive piece: a digital homage to the
**no-input mixing board** tradition. No warm pads, no just-intonation, no gentle
bloom. It is unstable, alive, and a little dangerous-feeling — but safely tamed
so it never literally damages speakers or ears.

## What it is

The sound has no oscillator, no sample, no microphone. It **is** its own
feedback loop. A single ring of Web Audio nodes routes its output back to an
earlier point and self-oscillates once a tiny noise seed kicks it. The loop gain
sits just below 1.0 so it sustains and howls. You bend, choke, and spike that
howl from the keyboard and (on a phone) by tilting the device — never by
touching the glass.

## How to use

1. Open the page. Within ~2.5 seconds it **auto-starts a gentle, low-level
   version** of the feedback so a muted glance already shows a living, writhing
   field with zero interaction.
2. Press **Start the howl** to bring the audio up to playing level and (on a
   phone) request tilt permission. Real keyboard / tilt input instantly takes
   over from the auto-demo; the demo wander resumes after ~5s of stillness.
3. Sculpt the chaos. Use **PANIC / kill** at any time to instantly drop the loop
   gain to zero.

### Key map

| Input            | Effect                                            |
| ---------------- | ------------------------------------------------- |
| ↑ / ↓            | loop gain — tension, toward the edge of runaway   |
| ← / →            | delay time — the pitch of the howl                |
| `[` / `]`        | filter cutoff                                     |
| `-` / `=`        | resonance Q                                       |
| `1` … `9`        | jump cutoff across the band                       |
| space            | "stab" — momentary gain spike for a screech       |
| `P` / `Escape`   | PANIC kill (instant loop-gain ramp to 0)          |
| tilt forward/back | bend filter cutoff                               |
| tilt left/right  | bend delay / pitch                                |

A monospace HUD shows loop gain, delay (Hz), cutoff, resonance Q, and peak
level, plus the active render mode and an `[auto-demo]` flag.

## Audio signal path (no external source)

```
feedbackGain → delay → bandpass → peaking → waveShaper(soft sat) → dcBlock(HPF) ┐
     ^                                                                          │
     └──────────────────────────── (loop closes) ──────────────────────────────┘

shaper also taps → masterGain → DynamicsCompressor (brick-wall) → analyser → out
```

A short decaying noise impulse is injected once at start to break silence and
kick the ring into self-oscillation.

## Safety clamps (non-negotiable — this is feedback)

- **Hard loop-gain cap:** `LOOP_GAIN_MAX = 0.985`, never reaches 1.0 → no true
  runaway.
- **Master brick-wall limiter:** a `DynamicsCompressor` (threshold −8 dB, knee 0,
  ratio 20, fast attack) on the master.
- **DC blocker:** a highpass at ~90 Hz prevents DC pile-up that wrecks feedback
  loops.
- **PANIC / kill:** instantly ramps loop gain and master to 0.
- **Sane starting volume + mute:** master starts low (~0.16 auto-demo, ~0.32
  play); a mute toggle is always visible.

The result is abrasive, not literally painful or speaker-destroying.

## Graceful degradation (never a silent fail)

- **Tilt denied / unavailable** → keyboard-only; an on-screen `text-rose-300`
  notice says exactly which state you're in.
- **WebGPU unavailable** → a real Canvas2D renderer draws an equivalent violent
  reactive spectrum (writhing lattice + tearing scanlines + waveform ghost),
  never blank, never an error.
- **Audio blocked until gesture** → the **Start** button is the gesture; the
  idle auto-demo also starts audio at a safe low level.

## Subsystems (≥3)

1. **Feedback DSP network** — the self-oscillating no-input ring + safety chain
   (`audio.ts`).
2. **Keyboard control mapping** — keys → loop gain / delay / cutoff / Q / stab /
   panic (`page.tsx`).
3. **Tilt control mapping** — `deviceorientation` (with iOS 13+
   `requestPermission()` inside the start gesture) → cutoff & pitch bends.
4. **WGSL reactive spectrum render** — a violent full-screen frequency lattice
   that smears and whites out at resonant peaks, with a Canvas2D fallback
   (`gpu.ts`).

## Ambition cleared

- **#1 — First of its kind in this lab:** the lab has many oscillator / sampler
  / granular synths, but this is the first piece whose **sound is its own
  feedback loop** (no-input self-oscillation synthesis).
- **#2 — ≥3 subsystems:** four, listed above.
- **#3 — Named references:** below.

## Named references

- **Toshimaru Nakamura** — _no-input mixing board_: an instrument that is nothing
  but its own feedback.
- **David Tudor** — live-electronic feedback works (_Rainforest_ / _Pulsers_
  lineage).

## Files

- `page.tsx` — UI, keyboard + tilt mapping, idle auto-demo, HUD, PANIC/mute.
- `audio.ts` — the feedback network and every safety clamp.
- `gpu.ts` — WebGPU spectrum renderer + Canvas2D fallback.
