**For**: kids (4+)

# Paint Mixer

**Drag glowing paint blobs around a canvas, mix their colors like real paint, and hear the mixed color played as a living chord — a warm orange sounds bright and major; a blue-purple goes tender and minor; a green opens into a suspended, airy harmony.**

---

## How It Works

Three paint blobs — magenta-red, yellow, and blue/cyan — float on a bright paper canvas. The child drags them together. Where they overlap, the colors mix **subtractively** like real paint pigments (not RGB light): blue + yellow makes green, red + yellow makes orange, red + blue makes purple. The mixed color under the combined blob centres is sampled each frame via WebGL2 `readPixels`, converted to HSV, and mapped live to a chord voicing heard through Web Audio.

A soft pad holding C + G always sounds, so nothing is ever silent or "wrong". The hue of the mixed color continuously shapes the chord quality:

- **Warm (red → orange → gold, ~0–60°)** → bright major / add9 (E and D over C+G)
- **Green / teal (~90–180°)** → open suspended (F over C+G — airy, no 3rd)
- **Cool blue → violet (~200–290°)** → tender minor (Eb over C+G)
- **Magenta / pink (wrapping ~300–360°)** → dreamy maj7 / add9 (B over C+G)

Saturation drives voicing richness (vivid = full chord; pastel = soft dyad). All chord changes glide via `setTargetAtTime` — no clicks, no abrupt jumps.

---

## The Kubelka-Munk Technique

Standard RGB mixing (additive / screen blend) is wrong for paint: it makes blue + yellow → grey-cyan and everything dark muddy. **Kubelka-Munk** models each pigment as an absorption (K) and scattering (S) spectrum across 36 wavelength samples (380–730 nm, 10 nm steps).

Mixing is done in K/S space — a linear blend of K/S spectra by weight — then converted back to reflectance via the KM quadratic `R = 1 + K/S − √(K/S² + 2·K/S)`, integrated against the CIE 1931 colour-matching functions to produce XYZ, then converted to sRGB. This is re-implemented inline in both the GLSL fragment shader (`gl.ts` FRAG_SRC) and in the TypeScript CPU module (`pigment.ts`).

This approach is directly derived from **Spectral.js** by rvanwijnen (MIT license) and the theory in **Mixbox** / "Practical Pigment Mixing for Digital Painting" (Sochorová & Jamriška, SIGGRAPH Asia 2021). No npm dependency is added — the spectral mixing is self-contained in this folder.

The fragment shader runs K/S mixing **per pixel** for every frame, so the on-screen mixed color is exactly what `readPixels` samples and what drives the chord.

---

## Architecture

| File | Role |
|------|------|
| `page.tsx` | React component: canvas setup, pointer drag, rAF loop, Start button |
| `gl.ts` | Raw WebGL2: GLSL fragment shader with K-M mixing per pixel; `readPixels` sampler |
| `audio.ts` | Web Audio: persistent oscillator voices with smooth gain glide, C+G pad |
| `pigment.ts` | CPU-side K-M mixing (for reference / fallback color sampling) |

**Audio chain:** oscillators → per-voice gain → colour filter (BiquadFilter lowpass) → masterGain (0.27) → lowpass (7 kHz) → DynamicsCompressor (−10 dB, ratio 20) → destination.

---

## Graceful Degradation

- **No WebGL2**: falls back to CSS `mix-blend-mode: multiply` blobs on a Canvas 2D element; color is sampled via `getImageData` on the CPU instead of `readPixels`. A `text-rose-300` notice is shown.
- **No Web Audio**: visuals continue; a `text-rose-300` notice is shown.
- **No interaction for 1.5 s**: blobs auto-drift on a slow sinusoidal path so the phone always shows a living, painting, singing canvas.
- NEVER a blank screen.

---

## Named References

- **Isaac Newton** — first proposed a 7-colour wheel mapped to the 7 musical notes of the diatonic scale (*Opticks*, 1704); the earliest colour-music correspondence.
- **Alexander Scriabin** — composed *Prometheus: The Poem of Fire* (1910) for orchestra + *clavier à lumières* (colour-organ), mapping specific pitches to specific colours; the most famous attempt to unify colour and harmony.
- **Mixbox** / **"Practical Pigment Mixing for Digital Painting"** — Sochorová & Jamriška, SIGGRAPH Asia 2021 — the authoritative practical Kubelka-Munk approach for digital paint. The K/S spectral mixing in this prototype is modelled on this work.
- **Spectral.js** — rvanwijnen, GitHub (MIT) — a compact JavaScript implementation of K-M spectral mixing that informed the inline GLSL and TypeScript implementations here.
- *(Optional)* **Synesthesia "AURA" mode (2026)** — captures a real-time colour field from a camera and maps it to a multi-voice chord — conceptually close to the readPixels → chord pipeline used here.
