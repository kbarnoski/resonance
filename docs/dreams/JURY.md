# Concept Jury Verdict — 2026-06-21 (UTC)

## Summary
The renderer monoculture the last two juries screamed about is **broken** —
Canvas2D crashed from 10-of-15 to 3-of-15 and no single surface now dominates
(SVG 4, audio-forward 4, three.js 3, Canvas2D 3, WebGL2 1). And the depth ceiling
the 06-20 jury watched collapse 4→1 has **recovered to 2** (`803`, `814`), both of
them *recent* builds, not the window's fossils. That's a genuinely good night. The
catch: the concentration just migrated from the GPU to the *concept*. **Four of the
seven adult builds are the same move** — "a machine listens to Karel's recording and
follows / analyzes / answers / remembers it" — and three of those (`770→792→814`) are
literally one thread run three cycles deep. The kids lane, meanwhile, leans on
pentatonic-never-wrong **6 times** and re-runs the UPIC pitch-painter three ways. The
walls are gone; the ruts are new.

## Diversity audit
- **Over-represented input: Karel's-recording-as-autonomous-source — 4×** (770, 777,
  792, 814). The whole adult side is "his piano plays itself and a machine reacts."
  Runner-up inputs are healthily spread: body/camera 3× (788, 803, 811), mic/voice
  3× (773, 799, 808), tilt 2×, touch/keyboard 2×.
- **Over-represented output: SVG — 4×** (778, 797, 808, 811) **and audio-forward — 4×**
  (770, 792, 795, 814). *Note the win:* Canvas2D fell 10→3 and three.js held at 3 —
  the renderer field is the most evenly spread it's been in four windows. The 4×
  leaders are mild, not a monoculture. **Do NOT flip them into a new wall.**
- **Over-represented technique: pentatonic-never-wrong kids melody — 6×** (781, 788,
  795, 799, 805, 811) **and machine-listens-to-his-recording — 4×** (770 follow+answer,
  777 SSM-analyze, 792 swarm-memory, 814 motif-memory). The grain-resynthesis ban from
  two windows ago is gone (only 805 touches his grains, lightly) — but it re-templated
  into "read/follow/answer his recording," and that thread is now the adult lane's
  spine. Secondary: UPIC pitch-painting — 3× (781 touch, 788 body, 811 body).
- **Over-represented vibe: adult ambient/meditative/intimate — 5×** (770, 792, 803,
  808, 814) **and bright-active kids — 4×** (773, 781, 788, 811). The good news the
  last jury demanded: the kids calm register came back — 3 calm pieces (795, 799, 805)
  now balance the 4 bright-active ones. The kids side is no longer stuck at one pole.
- **BANNED for next cycle:** **his-recording-as-autonomous-source + machine-listens-to-
  his-recording-as-core** (4× adult — REST the recording on the adult side, and *stop
  the answering-agent thread* — 770/792/814 has had its three cycles) · **pentatonic-
  never-wrong as the kids harmonic crutch** (6× — build a kids piece where harmony or
  rhythm can be *shaped*, not one where every note is pre-approved) · **the UPIC pitch-
  painter** (3× — three draw/wave-a-pitch pieces is a template now) · **adult-ambient/
  meditative as the default register** (5×). NOT a renderer ban this time — the surfaces
  are finally spread; keep them that way, don't reflexively flee to one.

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — the floor holds for the fourth window running. Even the
  thinnest build clears #2+#3.
- **Hit 2–3 criteria: 13** — 770, 773, 777, 778, 781, 788, 792, 795, 797, 799, 805,
  808, 811. Still the fat middle; the #2+#3 comfortable rung is where most fires land.
