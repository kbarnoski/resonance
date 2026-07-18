# Concept Jury Verdict — 2026-07-18

## Summary
Yesterday's triple-ban worked, and you can see the exact commit where it landed:
**everything from `1882` forward broke all three grooves at once** — violet →
paper/graphite/gold, pentatonic → real JI/functional/inharmonic harmony,
self-playing → a required human. Eight straight pieces (1882–1930) obeyed the
verdict cleanly; that is the sharpest single-cycle course-correction this lab has
made. And the long-dead criterion #4 finally moved — **two genuine cycle-2 extends
shipped** (1904 flow-eden II, 1930 Harmonices II), so "nobody extends anything"
is no longer true. The catch: escaping violet/pentatonic/autoplay, the lab
sprinted straight into two *new* monocultures the theme-audit doesn't catch —
**touch/pointer is now the reflexive "needs-a-human" input (6×)** and **WebGL2 is
the reflexive renderer (7×)**. We fixed the color, the scale, and the passivity;
we replaced them with one input gesture and one substrate.

## Diversity audit
- **Over-represented input:** **pointer/touch/multitouch, 6×** (1882/1900/1904/1910/1916/1922) — the new groove. Told to make pieces need a human, the lab reached for the *one* input it can validate headlessly, so "needs-a-human" collapsed onto "tap/drag the glass." Right behind it, the old enemy is still here: **autonomous self-playing, 6×** (1832/1836/1848/1862/1870/1876) — all pre-boundary, but still a third of the window. Genuinely diverse inputs are one-each and precious: mic (1928), camera-flow (1856), tilt (1930), keyboard/MIDI (1882).
- **Over-represented output:** **WebGL2 (fragment/float), 7×** (1836/1848/1856/1862/1900/1904/1922). The GPU-render family (WebGL2 7 + three.js 2 + WebGPU-compute 1) is **10/15**. SVG-DOM climbed from minority to **4×** (1832/1882/1910/1928) — it grew as intended, but is now itself at the threshold. Canvas2D 1× (1930), WebGPU-compute 1× (1916).
- **Over-represented technique:** **"simulation → scalar → pitch," ~11/15** — the lab's universal grammar. A physics/bio sim (pendulum, boids, Lenia ×3, Physarum, N-body, plate, telemetry) reads a scalar and drives pitch; novelty always lives in the sim, never in the compositional model. Zoom in and **Flow-Lenia/continuous-CA is 3×** (1836/1900/1904) — one more trips a ban and it becomes the new log-polar.
- **Over-represented vibe:** two clean halves at the 1882 boundary. **Violet-on-near-black, ~6×** (all pre-boundary: 1832/1836/1848/1856/1862/1870, +1876 monitoring-dither). **Post-boundary the palette is genuinely diverse** — paper-and-ink (1882), herbarium sepia (1900), warm textile (1904), cold graphite Ikeda (1910), dark-field teal (1916), sand/brass (1922), gold-on-vellum (1928), engraved brass (1930). The palette ban is the cleanest win in the set; do NOT re-ban it.
- **BANNED for next cycle:** pointer/touch/multitouch as the input (6×) · WebGL2 as primary renderer (7×) · the autonomous self-playing model (still 6×) · Flow-Lenia / continuous-CA as the simulation (3× → no 4th). **NOT banned (self-corrected, celebrate):** violet palette, pentatonic scale.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria:** **0** — fourth straight clean floor. No local-minimum builds by the letter.
- **Hit 2–3 criteria:** **3** — 1862 (3: named ref + research + subsystems, no lab-first), 1910 (self-scored 3), 1922 (3: modal synth + named ref).
- **Hit 4–5 criteria:** **12.** The standing caveat holds — the WIDE/DEEP pipeline auto-hits #3 (named ref) and #5 (recent research) *every* cycle, so 4+ is process, not excellence. The two criteria that still discriminate: **#1 (novel technique)** — cleanly hit only by **1916** (Physarum + WebGPU-compute, both grep-0×) and arguably **1876** (telemetry-as-input); and **#4 (multi-cycle)**, which finally fired: **1900 declared** flow-eden II, **1904 and 1930 delivered** cycle-2 extends. **#4 went 0/15 → 2 delivered.** That is the headline the floor stats have been waiting a month to show.

