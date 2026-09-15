# 17232-tunesignal — Tune the Signal

Karel's real piano take is rendered as a stark achromatic 1-bit ordered-dither signal field that resolves out of pure static only when you physically tune your body toward a sweet-spot orientation.

**Status:** demoable

## The interaction

At rest the whole viewport is dense high-contrast static — a Bayer 8×8 ordered-dither field with a randomized threshold and a scrambled log-polar warp, so there is no legible image, just grain. Your **live body is the tuning instrument**:

- **On a phone:** tilt to hunt the sweet spot. DeviceOrientation (`beta`/`gamma`) is mapped to a deviation from a hidden target hold (comfortable forward tilt, level left-to-right). On iOS the primary action requests `DeviceOrientationEvent.requestPermission()`.
- **On desktop (or if tilt is declined/absent):** drag on the field. The pointer position maps to the same deviation, with a full pointer-drag fallback.

A smoothed **focus** value in `[0,1]` measures how close you are. As focus rises, the log-polar warp unwinds and the dither threshold cross-fades from random noise to the ordered Bayer matrix — so the static resolves into a coherent **radial standing-wave figure** that reads the music. Off-axis is noise; on-axis snaps into clarity, a thin frame appears, and the readout shows **SIGNAL LOCKED**. The take's lowpass also opens with focus, so the piece clears up audibly as well as visually. A live tilt/pointer readout and a focus meter guide the hunt.

## The four subsystems

1. **Catalog loader/decoder** — fetches and decodes one of Karel's verified takes (Welcome Home / Snowflake) into a looped `AudioBuffer` via `loadRealTrackBuffer`. Real catalog audio only; a load failure shows an on-brand error, never a synth.
2. **Audio analyser bus** — every path terminates in `createSafeMaster`; a focus-driven lowpass sits before the master. `master.analyser` supplies 128 FFT-magnitude bins plus a waveform, uploaded to two 1-D R8 textures each frame, and an overall RMS level.
3. **Body-tuning input** — DeviceOrientation tilt (primary on phones) or pointer-drag fallback, each mapped to a deviation from a deliberately non-centred sweet spot, converted to a smoothly-eased focus.
4. **GPU signal renderer** — a single-pass WebGL2 fragment shader: Bayer 8×8 ordered dither + a log-polar warp; per-pixel static is blended into the resolved figure (concentric rings = spectrum, angular petals = waveform) as focus rises. Strictly achromatic 1-bit black↔white.

## References

- **Robert Borghesi — "ASTRODITHER"** (2026): a WebGPU/TSL audio-reactive dither aesthetic where the signal itself, resolved through dithering, is the image.
- **Ryoji Ikeda** (data/signal work): test-pattern austerity and the treatment of raw signal-noise as the subject rather than a texture.

## Tags

- **Input:** device-orientation / tilt (`beta`/`gamma`) with a full pointer-drag fallback — a live body, non-multi-user.
- **Output:** WebGL2 fragment shader (full-screen quad, not Canvas2D).
- **Technique:** ordered-dithering / signal-resolution as the subject (not memory, not chord/harmony).
- **Palette:** achromatic 1-bit black↔white — a deliberately neutral third temperature, no warm ambers, no violet in the art layer. Violet (`text-primary`) appears only on tiny UI chrome.

## Degradation

- No WebGL2 → on-brand notice; the take keeps playing.
- Tilt declined or unavailable → pointer-drag works fully.
- Audio load fail → `text-destructive` message, never a synthesized stand-in.
