# Morning digest — last updated 2026-06-29 (cycle 592 · ADULT · WIDE · **first psychedelic cycle**)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday — the altered-states direction is live
- **[1038-form-constant](https://getresonance.vercel.app/dream/1038-form-constant)** — **play music or just speak into the mic and watch your visual cortex's own hallucinated geometry bloom: tunnels, spirals, funnels, honeycomb.** This is the lab's **first build under your psychedelic steer**, and I deliberately opened the direction with its **single most load-bearing finding**: the **log-polar / form-constant engine** (Bressloff–Cowan / Klüver — all hallucinated geometry is one stripe/hex pattern seen through an `exp()` warp). The shader computes true cortical `(log r, θ)` coords and one `formMix` knob sweeps continuously through all four Klüver form constants; mic FFT drives it (bass→flow, mids→form-morph & kaleidoscope bloom, highs→detail, loudness→saturation), and a ~5-min entropy arc (entropic-brain/REBUS) makes minute-5 ≠ minute-1. **Why open it:** every later psychedelic piece can stand on this engine — it's the foundation, not a one-off. Grep-verified lab-first technique. Mic primary; falls back to a self-playing Shepard–Risset drone so it always sounds. **No strobe** (continuous warp, not flicker).

## Explored but not shipped (2 more — banked in IDEAS §592, both ready to resurrect)
- **1039-light-tunnel** ⭐ — the **cosmic-ambient** counterpart: a raymarched **NDE wormhole** falling toward a growing being-of-light, hypoxic vignette, a one-time gamma "clarity snap," and a vast convolution-void drone with time-dilation. The natural next ship to balance 1038's intensity.
- **1040-ganzfeld-bloom** ⭐ — the **meditative** pole: an empty Ganzfeld field, a breath-paced mandala (~5.5 breaths/min), Shepard ascent — and it carries the **safe-flicker engine** (opt-in, ≤3 Hz hard-capped, instant-kill) the whole direction needs for the Dreamachine-style work.

## Honest notes
- Build passed (compile + ESLint + type-check clean; one typo fixed during validation). Static-gen still blocked only by the container's fd ceiling — infra, not code; Vercel deploys past it as every cycle.
- **Seen/heard nothing on real hardware.** Psychedelic pieces are *especially* GPU- and perception-dependent — whether the form constants actually read as "trippy" on a real GPU genuinely needs your eyes. This is now the highest-value gap.
- Two foundations were laid this fire even though only one shipped: the **log-polar engine** (in 1038) and the **safe-flicker engine** (in banked 1040). Next I want to promote both into `_shared/` so the rest of the direction composes fast.

## Open question for Karel
- Which pole should I deepen next — the **intense** lane (extend 1038: 4D raymarch, hyperbolic tiling, your Path piano as the carrier) or the **cosmic-ambient** lane (resurrect 1039 the NDE tunnel / 1040 the meditative Ganzfeld)? And: worth a one-pass hand-verify of 1038 on real hardware so we finally *see* a psychedelic build?
