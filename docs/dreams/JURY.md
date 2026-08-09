# Concept Jury Verdict — 2026-08-09

## Summary
The ambition *floor* is genuinely holding: across the last 15, **zero** builds are
local-minimum filler — every one clears two-plus criteria, most cite a named reference
and a same-day research finding, and the honest grep-0 verbs keep coming (tensegrity,
Minnaert plink, room eigenmodes, mass-interaction luthier). That is real, and two of
them — `8728-luthier` and `8488-secondear` — are the best things the lab has shipped in
weeks. The catch is subtler and more dangerous than the old pentatonic-canvas rut,
*because* every piece is legitimately ambitious: the lab has collapsed into a **physics-
simulation-instrument monoculture**. Nine of the last fifteen are "simulate a mechanical/
acoustic system, sonify its state, render it as clean geometry" — and the diversity gate
is being satisfied on the *surface* (rotate the input device, rotate the substrate) while
the *deep structure* is identical ~9 times running. Last jury killed three.js-violet; the
lab dutifully swung to raw-WebGL2-blueprint (5×) and Canvas2D-graphite (4×) — a new
uniform, not new range. One monoculture came down; a smarter-looking one went up.

## Diversity audit
- **Over-represented input: touch/pointer (6×)** — `8392`, `8488`, `8680`, `8728`, `8776`,
  `8952`. tilt 3× (`8616`, `8856`, `8904`), mic/voice 2× (`8312`, `8632`), keyboard 2×
  (`8440`, `8568`), camera-optical-flow 1× (`8360`), hand-tracking 1× (`8520`). Input is
  the *healthiest* axis — but it leans on the mouse.
- **Over-represented output: raw-WebGL2 hand-written GLSL (5×)** — `8568`, `8616`, `8632`,
  `8776`, `8952` — AND **Canvas2D (4×)** — `8488`, `8520`, `8680`, `8728`. three.js 2×
  (`8312`, `8392`), WebGPU 2× (`8360`, `8904`), inline-SVG 1× (`8440`), DOM/CSS 1×
  (`8856`). The lab over-corrected off the last ban into two new default substrates.
- **Over-represented technique: physical-modeling / physics-simulation-as-instrument
  (~9×)** — `8312` sympathetic coupling, `8616` nonlinear modal, `8680` Minnaert bubble,
  `8728` mass-interaction, `8776` eigenmode, `8856` pendulum/Doppler, `8904` mass-spring
  cloth, `8952` tensegrity, plus `8360` fluid. This is the real rut. FFT/particle-life/
  reaction-diffusion/raymarching/latent-walk/generative-model-call all **absent**.
- **Over-represented vibe: graphite / blueprint / clinical-instructional off-violet (~6×)**
  — `8440`, `8488`, `8520`, `8568`, `8776`, `8952`. Ordered off the violet-cosmic ban and
  now hardened into its own house look. cosmic-violet only 2× (`8360`, `8392`).
- **BANNED for next cycle:** touch/pointer input · raw-WebGL2 · Canvas2D · physics-
  simulation-as-instrument (mass-spring/Verlet/modal/eigenmode/fluid) · graphite-blueprint
  palette. Next build must avoid **all five**. That forces something like: mic/voice or
  MIDI or real-data/API or multi-user input → WebGPU-compute or inline-SVG or DOM/CSS or
  *audio-only* substrate → a generative-model-call / AI-pipeline / score-following / latent
  / real-data-sonification technique → a non-blueprint palette.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — no local-minimum builds this window. The floor gate is working.
- **Hit 2–3 criteria: 6** — `8360`, `8520`, `8616`, `8632`, `8776`, `8856`.
- **Hit 4–5 criteria: 9** — `8312`, `8392`, `8440`, `8488`, `8568`, `8680`, `8728`, `8904`,
  `8952`. These are the ones to *extend*, not repeat.

Note on the gate: the floor is being cleared handily, but criterion **#4 (multi-cycle
commitment) is never actually claimed** — everything ships one-and-done. And #1 (technique
never used) is now carried almost entirely by grep-0 *physical forms*, which is exactly how
the monoculture sneaks past the diversity gate: a fresh object, the same verb.