## Standouts (positive)
- **1930-harmonices (Harmonices II)**: the lab's cleanest answer to "extend the exceptional piece." Cycle 2's **chord crystallization** — hold a resonance and its exact JI dyad *engraves* onto the plate and keeps sounding, so across a session you *build* a chord of pure ratios that decays if you walk away — is the first real gesture toward **compositional memory** in this lab (your past gestures durably shape the present). Tilt input, JI from actual orbital period-ratios, dead without a human. The one to push to cycle 3.
- **1904-current-eden**: the *other* delivered extend, and the harder one — multi-species Flow-Lenia where **cross-species encounters modulate the harmony** (Phrygian/Lydian/Dorian, Hijaz on strong collisions), genuinely dead without a conductor (no growth term invents mass), warm madder/saffron/indigo on linen. Cashes #4 and breaks the palette in one build.
- **1928-choralis**: the most musically-literate engine in the window. A hand-rolled **YIN** detector feeding a real **SATB functional voice-leading** search — tendency-tone resolution, parallel-fifth avoidance, secondary dominants, cadences, modulation. This is precisely the "harmony that *bites*" the last jury demanded, done for real, under a live sung voice. Gold-on-vellum.
- **1916-slime-cantor**: the only unambiguous **#1 novel-technique** hit — a real WebGPU-compute Physarum (0× across ~20 juries that kept flagging "STILL 0×") whose graph-Laplacian **eigenvalue "connectome harmonics"** give continuous, non-quantized pitch that morphs as the slime rewires. The substrate escape the lab has been promising for months.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **1862-strobe-atlas**: unchanged from yesterday — the one relapse. Built on the lab's most-owned substrate (`_shared/psych/logpolar`) in the same week altered-states was hard-banned; self-admits the Cartesian/hyperbolic families are "plausible renderings, not reproductions" and the morph is a cross-dissolve, not a homotopy. When ideas run thin, the psychedelic-geometry engine is the deepest-worn groove; this is what falling in looks like.
- **The pentatonic legacy cluster (1836/1848/1856/1870/1876)**: five novel simulations, one safe scale — the exact local minimum the 2026-05-31 mandate named. They *predate* the ban (all pre-1882), so noted, not re-litigated. They are the visible "before" side of the boundary; the "after" side proves the lab can leave the safe scale on purpose.
- **The passive-mapping grammar (the whole window)**: ~11/15 are "the simulation composes, you watch or nudge." Even the five instruments (1882/1910/1922/1928/1930) are grid/lattice/strike surfaces. The invention is always in the *sim*; the *compositional* model — a scalar driving a pitch — hasn't moved in a month. Not any one piece; the shared reflex.

## Provocations for tomorrow's dream cycle
1. **Don't declare victory and drift.** The triple-ban landed cleanly at 1882 — celebrate it — but the lab immediately dug two fresh grooves. Next cycle: a **NON-touch human input** (camera/pose, MIDI, breath, or a *real* two-human WebRTC room — 1832 still *fakes* its collaborators with phantom voices) on a **NON-WebGL2 substrate** (WebGPU-compute is 1×, three.js 2×, or go genuinely audio-only / haptic). One rule change closes both new monocultures.
2. **Ban Flow-Lenia / continuous-CA for a week.** It's at 3× (1836/1900/1904) and is becoming the new log-polar. The flow-eden II commitment *delivered* its extend (good — #4 cashed) — now **close it, don't run a cycle 4.** Two live commitments is the ceiling; finish, don't fork.
3. **#4 is alive — be disciplined with it.** Multi-cycle went 0/15 → 2 delivered (1904, 1930). Pick the **one** thread most worth a cycle-3 and ship it, then rotate to fresh. The sharpest open thread is **1930's crystallization → the adaptive-JI drift toggle** ("strict physics: it drifts" vs "adaptive pure: it locks," a tiny least-squares retune — Pivotuner, arXiv:2306.03873). It makes the 300-year-old comma-pump *audible and playable* — the deepest form of "harmony that bites."
4. **Push compositional MEMORY, not just reactivity.** 11/15 are passive mappings where the sim decides and you watch. 1930's crystallized chord is the lab's first piece where *what you did five minutes ago constrains what the piece can be now*. Generalize that: a piece with authorship and history, where your earlier gestures are durable and consequential — not one more novel simulation sonified through a scalar.
5. **The AI-pipeline chain (audio→image→video, ≥2 models) is STILL 0×** across ~14 juries — the one genuinely-absent frontier, gated only on Karel's per-prototype paid-budget go (rule #6, the standing MORNING open question). After 1916 carried real WebGPU-compute and 1928 a real functional harmonizer in-loop, the lab can hold the systems. One yes unblocks it — put it to Karel plainly, again.

## Karel-facing line
The triple-ban worked — every piece since 1882 broke violet, pentatonic, and self-playing, and multi-cycle finally shipped (1904, 1930) — but the lab sprinted straight into two fresh grooves (touch-input 6×, WebGL2 7×); tomorrow, a non-touch human input on a non-WebGL2 substrate, and give one piece real memory of what you did.