- **Hit 4–5 criteria: 2** — **`803-body-chimes`** (#1 first body-excited modal physical-
  modeling instrument + #2 + #3 Vrengt/CORDIS-ANIMA + #5) and **`814-remembering-room`**
  (#1 first long-form symbolic motif-memory agent + #3 CHI-2026/MusicWeaver + #4 cycle-2
  of 770 + #5). **The ceiling recovered from 1 to 2, and both are recent (cycles 499 &
  503), not the window's oldest** — the exact inversion of last window's alarm, where
  the lone 4/5 was the fossil. The depth habit is breathing again. Hold it: 2 is the
  floor to beat, not the win to coast on.

## Standouts (positive)
- **814-remembering-room**: the build of the window. A true cycle-2 of `770` that gives
  the live-music agent the one thing it lacked — *memory*. A growing motif bank (its own
  answers + contours lifted from his playing) that it transposes / augments / fragments /
  inverts under rising memory-pressure, so minute 5 reworks minute 1. The visible
  memory-shelf makes the accretion legible. It's the lab's first long-form *symbolic*
  memory agent and the directest possible answer to the 06-20 jury's #1. This is what
  "return and extend" is supposed to look like.
- **803-body-chimes**: the other ceiling, and the answer to two prior bans at once. Body/
  camera input (which had gone 4×→0×) returns, and for the first time the body *excites
  real physical-modeling DSP* — modal damped-sine resonator banks with inharmonic
  partials struck by 3D spatial collision — instead of just selecting a note. Genuine
  installation-mode register (Bernhard Leitner cited and felt).
- **795-kids-sound-hunt**: the cleanest diversity dodge in the window — compass/heading
  input + HRTF binaural eyes-closed output + calm bedtime kids, three starved registers
  in one piece, off every over-represented tag. It's also the kids lane's return to calm
  done right, and the rare "the sound is the star, the screen is almost nothing" build.
- **808-sympathetic-strings**: first AudioWorklet Karplus-Strong delay-line bank in the
  lab — 48 mic-excited tuned strings ringing to your live spectrum, on SVG. The most
  literally *live-performance-fit* piece here: point a mic at the real piano and the
  strings answer (Karel priority #3), with a named hardware reference (EAE Prismatic Wall)
  it actually implements rather than gestures at.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **805-kids-snow-piano**: pleasant, but a 2/5 local minimum dressed in three.js. Tilt →
  a Hann-windowed slice of his piano snapped to pentatonic is the `227-paths-granular`
  music-box move with a snow skin; no novel technique, no real new subsystem. What's
  missing: a reason it had to be *his* recording rather than any chime sample, or any
  state that makes minute 5 differ from minute 1.
- **778-markov-mirror**: competent and the "watch the model glow as it learns" viz is
  the best thing about it — but the core is a textbook order-2 Markov melody demo with no
  named-artist reference and no recent-research backing (2/5). The interesting unbuilt
  version is the one where the *graph itself* is the instrument you reshape, not a mirror
  of what you played.
- **781-kids-paint-conductor**: flagged last jury too, and now it's the *first* of three
  UPIC pitch-painters in the window (781 touch → 788 body → 811 body). Strong on its own;
  a local minimum as a *pattern* — the lab has proven it can map a drawn/waved gesture to
  a pentatonic playhead, three times. The technique is banked; stop re-shipping it.

## Provocations for tomorrow's dream cycle
1. **Rest his recording, and end the answering-agent thread.** Four of seven adult builds
   are "a machine listens to Karel's piano"; `770→792→814` ran the *same* idea three
   cycles deep — it earned its depth, now it's a rut. The next adult cycle should use an
   audio source that is NOT his recording (live mic, external data, pure synthesis) and a
   core that is NOT follow/analyze/answer/remember.
2. **WebGPU compute has never appeared — after 814 cycles.** The ambition floor's own
   flagship example (#1 "first WebGPU compute shader") is *still unclaimed*. That is the
   single biggest unbuilt ambition flag in the lab. A particle/fluid/reaction-diffusion
   field driven by his audio on a WebGPU compute pass would clear the floor and break new
   ground in one move.
3. **Two cold categories from the menu have zero entries this window: multi-user/WebRTC
   and real-world-data sonification.** Spend a cycle genuinely cold — a shared/conducted
   listening room (two browsers, one evolving piece) or a piece that sonifies a live
   external API (weather, transit, seismic). "Music *about* something other than music"
   hasn't been touched.
4. **Kill the pentatonic-never-wrong reflex for one kids cycle.** It's the crutch 6 of
   the last kids builds lean on. Build a kids piece where the child can shape *harmony or
   rhythm* and where a "wrong" choice is musically interesting rather than impossible —
   harmonic agency, not a pre-approved scale.
5. **Stop banking DEEP-mode losers and never resurrecting them.** `809-sympathetic-modes`,
   `810-sympathetic-comb`, `815-accreting-room`, `812/813` are all sitting in IDEAS from
   the last few fires, fully briefed. The DEEP mode keeps generating siblings that die in
   the bank. Pick ONE banked sibling and ship it instead of starting a fresh research
   thread — the cheapest ceiling build available.

## Karel-facing line
Recovery night — the renderer wall finally broke (Canvas2D 10→3) and the depth ceiling
climbed back 1→2 with `803` and `814`, but the adult lane is now 4-of-7 "a machine
listens to your piano" and the kids lane leans pentatonic-never-wrong 6×: rest the
answering-agent thread and chase the never-built WebGPU/multi-user frontier next.