## Standouts (positive)
- **`8728-luthier`** — the best of the window. Sample-rate mass-interaction physical
  modelling in an AudioWorklet where **the picture you see vibrating IS the waveform you
  hear** — no separate synthesizer. CORDIS-ANIMA / Cadoz lineage, player *wires the
  instrument*, topology audibly = timbre. This is the player-authored-structure ask the
  last three juries hammered, finally answered without compromise.
- **`8488-secondear`** — conceptually the sharpest. Inverts aesthetic selection: the machine
  models *your* ear from a single keep/pass bit (online logistic regression, no ML lib) and
  composes toward it, with a visible "knows-your-ear" accuracy meter. Grep-0 verb, closes a
  standing jury ask verbatim, and courageously off-house graphite-ledger palette.
- **`8440-duetmind`** (honorable) — the only "play *with* a partner" piece; shows its plan a
  beat before it sounds (ReaLJam + Voyager). Closes the ~10-cycle "play WITH" gap and does
  it in the starved inline-SVG register.
- **`8856-pendulums`** (honorable) — substrate courage: a whole piece in **pure DOM/CSS**
  that reads on a muted phone, Doppler-wave-as-breathing-chorus. The rare non-GPU ship.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **`8776-roommode`** — the clearest local-minimum-of-*this*-window. Competent eigenmode
  math and honest grep-0, but it reads as a **physics demo, not an instrument**: the verb is
  "drag a slider and watch it retune." No authored artifact, no gesture with stakes.
- **`8632-nearfield`** — a good restoration idea, but it's the Nth raw-WebGL2 physics-
  sonification and the mic reduces to a single loudness scalar. Rhymes with `8616`/`8952`
  more than it distinguishes itself.
- **`8616-thundersheet`** — genuinely nice nonlinear-cascade audio, but as a *concept* it
  sits squarely inside the "drive a simulated material, hear it ring" cluster it shares with
  luthier, cloth, and tensegrity. The cluster is the problem, not the piece.

## Provocations for tomorrow's dream cycle
1. **Ban the sim-instrument for a week.** "Simulate a physical/acoustic system and sonify
   its state" has been the deep structure of ~9 of the last 15. It is no longer diversity to
   swap the object (spring → cloth → tensegrity → bubble) or the substrate (WebGL2 →
   Canvas2D). Do a cycle whose core technique is **not a physics simulation at all** —
   generative-model-call, latent walk, score-following, or real-data sonification.
2. **Build the AI-pipeline chain or strike it from the menu.** Music→image→video (needs
   `FAL_KEY`) has been flagged for ~31 cycles and is **still grep-0**. It is the single
   largest untouched category and the most direct way to break the physics rut. Thirty-one
   cycles of "standing yes/no" is not a decision — resolve it.
3. **Karel's *real* Path piano, finally.** The synthesis-journey (fuse 3 loved engines on
   his actual recording) keeps getting queued; `8392-longtide` half-delivered it with a
   *procedural* piano. Spend one DEEP cycle putting his real playing across an instrument —
   the standing directive with zero true delivery.
4. **Correct the substrate over-correction toward the empty end.** You didn't diversify off
   three.js-violet — you re-monocultured onto raw-WebGL2-blueprint (5×) + Canvas2D (4×). The
   genuinely thin substrates are **WebGPU-compute** (2×, and never as the *point*) and
   **non-screen / audio-only** (0×). Test the screen bias: ship an embedded/audio-only or
   WebGPU-compute piece next.
5. **Claim a multi-cycle build (criterion #4) for once.** Everything ships one-and-done.
   Take a 4–5-star piece from this window and commit to *deepening* it over 2–3 cycles:
   `8728-luthier` → save/share your wired instrument; `8488-secondear` → a taste model that
   remembers you across sessions. Extend a standout instead of minting the next grep-0 verb.

## Karel-facing line
The floor's holding and two builds are genuinely excellent (`luthier`, `secondear`) — but
the lab has quietly become a physics-simulation-in-blueprint monoculture, so today's order
is: ban the sim-instrument, and finally build (or kill) the AI-pipeline you've dodged for 31
cycles.
