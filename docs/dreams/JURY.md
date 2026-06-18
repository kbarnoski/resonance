# Concept Jury Verdict — 2026-06-18 (UTC)

## Summary
This is the most jury-responsive window the lab has ever shipped — and that is
exactly the problem. Every one of last jury's five provocations got built:
multi-user went 0×→3× (694/702/711), the embodied-spatial swing landed as a real
WebGPU body-presence instrument (710), the audio→image→audio closed loop the jury
explicitly named got built (704), and "make a kid laugh" produced six silly pieces.
But the lab obeys so **literally** that each provocation hardened into the next
monoculture: the harmonic-event crutch (8× last window) genuinely died — it dropped
to 2× — and a **shared-clock loop-groove machine (5×) took its seat**, all of it
poured onto **Canvas2D, which exploded from 2× to 9×**. The floor held (only one
local-minimum build), the ceiling did not move (still 2 of 15), and of the twelve
*new* prototypes exactly **one** reached it. The lab does what it's told. It needs
to start doing what it's told *and then keeping going*.

## Diversity audit
- **Over-represented input: touch / on-glass screen-control — 5×** (684, 694, 702,
  711, 713). Unmoved from last jury's 5× flag — still the first instinct, even as
  the embodied inputs underneath spread well (webcam-body 2× · live-data 2× ·
  mic 2× · tilt+motion 1× · MIDI 1×). A finger on the glass is still the default.
- **Over-represented output: Canvas2D — 9×** (684, 694, 696, 705, 711, 712, 713,
  718, 719). **This is the headline inversion.** Last jury *praised* Canvas2D for
  dropping to 2× and banned WebGL2 (4×). One window later Canvas2D is the single
  most common output in the lab — it's the cheap carrier every kids-groove toy
  reaches for. three.js 3× (689, 699, 702), WebGL2 1× (704), WebGPU 1× (710). The
  scarce-and-best renderers are again the rarest.
- **Over-represented technique: shared-clock loop / step-sequencer GROOVE machine —
  5×** (694 polyrhythm ring, 696 beatbox-loop, 702 monster-groove, 711 beat-buddies,
  719 stomp-groove). **This is the new pentatonic / the new harmonic-event.** Last
  jury said "the kids side fled rhythm — build groove, not a cadence." It worked *too*
  well: "tap-or-move → a quantized loop with a googly creature bopping" is now the
  template every kids piece runs. Same trap as the harmonic-event cluster, one layer
  over. (Credit: harmonic-event/voice-leading collapsed 8×→2× — that ban worked clean.)
- **Over-represented vibe: silly / goofy / comedy kids — 6×** (696, 702, 705, 711,
  713, 719). Last jury's "make a kid laugh" pendulum overswung exactly as far as the
  "uniformly solemn" one did the window before. The kids side is now monolithically
  zany; the tender/contemplative pole cooled to ~2× (684, 690). It never *lands* on a
  spread — it just moves the lump from pole to pole.
- **BANNED for next cycle:** **Canvas2D output** (9× — the new monoculture renderer) ·
  **shared-clock loop / step-sequencer groove as the core idea** (5×, the new local
  minimum — *especially* banned on the kids side) · **touch / on-glass primary input**
  (5×, two juries running) · **silly/goofy-comedy kids vibe** (6× — vary the emotional
  register, not just the technique). Standing: **real cross-device multi-user** is
  still 0× (all three multiplayer pieces are same-browser `BroadcastChannel`).

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 1** — **705-kids-silly-voice** (a Talking-Tom varispeed/reverse/
  ring-mod voice-changer: trivial DSP, named refs only, no novel subsystem). A
  local-minimum build crept back in after a clean 0 last window. Minor regression.
