# Concept Jury Verdict — 2026-06-23 (UTC)

## Summary
This is the most *responsive* window the lab has had — for once it did almost
exactly what the last jury asked. Canvas2D crashed 7→2 (the wall broke a third
time), the pose-driven spatial-audio room got built fresh (`869`), a kid was
finally given the freedom to be wrong (`868`), and the `820` feedback-ecology
thread was developed — twice. The catch is the catch it always is: every fix
grew a new rut. **WebGL2 is the new 6-of-15 monoculture**, the real-world-data
lane already shipped a clone (`842`→`864`), and the depth thread advanced by
re-rendering itself rather than adding a capability. Good window. Watch the new
walls.

## Diversity audit
- **Over-represented input: none — inputs are genuinely spread (the headline
  win).** No single value hits 4×. mic/voice 2× (841, 846), external-data 2×
  (842, 864), no-input/autonomous 2× (847, 872), camera-tracking 3× (853 hands,
  862 hands, 869 pose), touch 2× (868, 874), plus tilt 1× (849), gamepad 1×
  (856), accelerometer 1× (866), audio-file 1× (859). Embodied/sensor inputs
  *exploded* — that's provocation #2 landing across the whole window, not one
  build. Depth-camera still 0×; MIDI only as a `868` bonus.
- **Over-represented output: WebGL2 6× (847, 853, 856, 864, 868, 874).** This is
  the headline. Canvas2D fell from 7→2 (842, 841) exactly as asked — and the
  field promptly re-walled itself on raw WebGL2. GPU surfaces are now 13-of-15
  (WebGL2 6×, three.js 4× [846, 849, 862, 872], WebGPU 3× [859, 866, 869]). The
  ask was *diversity*, not "GPU good, Canvas2D bad." We swapped one monoculture
  for another. SVG 0×, audio-only 0×.
- **Over-represented technique: none hits 4× — methods stay healthy and varied.**
  But two thematic pairs have hardened into templates: the **820 Lorenz-rewired
  feedback-resonator graph** ran back-to-back (847, 872 — near-identical concept,
  different renderer), and the **"external feed → roughness fouls the harmony"**
  data move ran twice (842 air, 864 marine — 864 reuses 842's exact inversion).
- **Over-represented vibe: kids 8× (structural — every-other rotation).** Inside
  it, the calm register *recovered* to 3 (849, 866, 874) from last window's 1 —
  provocation #4 landed. But the **no-wrong-notes / always-consonant safe-scale
  kids template still owns 6 of 8** (841, 846, 856, 862, 866, 874); only 868 and,
  partially, 849 let a child reach real dissonance.
- **BANNED for next cycle:** **raw WebGL2** (6× — the new wall; Canvas2D is now
  *scarce* at 2× and fair game again, SVG and audio-only are 0×) · **the
  "external feed → timbral roughness/fouling" data mapping** (used twice — map
  data to STRUCTURE next, not detune) · **the no-wrong-notes safe-scale kids
  loop** (still 6×; 868 proved the alternative works) · **a third renderer-only
  pass on the 847/872 feedback-Lorenz thread** (it must add a capability or
  close).

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — the floor holds for the sixth window running. Even
  the thinnest build clears #2 (≥3 subsystems) + #3 (named reference).
- **Hit 2–3 criteria: 11** — 2/5: 849, 862, 864, 868 · 3/5: 841, 842, 853, 856,
  859, 866, 874. The fat comfortable middle.
- **Hit 4–5 criteria: 4 — and all four are NET-NEW: `846` (emergent
  phyllotaxis), `847` and `872` (the developed 820 thread), `869` (the pose-walk
  spatial room).** The depth bench doubled from 2→4 versus last window, and
  unlike last time it is *not* holding by carryover — every 4/5 here is fresh.
  That is the single best structural signal in this verdict. Caveat: two of the
  four (847, 872) are the *same* concept, so the true count of distinct
  high-ambition ideas is 3, not 4. Still up. Note: **criterion #5 (cite a
  RESEARCH.md finding from the last 14 days, in the README) is 0-for-15** — for
  the fifth straight window. See provocation #5.

## Standouts (positive)
- **869-spatial-grove**: the build of the window. The pose-driven spatial-audio
  room this jury asked for *three times* — finally built, and built *fresh*
  (physically walk through 16 HRTF song-trees on WebGPU compute), not a re-skin
  of the `853` motet. Body→listener-navigation over a fixed field, per-tree
  long-form drift. 4/5, and the directest answer to a standing ask in the lab's
  history.
- **868-kids-monster-keys**: the freedom-to-be-WRONG piece, and the crack in the
  kids template. All 12 chromatic notes are playable; a dissonant clash spawns a
  wobbly monster, and you *earn* the calm by adding a consonant note. Real
  harmonic stakes with a path back — exactly provocation #3, delivered clean.
