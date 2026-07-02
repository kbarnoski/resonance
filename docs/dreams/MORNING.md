# Morning digest — last updated 2026-07-02 (~02:20 UTC, cycle 628)

> **The one thing this fire did:** it built a **real instrument, not a visualizer.**
> `1095-plate-modes` solves the 2D wave equation on the GPU — a genuine vibrating
> plate — and the glowing Chladni nodal lines you SEE and the modal chord you HEAR
> are two read-outs of the *same* physics. Tap it and it rings. It's the honest-
> instrument virtue the jury loves (it called `1065-skin-membrane` "the most honest
> instrument in the lab"), now on a 2D plate — and it breaks the recent cosmic-ambient
> run with an intense, hypnotic cymatic trance.

## Open this first
- **[1095-plate-modes](https://getresonance.vercel.app/dream/1095-plate-modes)** — *tap a vibrating plate and watch the exact standing-wave patterns you're hearing form in real time.* A GPU finite-difference wave equation (ping-pong float textures) rings up square-plate modes; nodes glow incandescent cyan/white as luminous "sand lines," antinodes wash amber. A slowly-swept driver keeps it alive with no input; each tap injects an impulse. The honest part: every frame the field is read back and projected onto the plate's own eigenmodes, and those amplitudes drive one resonant voice per mode — so you hear the exact modes whose nodal lines you see, and the chord shifts as the driver climbs. `state: cymatic trance · pole: intense-hypnotic`.

## Why this one, and why now
A WIDE fire — 3 parallel builders, 3 unrelated altered-states. All three were complete, clean, and dodged every diversity ban; I shipped the highest-integrity one. **Plate Modes won on** (1) *physical honesty* — sound and image are one wave-equation solve, not a decorated song; (2) *ambition* — a real GPU PDE solver + eigenmode read-back + modal audio + tap = ≥3 genuine subsystems, and a fresh technique vs the old FFT-driven cymatics; (3) *pole diversity* — intense-hypnotic breaks the cosmic-ambient run. Today's research seeded all three (RESEARCH §628: Sonic4D spatial audio, June 2026, + the ASTRODITHER dither revival).

## Also explored (banked — see IDEAS §628)
- **⭐ `1093-resonant-drift`** — a raymarched morphing corridor where the *geometry drives the reverb*: a throat chokes the drone into a singing tube, a chamber blooms into a cathedral tail. Sonic4D-grounded, most research-fresh, and closest to your spatial loves. **Top resurrect — it's ready to ship as-is.**
- **`1094-dither-veil`** — ordered (Bayer) dithering revived as a live, mic-driven psychedelic surface: boiling 1-bit closed-eye grain. A genuinely new aesthetic for the lab; resurrect paired with a meatier substrate.

## Honest caveats
- **Built green (for shipping).** Winner-only `npm run build` → compile + ESLint + full-project type-check all PASS (reached `Collecting page data`; slug grep in errors = **0**; scoped `eslint` = exit 0). Only the standing container static-gen infra failure (`EMFILE` on the font manifest — the ~4096 fd-ceiling, every cycle since ~472) stops a full green. Vercel-safe.
- **Verification honesty:** the FDTD scheme is numerically stable by construction (CFL bound + NaN guard), but the headline GPU float-texture sim + audio read-back are **GPU-device-only** — code-verified, not run in this box (no GPU / `EXT_color_buffer_float`). There's a driver-derived audio fallback so it's never silent. **Needs your ears + a real GPU** to confirm the plate actually sings the modes it draws.

## Open questions for Karel
- **Does the plate sing what it draws?** The whole pitch is that the audio is the *same* field as the visual — worth 30s on real hardware to confirm the modal chord tracks the nodal figure.
- **Ship `1093-resonant-drift` next?** It's built and ready; the "space is the instrument" reverb is the freshest idea in the batch. Say the word and I'll cash it.
- **Still open (needs you):** raise the container's ~4096 fd-ceiling (or bless `next build --experimental-build-mode compile`) so full builds finish locally and GPU pieces finally get hardware-verified — the standing #1 verification debt, now 9+ juries running.
