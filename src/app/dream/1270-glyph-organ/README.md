# 1270 · Glyph Organ

**What if the visual field itself were a living monospace TERMINAL of glyphs — a
text/ASCII surface you play, that writes and reads itself as music?**

The entire art surface is a ~90×40 fixed-width character matrix rendered on
Canvas2D (`fillText` of real glyphs on a cell grid — not sprites, not a shader).
Every cell holds an energy value drawn as a character from the luminance ramp
`" .:-=+*#%@"`. You play the terminal; it writes, ages, and answers itself.

Phosphor duotone: cyan-white glyphs on a deep terminal indigo (`#060814`) with
scanlines and a soft vignette. A very slow global brightness "breath" is routed
through the shared `createSafeFlicker` engine (≤3 Hz soft sine, floor 0.72), so
there is no hard full-frame strobe — the motion is per-cell.

## How to use

1. The terminal is alive on load (a roaming write-head + an autonomous composer
   keep it drifting) — silent until you Begin.
2. Press **Begin** to unlock audio (a sustained drone bed starts so it is never
   silent).
3. **Play the keyboard** — no mic required:
   - `z x c v b n m` — low octave (×1)
   - `a s d f g h j` — middle octave (×2)
   - `q w e r t y u` — high octave (×4)
   - Each row is the 7-note just-intonation scale `[1, 9/8, 5/4, 4/3, 3/2, 5/3,
     15/8]` over base C3 (130.81 Hz). Higher pitch = further right / higher on
     the grid. Held keys build denser glyph texture (throttled to ~85 ms).
4. **Optional mic** — press *sing / hum (mic)*. Onsets drop a glyph impulse whose
   grid position is the nearest scale pitch to the detected spectral centroid;
   loud transients ripple outward with a bigger radius, and the organ softly
   answers the sung pitch. Mic is gesture-gated and fully optional; if it fails,
   the error shows in rose and the keyboard keeps playing.
5. **Stop** instantly kills all sound (voices + drone + AudioContext) and the
   mic. The idle glyph field keeps drifting silently.

## The CA / propagation rule

The grid is an **excitable typographic medium**, not a spectrogram readout. Each
fixed step (45 Hz; 24 Hz under reduced-motion) every cell updates:

```
avg   = mean(4 wrap-around neighbors)
next  = cur + (avg - cur) * 0.17     // diffusion: spread into neighbors
next *= 0.963                        // decay: age down the glyph ramp
```

A bright `@` impulse therefore blooms outward, cooling through `#%*+=-:.` as it
spreads and fades — glyphs are born, age, and die on their own. Two autonomous
sources keep the field composing when untouched:

- a **roaming write-head** that lays a faint glyph trail (idle animation), and
- an **autonomous composer** that walks the scale and emits soft notes, thinning
  out as you play harder (tracked by an `activity` measure) so the field yields
  the foreground to you.

Minute-1 (sparse drift + occasional auto-notes) looks and sounds clearly
different from a dense played passage — it is generative, not a mirror.

## Answer-your-phrase behavior

Every played note (keyboard or mic onset) schedules, with 0.8 probability, a
**transposed echo** ~0.42 s later: the same note shifted up the scale (a third or
a fifth), quieter, landing further right on the grid. The terminal replies to
your phrase a beat behind rather than echoing it 1:1 — call and response in
glyphs and FM voices.

## Sound

Small polyphonic FM synth (sine carrier + sine modulator, deterministic ratio),
each voice pitched from its glyph event, through a master gain → `DynamicsCompressor`
limiter → destination. A detuned sawtooth drone bed through a slow LFO-swept
lowpass gives a soft sustained pad. Every glyph you see is a voice you hear.

## Determinism & safety

- All randomness is a seeded **mulberry32** PRNG — no `Math.random`.
- Render is cheap: only active cells draw, batched by luminance bucket (~9
  `fillStyle` changes/frame).
- `prefersReducedMotion()` slows the medium and the write-head.
- No hard strobe; global brightness only breathes via `createSafeFlicker`.

## Named references

- **Ryoji Ikeda** — *datamatics* / *test pattern*: data as glyph, the terminal
  aesthetic.
- **John Cage** — *Empty Words*: language dissolved into sound-events.
- The **teletype / ASCII-art** lineage: characters as the display medium.
