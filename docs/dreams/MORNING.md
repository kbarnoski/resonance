# Morning digest — last updated 2026-06-28 (cycle 584)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — Cycle 584 (KIDS · WIDE, 3 explorers, shipped 1)
- **`1015-kids-ink-garden` — drop a fingertip of magic ink and watch living Turing-pattern spots GROW and split across the screen by themselves; the more it blooms, the fuller the music gets.** A 4-year-old just taps anywhere — glowing ink seeds a real **GPU reaction-diffusion field** that spreads on its own, and the pattern's growth swells a warm I–vi–IV–V chord bed and fires soft bells where new spots form. **Why open this:** it's the directest answer to the jury's most-repeated ask — *"WebGPU/GPU-compute collapsed 6×→1×; make the simulation the resonating BODY, not a 2D plot."* Here the **simulation itself is the instrument**, on the kids lane. Zero permissions — pure touch, works instantly on your phone; do nothing and it seeds itself.
- ✅ **Verified for once:** 13 headless unit tests pass on the Gray-Scott + sonification math. ⚠️ **Not heard:** no audio/GPU in my box, so the bed/bell balance and the live float-texture bloom on a real GPU are reasoned, not heard — a 20s touch on your phone settles it (Canvas2D CPU fallback + always-on pad keep it sounding regardless).

## Also explored this fire (built complete, banked — not shipped)
- **`1014-kids-breath-flute`** ⭐ — **blow or hum into the tablet and a glowing air-column actually sings** — the lab's **first-ever wind instrument**: a real jet-drive waveguide flute (Cook/Smith STK), breath = the air pressure, tap big recorder-holes for pitch. Shipped with a passing headless tuning test (±57¢, no octave jumps). My pick to ship **next kids cycle** — it lost only because a flute needs the kid to blow into the mic (permission friction at 6:30).
- **`1016-kids-scarf-choir`** — **wave a scarf in front of the camera and conduct a glowing choir** — pure *motion* (optical flow), not body-shape, swells the harmony. Banked: camera permission + it'd be the 3rd recent camera build.

## Why this shape (WIDE, kids, GPU-compute)
- Jury #3 (three verdicts running): the lab over-renders flat 2D and the scarce capability is real GPU compute — *make the sim the body.* My kids diversity audit also **banned Canvas2D-primary output (6×), mic-pitch (969/972), tilt-ball physics (974/995), and pentatonic-no-wrong-notes.** So I went WIDE with three engines the lab under-uses — GPU reaction-diffusion, a waveguide flute, optical flow — each clearing the ambition floor with fresh tags. Today's research (the 2026 cs.SD frontier is *all* neural) → today's build (revive deterministic GPU simulation as the instrument).

## Open questions for Karel
- Ship **`1014-kids-breath-flute`** (blow-into-the-tablet waveguide flute) next kids cycle, or push deeper on the ink garden (1015) first?
- Still-open doc-debt: the RESEARCH.md dive paragraphs for cycles 579–582 were referenced but never appended (I've kept §583 + §584 clean). Want me to backfill 579–582 in a research lull?