- **Hit 2–3 criteria: 12** — 684, 690, 694, 696, 699, 702, 704, 711, 712, 713, 718,
  719. The whole middle of the lab. Most clear the comfortable pair (#2 ≥3 subsystems
  + #3 a named ref); the novelty is the input/renderer/framing, rarely the music.
- **Hit 4–5 criteria: 2** — **710-presence-bloom** (#1 + #2 + #3 + #5) and the
  carried-over **689-dream-chapters**. **Of the twelve genuinely new builds, only 710
  reached the ceiling.** 704 (closed loop) and 718 (his real piano) are the strongest
  of the 3-bucket and were *one criterion* — a recent-research cite or a stated
  multi-cycle plan — from joining them. Reach is there; it's being left on the table.

## Standouts (positive)
- **710-presence-bloom**: the real answer to last jury's #2. Not another eyes-closed
  glow screen — a WebGPU-compute particle storm (tens of thousands of WGSL points) +
  MediaPipe full-body pose + **HRTF spatialization *as the instrument*** (persistent,
  accreting voices you leave in 3D around your own ears), grounded in two recent arXiv
  papers, degrading first-class to Canvas2D. The window's only new ceiling build and
  its boldest swing. **Extend this — it's the genuine frontier.**
- **704-spectral-seance**: did the rare right thing — built the *exact* cycle-2 the
  last jury named (689's banked 687-latent-oracle), closing the one-way AI mint into a
  **true audio→image→audio loop**: the dreamed image is re-sonified column-by-column as
  a spectrogram (ANS / Xenakis *UPIC* / Ikeda lineage). Extending the ceiling instead
  of starting a fresh toy. This is jury-responsiveness done *right*.
- **718-duet-paths**: the most "Resonance" build of the window — a call-and-response
  shadow that answers using **concatenative grains pulled from Karel's *own* recorded
  Welcome Home piano** (CataRT / MACataRT). It is the single piece in 15 that honors
  Karel's standing "incorporate your actual music from the Paths" directive.
- **The multi-user trio (694 / 702 / 711)**: took the social register from 0× (flagged
  three juries running) to 3× in one window. The asterisk (same-browser only) is real,
  but the solo monoculture is broken — credit where due.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **The kids loop-groove cluster (696 → 702 → 711 → 719)** — no single one is a local
  minimum; the *set* is. Four straight kids builds are "tap-or-move → a quantized
  shared-clock loop with a googly creature bopping on Canvas2D." Individually fun,
  collectively the precise trap the harmonic-event cluster was last window — the
  jury's own provocation #1 turned into the new template. **This pattern, not any one
  slug, is the thing to break.**
- **705-kids-silly-voice** — the window's textbook comfortable build: a record-and-
  replay voice-changer with off-the-shelf varispeed/reverse/ring-mod transforms, no
  novel subsystem, and a faint brush against Karel's standing "pull WAY back on voice
  generation" directive. The 1/5 of the batch.
- **719-kids-stomp-zoo** (the just-shipped winner) — honest 2/5 by its own STATE note.
  Webcam frame-diff already exists in the lab (652/698); the lower-body-band restriction
  and parade ripple are refinements, not a new primitive — layered onto the most-used
  output (Canvas2D), the most-used technique (loop groove), and the most-used vibe
  (silly). It's a well-made *median*, shipped on the day the median is the diagnosis.

## Provocations for tomorrow's dream cycle
1. **Ban Canvas2D for a cycle — it is the new monoculture (9× this window, 2× last).**
   710 already proved a WebGPU-compute + MediaPipe stack degrades cleanly to Canvas2D;
   port that *to a kids piece*. A kid deserves the scarce renderer too, not just the
   adult installations.
2. **Ban the shared-clock loop / step-sequencer groove as the core kids idea for a week.**
   It is the new pentatonic. You killed the harmonic-event crutch and "tap→loop groove"
   filled the vacuum in four straight builds. Break the *reflex*, not just the tag — a
   kids piece can be about texture, transformation, cause-and-effect, or a single
   surprising sound, with no loop and no creature bopping a backbeat.
3. **Stop shipping the provocation and parking it. Reward depth over breadth.** Every
   one of last jury's five calls got built once and abandoned. Push **710 to a cycle-2**
   (real-room install, projection, a second body) or **704's closed loop** further,
   instead of spinning a fifth groove toy. The lab banks ceilings and walks away — the
   2-of-15 ceiling count hasn't moved in two windows because nobody returns to extend.
4. **Make one multi-user piece *actually* cross-device.** All three multiplayer builds
   are same-browser `BroadcastChannel` (their own READMEs admit it). 702 banks the
   WebRTC/WebSocket-signaling path behind the identical epoch+pattern model. One real
   two-phones-across-the-room jam retires the asterisk and is a genuine lab-first.
5. **Use Karel's real music — it's in exactly 1 of the last 15.** 718 alone draws on
   his Welcome Home recordings; everything else synthesizes fresh audio. His standing
   directive is "incorporate your actual music from the Paths." Build the next adult
   piece (or a kids one — his piano grains as a kid's sound-paint) on his recordings,
   not a new oscillator bank.

## Karel-facing line
The lab now does *exactly* what the jury says — too literally: last week's "build groove,
make them laugh" hardened into a fresh monoculture (Canvas2D 9×, loop-machine 5×,
silly-kids 6×), and the only two that truly reached were 710's WebGPU body-presence and
704's closed audio↔image loop — stop banking ceilings and walking away.
