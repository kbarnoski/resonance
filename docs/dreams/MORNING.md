# Morning digest — last updated 2026-07-02 (~06:20 UTC, cycle 630)

> **The one thing this fire did:** it *grew* a hallucination instead of painting one.
> `1098-cortical-bloom` runs a WebGPU compute shader simulating a sheet of excitable
> neurons; tuned near instability the field self-organizes into stripes and hexagons,
> and — because the retina→cortex map is a complex logarithm — those read out on
> screen as **spirals, tunnels and honeycomb lattices**: the actual Ermentrout–Cowan
> neuroscience of *why* psychedelic geometry looks the way it does. It's the lab's
> second-ever WebGPU-compute piece and its first neural-field.

## Open this first
- **[1098-cortical-bloom](https://getresonance.vercel.app/dream/1098-cortical-bloom)** — *watch tunnels and honeycomb bloom out of a simulated cortex, and tap to seed a new one.* A Gray-Scott / Wilson–Cowan neural field on the GPU, read out through the retino-cortical log-polar map so cortical stripes become spirals/tunnels and hexagons become an expanding honeycomb. It drifts through the four Klüver form constants on its own (~30s); tap to seed a fresh nucleus with an audible bloom; arrow keys / slider push it toward the lattice or tunnel pole; field statistics drive a just-intonation drone. `state: DMT/psilocybin geometric form-constant emergence · pole: intense-hypnotic`. **30-second morning check: open it, let it drift, tap the field once.**

## Why this one, and why now
A WIDE fire — 3 parallel builders across 3 different output targets, ship the strongest. **Cortical Bloom won** over `1097-resonant-drift` (a raw-WebGL2 resonant corridor) and `1099-third-sound` (an audio-first ear-generated-tone drone) because it (1) directly cashes the 2026-07-01 jury's loudest standing note — *"prove the render target can change → WebGPU-compute, you have exactly ONE"* — making it the lab's second; (2) implements the PSYCHEDELIC direction's single most load-bearing mechanism (the form-constant engine) as **real cortical dynamics**, not a decorative warp; (3) degrades WebGPU→Canvas2D so it's never blank/silent; (4) swings to an intense-hypnotic pole off the recent cosmic-ambient runs. Today's research seeded it (RESEARCH §630).

## Also explored (banked — see IDEAS §630)
- **⭐ `1097-resonant-drift`** — the space IS the instrument: drift through a corridor whose cavity radius drives a live convolution reverb + a modal "tube singer," so a narrow throat pinches the drone and a chamber blooms it. Build-complete, ready-as-is, and the **closest to your loved `148-spatial-palette`** — top resurrect. Say the word and I ship it next.
- **`1099-third-sound`** — two pure sines make your *ear* manufacture a third tone that isn't in the air (Tartini / Dream House); a "reveal the phantom" A/B lets you confirm you heard true. Audio-first, meditative.

## Honest caveats
- **Built green (for shipping).** Winner-only `npm run build` → compile + ESLint + full-project type-check all PASS (0 output from the 1098 folder; `tsc --noEmit` exit 0; scoped `eslint` exit 0). Only the standing container static-gen `EMFILE` (~4096-fd ceiling, every cycle since ~472) stops a full green. Vercel-safe.
- **Verification honesty:** the WGSL compute sim is a **GPU-device-only path** — code-verified (buffer alignments, ping-pong ordering, reduction barriers reasoned through), but not run on a GPU in this headless box. A complete independent Canvas2D fallback (CPU value-noise cortical field through the same log-polar map, same audio feed) guarantees it's never blank or silent — so the glance always shows *something*, but the headline GPU path wants your real hardware.

## Open questions for Karel
- **Does the honeycomb/spiral actually bloom on your machine?** WebGPU should be live in your desktop Chrome/Safari — worth 30s to see the real compute path vs the fallback.
- **Ship `1097-resonant-drift` next?** It's your spatial-love lane, build-complete, and would rest WebGPU for a fire. One word and it's the next ship.
- **Still open (needs you):** raise the container's ~4096-fd ceiling (or bless `next build --experimental-build-mode compile`) so full builds finish locally and the GPU/audio pieces finally get hardware-verified — the standing #1 verification debt.
