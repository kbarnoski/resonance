# Concept Jury Verdict — 2026-06-22 (UTC)

## Summary
The techniques are genuinely diverse this window — fifteen builds, fifteen
different core methods (FDTD waveguide, Kubelka-Munk pigment optics, Penrose
pentagrid, coupled feedback dynamical system, emergent phyllotaxis, air-quality
roughness synthesis…), and not one technique repeats four times. That's the good
news, and it's real. The bad news is a **relapse the last two juries will not
want to hear about: Canvas2D is back to 7-of-15.** The 06-21 jury cheered it
crashing from 10→3 and begged "do NOT flip the surfaces into a new wall." It got
flipped right back. And the kids lane, having dutifully killed its
pentatonic-never-wrong crutch (6×→3×), immediately grew a replacement one —
"drag one control, an always-consonant chord morphs" — now run **5 times**. The
ruts didn't close; they moved one level deeper, exactly as predicted.

## Diversity audit
- **Over-represented input: touch 4× (816, 828, 834, 822) AND mic/voice 4×
  (808, 833, 841, 846).** Eight of fifteen are screen-or-handheld. The embodied
  inputs are starved: body-tracking 1× (811), tilt 1× (805), MIDI 1× (827),
  external-API 1× (842), no-input 2× (820, 837), his-recording 1× (814). Depth
  camera: still 0×.
- **Over-represented output: Canvas2D 7× (820, 822, 827, 833, 837, 841, 842).**
  This is the headline. It crashed to 3 last window and has roared back to nearly
  half the field. Secondary: SVG 4× (808, 811, 816, 828). The GPU surfaces the
  jury keeps asking for are the scarce ones — three.js 2× (805, 846), WebGL2 1×
  (834), WebGPU **0×**, audio-forward 1× (814).
- **Over-represented technique: none hits 4× — techniques are healthy.** But a
  thematic template has formed: the kids "shape an always-consonant chord/field"
  move = **5×** (816 stack, 828 feeling-morph, 834 paint-hue, 841 hum-stack, 846
  sing). Same shape as the old pentatonic rut: the child literally cannot make a
  wrong sound, so the "agency" is cosmetic.
- **Over-represented vibe: kids 8× (structural — every-other-cycle rotation).**
  The alarm inside it: of those 8 kids builds, **7 are bright/warm-active and only
  1 (805) is calm.** The 06-21 jury fought to rebalance the kids calm register
  (795/799/805) — it has regressed to a single calm piece. Adult side behaved:
  adult-ambient is down to ~2× (814, 820), heeding the prior ban.
- **BANNED for next cycle:** **Canvas2D** (7× — hard ban; force a GPU surface —
  three.js / WebGL2 / WebGPU are 0–2×) · **the "drag-one-thing → always-consonant
  chord morphs" kids template** (5× — build a kids piece where a child can make a
  genuinely spicy/dissonant choice *with consequence*, not steer a pre-vetted
  vibe) · **touch + mic as the only inputs** (8× — push embodied/sensor: body,
  tilt, depth-camera, MIDI/OSC). NOT a technique ban — the methods are the one
  thing that's diverse; protect that.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — the floor holds for the fifth window running. Even
  the thinnest build clears #2+#3.
- **Hit 2–3 criteria: 13** — 2/5: 808, 811, 816, 822, 828, 833, 841 · 3/5: 805,
  827, 834, 837, 842, 846. The fat comfortable middle, as always.
