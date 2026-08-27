# Morning digest — last updated 2026-08-27T~13:00Z

> **You asked (jury 2026-08-26): get off the shader and off the camera.** The lab had quietly made the GPU generative field its default room — 7 of the last 15 pieces were a shader you watch, the last four in a row all a field — plus camera 4×, granular grain-triggering 6×, and both the warm and the cool-ink-on-bone palettes entrenched. This cycle rotated off **all four defaults at once**, in one fire. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[16160-roomtone](https://getresonance.vercel.app/dream/16160-roomtone)** — **your own recording becomes the room your other recording is played through.** A few raw seconds of one of your takes (*The Knife*) are loaded straight into a convolver as its impulse response — that recording *becomes* an acoustic space — and a second take (*Welcome Home*) is played *through* it. Convolution is cross-synthesis: the room-take's notes, resonance and decay literally reshape the voice-take. **Tilt your phone** (or drag, or just let it play) to morph the wet/dry blend; a hard forward tilt swaps which take is the room. The visual is a hand-drawn architectural **cross-section** — the impulse-response decay envelope is the vault ceiling, the voice-take threads through the chamber, the room-take is the bedrock — on a bright paper ground with a single magenta accent. **Why open it:** it's the exact move you asked for — off the shader (pure SVG, no fragment shader), off the camera (tilt), off grain-chopping (convolution — the *first* alternative you named), and a fresh light-ground palette that's neither the warm rut nor the cool-ink rut. And it's genuinely new to the lab: 57 protos use a convolver, but every one synthesizes a noise-burst reverb tail — none had ever fed one of your real recordings in as the room. Best with sound up; give the tilt a slow sweep.
  - *2 more built + banked (IDEAS §1201) — the other two non-grain audio techniques:* **fold** (walk a three.js room with a gamepad; your position between two glowing pillars morphs *between two of your takes in the frequency domain* — a real STFT spectral fusion) and **braid** (four of your full takes weave at once as a living SVG score; your **voice** conducts which strand leads — mic control-only, you only ever hear you). Either ships next on one word.

## In progress / partial
- Nothing mid-build. Three parallel builders ran (WIDE ×3, one rested lane each). Winner shipped; the two runners-up are built, clean, and banked ready.

## Research findings worth a look
- **Nugen Audio *Paragon*** (2026) — billed the "world's first 3D-compatible convolution reverb," re-synthesising reverb from *3D recordings of real acoustic spaces*. The current-year signal that the convolution frontier is *sampling a real space as the instrument* — which is exactly what roomtone does, except the "space" is one of your own performances. (Corroborated by the classic "convolution IS cross-synthesis" framing + DCASE 2026's spatial-IR challenge.)

## Open questions for Karel
- **Does it read as a room?** The one thing I can't verify headless (no speakers): do two dense piano takes convolved sound like one played *inside* the other — or like mud? And does the level stay musical under the makeup-gain + limiter? A minute in-browser with the tilt tells us.
- **Which sibling next** — **fold** (walk between two takes, spectral morph, gamepad + 3D room) or **braid** (voice conducts a weave of four full takes)? Both are built and clean; say the word.
- Still standing: the other honest 5/5 path is extending **`15824-canon`** — but its natural cycle-2 is *grain*-based, so I held it while grains were the banned technique this cycle. Happy to take it up next.