- **846-kids-sing-garden**: a 4/5 with a genuinely novel engine — the sunflower
  spiral *self-organizes* via emergent phyllotaxis (largest-angular-gap +
  inhibition), not a hardcoded Vogel formula. Voice seeds it; it fills itself in.
  The rare kids build whose technique is the frontier, not the wrapper.
- **847 + 872 (the 820 feedback-ecology thread)**: the depth bench. `820`'s
  coupled resonators now have their *topology continuously rewired by a Lorenz
  attractor* — the system never repeats. This is "develop what you have" done
  right at the concept level (celebrated), with one reservation in pruning below.
- **859-paths-compute-bloom**: 500k particles advected on a WebGPU compute shader
  by his actual piano (audio-file input, Anadol/curl-noise lineage). The
  GPU-compute scale the lab keeps gesturing at, finally at full size.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **864-marine-gamelan**: 2/5, and a clone of `842-air-veil`'s signature move —
  external feed → "roughness fouls the harmony." The freshest lane in the lab
  (real-world data) became a template *within a single window*. The bronze
  gamelan dressing is lovely, but the data→sound inversion is already spent.
  Missing: a fresh mapping (data → form/tempo/voicing), not detune again.
- **862-kids-solfege-signs**: 2/5. Spends MediaPipe hand-tracking — the most
  ambitious input available — on the safest possible musical idea (diatonic
  call-and-response, no wrong note reachable). This is the `811` critique exactly:
  frontier input, local-minimum music. Beautiful pedagogy, zero risk.
- **849-kids-star-bowl**: 2/5. Credit for reaching toward dissonance — but it
  *auto-resolves* on a glide. The child doesn't decide to resolve; the system
  does it for them. A gentler form of the cosmetic-agency rut. `868` shows the
  fix: make the child earn the resolution.
- **847 vs 872 (the deepening thread)**: develop-what-you-have taken a touch too
  literally — two consecutive cycles ship the Lorenz-rewired resonator graph in
  near-identical form, distinguished mainly by renderer (WebGL2 vs three.js). One
  is the genuine cycle-2 advance; the second re-presents it. Not a wasted build,
  but a warning: "deepen" must not collapse into "re-render."

## Provocations for tomorrow's dream cycle
1. **WebGL2 is the new Canvas2D — 6-of-15. Ban it for a week.** You broke the
   Canvas2D wall (7→2, a real and hard-won win) and instantly built a WebGL2
   wall. The goal was never a surface hierarchy — it was diversity. Canvas2D is
   now *scarce* (2×) and legitimate again; SVG and audio-only are 0×. Make the
   next 3–4 builds deliberately non-WebGL2.
2. **The 847/872 feedback-Lorenz thread needs a CAPABILITY in cycle 4, or close
   it.** Two cycles of "Lorenz rewires a resonator graph" on two renderers is
   develop-what-you-have stalling out. Cycle 4 must add something the prior two
   can't do: record/export the evolving drone, a second coupled system that
   *listens* to the first, live mic-perturbation that actually steers the
   topology. A third renderer is not a cycle.
3. **The real-world-data lane already cloned itself — kill the roughness
   inversion.** `842`→`864` both map an external feed to "pollution/sea-state
   fouls the harmony." Used twice in one window; retire it. The next data piece
   must sonify *structure* — let the feed decide tempo, form, or who-plays-when
   (transit headways → rhythmic phrasing; seismic → arc shape; language-usage
   trends → which voices enter). Data about something, not data as detune.
4. **You cracked the kids template — now widen the crack.** `868` (monster-keys)
   and `849` (star-bowl) finally let a child near dissonance; that's the win of
   the window. But 6 of 8 kids builds are still no-wrong-notes. Next kids piece:
   let the wrong choice *persist and matter* — no auto-resolve like `849` — the
   way `868` makes the child earn the calm. Build the third one and the template
   is broken for good.
5. **Criterion #5 is 0-for-15 for the fifth window — fix it or retire it.** Every
   STATE entry proudly draws a research→build chain, but it never lands in the
   *prototype's own README* as a dated RESEARCH.md citation, which is the only
   place the ambition floor can see it. Either start citing the dated finding in
   the README (cheap — the chain already exists in STATE), or admit #5 is a dead
   criterion nobody scores and drop it from the floor. A floor rule that's never
   hit isn't a floor; it's decoration.

## Karel-facing line
Your most obedient window yet — you broke the Canvas2D wall, built the spatial
room I asked for three times, and finally let a kid play a wrong note — but every
fix grew a new rut: WebGL2 is the new 6-of-15 monoculture and the data lane
already has a clone; the depth bench (846, 847, 869, 872) is the real, net-new
win to protect.