- **Hit 4–5 criteria: 2** — **`820-feedback-ecology`** (#1 first no-input
  self-oscillating instrument + first coupled dynamical system, #2, #3 Nakamura/
  Tudor, #5 §505 Body Synths) and **`814-remembering-room`** (#1 first long-form
  motif-memory agent, #3 CHI-2026, #4 cycle-2 of 770, #5). **Caveat the count:
  814 was already the ceiling last window — `820` is the sole NET-NEW 4/5, and
  last window's other ceiling build (`803`) has aged out.** The ceiling is holding
  at 2 by carryover, not by fresh depth. One genuinely-new high-ambition build per
  fortnight is the actual rate. Watch it.

## Standouts (positive)
- **820-feedback-ecology**: the build of the window. Sound that emerges from
  *nothing* — eight coupled high-Q resonators self-oscillating in a small-world
  graph. The lab's first true no-input instrument and first dynamical-system
  piece; a category, not a variation.
- **837-quasicrystal**: the most conceptually surprising adult build — a de Bruijn
  pentagrid Penrose tiling drives a never-repeating, self-similar score that can
  run an hour without looping. A genuinely novel musical *structure*, and an
  honest answer to the long-form-without-loops ask.
- **842-air-veil**: the freshest register (real-world data, air-quality grep-0×)
  with a real surprise — rising pollution audibly *fouls* the harmony (inharmonic
  partials + beating creep in). Music about something other than music, done with
  taste.
- **834-kids-paint-mixer**: the rare WebGL2 build, and the only kids piece this
  window with a hard cross-modal lock — Kubelka-Munk pigment optics in GLSL means
  the heard chord is *exactly* the mixed pixel under the finger via readPixels.
  Lab-first pigment physics; blue+yellow makes green, not mud.
- **814-remembering-room**: still excellent (motif memory over minutes) — but
  counted last window; named here only to mark that the depth bench is two builds
  deep, one of them a holdover.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **811-kids-body-ribbons**: the lab's one body-tracking build this window, and
  it spends MediaPipe pose on the safest possible mapping — pentatonic UPIC
  pitch-painting (a move the 06-21 jury banned 3×). The most ambitious *input*
  wasted on the least ambitious *musical idea*. If you have a body, do something a
  touchscreen can't.
- **828-kids-feelings-sun**: charming, but it's the purest specimen of the new
  cosmetic-agency template — drag a sun, the chord can never be wrong. The child
  steers a vibe, never makes a decision with stakes. What's missing: the freedom
  to land somewhere spicy and *resolve* it.
- **841-kids-hum-stack**: solid pitch-detection, but it's the third "stack
  intervals on a root" kids piece (816 stacks blocks, 841 stacks on the voice).
  Incremental inside the harmony-agency template rather than a new question.
- **808-sympathetic-strings**: beautiful and well-built, but Karplus-Strong
  sympathetic resonance is a resurrection of well-trodden lab ground (the 798
  lineage), not a frontier — a 2/5 that reads as polish, not dreaming.

## Provocations for tomorrow's dream cycle
1. **Hard-ban Canvas2D for a week.** It's back to 7-of-15 — the exact wall you
   broke twice. WebGPU is 0×, WebGL2 1×, three.js 2×. `834` and `846` prove the
   lab can ship GPU surfaces when it commits; make the next 3–4 builds GPU-only
   and watch the monoculture break again.
2. **Build the embodied/spatial prototype the lab keeps deferring.** Body 1×
   (squandered on 811), depth-camera 0×, the whole "spatial / installation" menu
   category is cold. Spend a DEEP cycle on a depth-camera or pose-driven
   *spatial-audio room* — Tauri-mode candidate, and the directest answer to "live
   performance fitness."
3. **Give a kid the freedom to be WRONG.** You killed pentatonic-never-wrong (6×→
   3×) — good — and replaced it with "always-consonant-morph" (5×). Build a kids
   piece where dissonance is reachable AND resolvable, so the child makes a real
   harmonic *decision* with a consequence, not a steer through a pre-vetted field.
   `841`'s "spicy = a creature's mood" gestures at this; commit to it fully.
4. **Bring back a calm kids piece.** 7 of 8 kids builds are bright/warm-active;
   only `805` is calm. The prior jury fought for this balance and it's regressed —
   one bedtime-register kids build resets it.
5. **Stop the 4/5 from becoming a banked ghost.** `820-feedback-ecology` is your
   only net-new high-ambition build this window and STATE already queues its
   cycle-2 (Lorenz-drifting coupling weights so the topology itself evolves). Ship
   that — or push `837-quasicrystal` deeper. The depth bench is thin; develop what
   you have instead of always opening a new tab. (Aside: you shipped a *second*
   prototype literally named `kids-sing-garden` — `799` and `846` — 47 cycles
   apart. The theme-recurrence is showing in the slugs now.)

## Karel-facing line
Strong, varied builds — but a sneaky relapse: Canvas2D is back to 7-of-15 (the
wall you broke twice) and the kids lane swapped its pentatonic crutch for an
"everything's-always-consonant" one; the standouts (820 feedback-ecology, 842
air-veil, 837 quasicrystal) are the real thing.
