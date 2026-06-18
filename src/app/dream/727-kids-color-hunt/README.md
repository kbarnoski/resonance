**For**: kids (4+)

Point the tablet at the colors in your room and paint music with what you see — red things sing warm and low, sky-blue shimmers bright and high — as a luminous particle bloom takes the room's color and a soft consonant chord follows along.

## How to play

1. Tap **Start the hunt** (this unlocks audio and asks for the rear camera, inside the tap — required on iOS).
2. Point the center reticle at any colored object — a red toy, a green plant, a blue cup.
3. Listen and watch: the bloom fills with that color, and a gentle chord answers.
   - **Red / orange** → warm, low, open chords.
   - **Green** → settled mid-register.
   - **Sky-blue / cyan / violet** → bright, high, shimmering sparkle.
   - **More colorful** (saturated) → more particles, more energy.
   - **Brighter** → louder and a wider, more open bloom.
4. No camera? No problem — Color Hunt slowly cycles a palette of colors on its own, blooming and singing with zero input. There are no wrong notes and nothing to fail.

The camera is **analysis-only**: each frame we draw the video into a tiny 96×72 offscreen canvas and average the RGB of the center region. Nothing is ever recorded, stored, or sent — only the averaged color of the reticle is ever read.

## How it works (subsystems)

1. **Camera color-sampler** — averages the center-region RGB of the live rear-camera feed → HSV (hue / saturation / brightness), eased frame-to-frame for smooth transitions.
2. **Cross-modal color → harmony engine** — hue selects a consonant C-major-pentatonic voicing whose register climbs warm-low → mid → bright-high; saturation sets presence, brightness sets loudness + attack. Re-voices only when the color shifts or every ~2.2s, so it is a slow evolving texture (never a loop or a beat).
3. **WebGPU compute-shader particle bloom** — 12,288 particles spring around a glowing ring whose radius opens with brightness and whose swirl energizes with saturation; each particle's hue eases toward the sampled hue. First-class **Canvas2D fallback** reproduces the identical physics when WebGPU is unavailable.
4. **Always-on soft ambient bed + ghost auto-demo** — a quiet low drone means it never feels broken; on camera-deny or idle a scripted ghost slowly walks the hue wheel so it paints and sings with zero permissions.

Kids-safe sound: master gain 0.3, lowpass 7.5 kHz, compressor −10 dB / 20:1, slow attacks, no sudden loud transients. Full teardown on unmount (camera tracks stopped, WebGPU device/buffers destroyed, AudioContext closed, rAF cancelled).

## Named references

- **Alexander Scriabin — *clavier à lumières*** and **Wassily Kandinsky — color-tone theory**: the historical claim that a color *is* a tone color, that hue maps to pitch/register and warmth maps to consonance. Color Hunt is a literal, playable instrument built on that synesthetic mapping.
- **Refik Anadol — luminous particle fields**: the aesthetic target for the WebGPU bloom — a dense, breathing field of light that takes on the color it is fed.

## Ambition note

Targets ambition **#2** (≥3 integrated subsystems: camera color-sampler + cross-modal color→harmony engine + WebGPU compute particle bloom with Canvas2D fallback + always-on ambient bed) and **#3** (named references above).

It does **not** claim ambition #1 (first camera-color-sampling input): a grep of the lab shows `317-kids-color-bells` already pioneered camera center-region color sampling as an input modality. Color Hunt deepens that lineage instead — moving from Canvas2D bells to a WebGPU compute particle bloom, swapping single-note bells for a register-climbing cross-modal *chord* engine, and shifting the emotional register from playful to wonder/discovery.
