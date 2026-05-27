# Texture Drum — design notes

**For**: kids 3+ · parents · anyone who taps
**Built**: Cycle 212 — 2026-05-27
**Route**: `/dream/181-kids-texture-drum`

## The question

What if every surface had its own sound — and you could drum on anything?

All 30+ prior kids prototypes use pitched notes in C-major pentatonic. The musical dimension is always
**pitch** (high vs. low). This is the first kids prototype where **timbre** (sound quality / texture) is
the primary dimension. A child who taps Wood and then taps Glass doesn't hear "lower vs. higher" — they
hear "dull thud vs. bright ping." That's a completely different musical cognition from everything else
in the sandbox.

## Five materials

| Zone | Color | Sound design | Physics analogy |
|------|-------|--------------|-----------------|
| 🪵 Wood | amber | Noise burst through 270Hz lowpass + 185Hz body resonance | Tapping a wooden table |
| 🔔 Metal | cyan | Noise through 820Hz bandpass at Q=18, 800ms ring | Small bell or tin can |
| 💧 Water | violet | Noise through LPF sweeping 900→180Hz over 320ms | Water drop splash |
| 🥁 Earth | deep amber | 72Hz sine transient, 440ms decay | Deep floor drum |
| 🫙 Glass | rose | 2440Hz sine, 86ms sharp decay | Tapping a wine glass |

The frequency assignments aren't arbitrary: they follow the material physics of acoustic resonance.
Wood has mass at low-mid frequencies (the body of a drum). Metal's tight bandpass simulates the
specific modal resonance of a small bell. The water sweep follows how liquid absorbs high frequencies
faster than low. Earth's 72Hz is below the range children consciously track as "pitch" — they feel
it more than hear it. Glass's 2440Hz is the frequency range where crystal and glass actually vibrate.

## Interactions

- **Tap**: single hit
- **Hold**: rapid-fire roll at 80ms intervals (12.5 Hz = sounds like a drumroll or trill)
- **Two fingers simultaneously**: accent hit — 1.35× volume + full-screen color flash

The first tap on any zone initializes the AudioContext (Web Audio API requires user gesture).
No permissions required — all synthesis is pure Web Audio.

## Visual textures

Each zone renders its own pattern in the background, visible before any tap:
- **Wood**: wavy horizontal grain lines (static, evokes wood grain)
- **Metal**: diagonal hatch lines (evokes metallic crosshatch)
- **Water**: animated sine waves (evokes rippling water surface)
- **Earth**: stippled dot field (evokes soil texture)
- **Glass**: sparse sparkle crosses (evokes crystalline highlights)

All textures use deterministic positions (seeded from zone index) — no per-frame allocation.
Water waves update with `elapsed * 0.0017` — a slow drift visible but not distracting.

## What children discover

1. **Tap a zone → immediate feedback** — sound + expanding ripple ring ≤16ms after tap. No delay.
2. **Wood is lower/duller than Glass** — the most obvious contrast, discovered in 1 tap each.
3. **Hold a zone → rolling sound** — the rapid-fire creates a "brrrr" or trill that kids find exciting.
4. **Two fingers together → bright flash** — a discovered surprise: bigger input = visual reward.
5. **Earth is felt, not heard** — 72Hz is at the edge of speaker range on phones; kids notice it differently.

## Why timbre is new

Prior kids prototypes teach pitch (C3 vs C5 is "low vs. high") via color and position.
This prototype teaches **timbre** — that the same "tap" gesture produces qualitatively different sounds
depending on the material, not just different pitches. This is the difference between piano and drums,
guitar and flute, voice and cello. All notes can be "C3" but each instrument sounds completely distinct.

A child who plays all five zones from left to right for the first time is discovering instrumental timbre
without any reading, theory, or instruction — just ears and fingers.

## Connection to Karel's loves

- `98-kids-drum-circle` ❤️ — rhythm + tapping as primary interaction
- `105-pluck-field` ❤️ — physical modeling synthesis (this prototype's water and wood use similar principles)
- `158-kids-hum-paint` ❤️ — voice as instrument (here, materials as instruments — same "non-note" paradigm)

## Polish ideas for future cycles

- Add a fifth interaction: double-tap for a special "resonance ring" sound per material (the room itself vibrates)
- Haptic feedback pattern per material (when Haptic Engine API ships on iOS)
- "Teach mode": long-press a zone to see a short physics explanation animation (waves for water, grain for wood)
- Second timbre: toggle between "dry tap" (current) and "wet reverb" version per zone
- Free-compose mode: record a sequence of zone taps and loop it (extends `172-loop-station` paradigm to kids)
