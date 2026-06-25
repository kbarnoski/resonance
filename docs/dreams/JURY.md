# Concept Jury Verdict — 2026-06-25 (UTC)

## Summary
The best **ambition** window the lab has ever posted — and the most **conformist**
in execution. In one fortnight the field knocked out **three categories the jury
named as 0× in every prior verdict**: the first depth-camera piece (927), the
first multi-user/WebRTC piece (918), and the first true AI-pipeline-chain (915,
audio→image→video). Provocations are being consumed at scale, criterion #5
(in-README dated research) is now **15-for-15 / total**, and 9 of 15 builds clear
4/5. The catch is the mirror of that discipline: the research-dive→one-build
machine has hardened into a **house style** — three.js glow (7×), granular
texture (4×), cosmic-ambient adult vibe (5×) — and the anti-pitch-theory stance
the jury once *asked* for has metastasized into the new safety crutch: "pitch
held deliberately dumb, music lives in rhythm/timbre/space" is now boilerplate in
~10 of 15 READMEs. We fixed the Canvas2D/SVG wall and built a three.js wall behind
it.

## Diversity audit
- **Over-represented input: mic 4× (907 onset, 909 timbre, 922 breath, 924 sing).**
  The lab's reflex source for "embodied but not pitch." Sensors finally spread
  otherwise — camera/body 2× (911 pose, 927 depth), shake 2× (918, 935), tilt 2×
  (931, 932), external-data 2× (898, 939), MIDI 1× (902), touch 1× (899). **MIDI
  is thin at 1×; multi-source desk input still rare.**
- **Over-represented output: three.js 7× (907, 909, 911, 915, 918, 924, 935).**
  This is the structural story. Last jury banned Canvas2D+SVG; the field obeyed
  (those collapsed to 3 of 15) and swung hard to GPU (12 of 15 are now
  GPU-rendered — exactly the swing-back asked for) **but funneled almost all of it
  into one library.** WebGPU compute is *still* the scarce surface at **1×** (only
  932); raw-WebGL2 is healthier at 4× (922, 927, 931, 939). We keep trading one
  monoculture for the next. **AI-image/AI-video output finally 1× (915).**
- **Over-represented technique: granular / grain-texture synthesis 4× (909, 911,
  927, 935).** Grains are now the timbre default the way JI was last window. A
  secondary cluster: **GPU physics sims 3× in one window (922 fluid, 931
  shallow-water, 932 N-body)** — gorgeous, but "ship a simulation and pulse a bell
  off it" is becoming its own reliable adult move.
- **Over-represented vibe: kids 7× (structural — every-other rotation) AND
  cosmic-ambient on the adult side 5× (909, 915, 922, 932, 939).** Nearly every
  adult build is a dark-glow nebula/aurora/cosmos. The data/Ikeda-clinical
  register (898) and the bright theory/instrument register (902) are the lone
  outliers. **Plus a non-tag tic worth naming: the "pitch is deliberately dumb"
  disclaimer itself is now a template** — it appears in ~10 READMEs as a virtue,
  and it has quietly become the excuse not to compose.
- **BANNED for next cycle:** **three.js** (7× — push GPU work onto raw WebGPU
  compute (1×!) or raw-WebGL2 instead) · **mic as primary input** (4×; reach for
  MIDI, a feed, a sensor, or the network) · **granular-texture synthesis** (4× —
  make the sound some other way) · **the "pitch held deliberately dumb /
  drone+texture" stance** (now ~10×; for one cycle, real melody or harmonic
  motion must BE the idea, not the thing you apologize for omitting).

## Ambition floor stats (last 15 prototypes)
- **Hit 0–1 criteria: 0** — the floor holds for the eighth window running.
- **Hit 2–3 criteria: 6** — 898, 899, 907, 911, 935, 939 (all 3/5). The
  comfortable middle: a competent build clearing ≥3 subsystems + named ref +
  dated research but adding no genuinely new technique.
- **Hit 4–5 criteria: 9 — the deepest bench the lab has fielded** — 902, 909,
  915, 918, 922, 924, 927, 931, 932 (all 4/5). Each pairs a novel-for-the-lab
  technique (#1) with ≥3 subsystems, a named reference, and a dated finding.
  **Criterion #5 (in-README dated recent research) is now 15-for-15** — the streak
  the last verdict begged to "lock in" is total. That regression risk is closed.

## Standouts (positive)
- **927-depth-room**: the build of the window. The lab's **first depth-camera
  piece** — named as a 0× gap in *every single prior jury* — and done in pure
  software (Depth Anything V2 on WebGPU via Transformers.js, no special hardware,
  no npm dep). Distance-as-instrument, pitch held genuinely subordinate to
  proximity/space. This is a standing ask finally answered, cleanly.
- **915-resonant-cinema**: the **first true AI-pipeline-chain** (audio→flux-schnell
  →LTX-video→live-shader), another 0× menu category. The real idea is the
  *inversion*: the human plays live and the model only SEEDS a canvas the live
  audio keeps animating — with hard cost-gating (fires only on explicit click,
  never idle). An ambitious model-chain, not a single-synth toy.
- **918-starlight-friend**: the **first multi-user/WebRTC piece** — a third 0×
  category cracked in one window. Serverless P2P with a gzipped-SDP `#join` link
  is genuinely clever, and the dyadic-child framing (loose sync is the *feature*)
  is well-grounded. Three long-standing gaps closed in one fortnight is the
  headline.
- **902-harmonic-mirror**: the lone adult build that still reasons about *pitch* —
  deterministic just-intonation chord-completion under your hands — and it's a
  standout precisely because it bucks the window's anti-harmony drift. Squarely on
  Karel's "workspace for composers" line.
- **922-breath-aeolian**: the freshest sound *source* — real aeroacoustics, pitch
  set by vortex-shedding physics (`f = St·U/d`) rather than a scale or a drone. A
  build where "no scale" is earned by physics, not declared by fiat.

## Pruning candidates (concept-level, NOT for deletion — immutability rule still holds)
- **898-tremor-score ↔ 939-aurora-harp**: the same pairing the *last* jury flagged
  (877↔898) recurs — **two live-external-data sonifications in one window**
  (USGS quakes, NOAA solar wind) with a near-identical architecture: live feed +
  synthetic fallback + "data → musical structure/resonance" + a feed-readout
  panel. 939 deserves credit for finally *dropping* the consonant-mode crutch the
  jury banned — but "live feed → drone instrument" is now a reliable template the
  lab reaches for whenever it wants an easy adult win. One idea, shipped twice.
- **911-shadow-dance**: the thinnest of the granular cluster. MediaPipe Pose
  already shipped (869), and "bodily input → granular texture, pitch dumb, GPU
  glow" is the exact 909/911 pair — 911 is 909's body-driven re-skin. Clears the
  floor at 3/5 on subsystem count, but adds no new *technique*.
- **935-kids-shake-critters**: the purest instance of the **kids formula** now
  fully crystallized — sensor input + GPU glow + always-on drone + auto-demo +
  "no wrong notes / pitch held dumb" + kids-safe limiter chain. Competent in every
  part, novel in none beyond "first PhISEM." The kids rotation has a recipe now,
  and 935 is it cooked exactly to spec.

## Provocations for tomorrow's dream cycle
1. **Ban three.js for a cycle.** The field over-fixed the Canvas2D/SVG ban into a
   7-of-15 three.js monoculture. **WebGPU compute is still 1×** after the menu has
   named it for weeks (932 is the lone instance). The next GPU build should be raw
   WebGPU compute or a hand-written WebGL2 path — not `new THREE.Scene()`.
2. **Make music from PITCH again — the pendulum over-swung.** The jury asked *once*
   for "music from something other than pitch theory"; the lab obeyed so totally
   that "drone + texture, pitch held dumb" is now in ~10 of 15 and has become the
   excuse not to compose. 902 is the only adult build still reasoning about
   harmony and it's a standout. Spend a cycle where **melody, voice-leading, or a
   real harmonic arc IS the idea** — pitch as expressive material, not the thing
   you apologize for omitting.
3. **Verification debt is real and accumulating.** All 15 are build-green but
   **runtime-unverified** — none were heard, none seen running; every README ends
   with the same "no GPU/audio/mic/camera/net in sandbox + EMFILE blocks
   static-gen" disclaimer. The lab is stacking untested surface area. Spend a
   cycle (or push for the infra fix) to actually *run and verify* 2–3 of the
   strongest recent builds (927, 915, 918) on a real device instead of shipping a
   16th unheard prototype.
4. **Develop the three category-openers — don't move on to a fourth.** 927 (depth),
   915 (AI-chain), and 918 (WebRTC) each cracked a 0× category this window. That's
   where the depth budget belongs next, not a brand-new category. Go DEEP on one:
   depth-room → a real multi-zone spatial *instrument* you walk through; the
   AI-chain → music→narrative→TTS→score-follower; the WebRTC room → a conducted
   two-player ensemble with roles.
5. **Granular is the new comfort food (4×).** If you reach for grains again,
   justify in STATE.md why it isn't just the default texture — or make the timbre
   some other way (physical modeling, FM, additive, sampled-and-mangled).
6. **A third live-data sonification needs a different OUTPUT.** 898 and 939 already
   spent the feed→fallback→data-as-form template twice. If a feed composes again,
   route it to a *different* modality — data→AI-image, data→haptics, data→a
   networked room — or skip it.

## Karel-facing line
Best ambition window yet — the lab cracked depth-camera, multi-user, AND AI-chain
in one fortnight (all standing 0× asks) and every build now cites dated research —
but it's hardened into a house style: three.js glow, granular texture, and "pitch
held deliberately dumb" is now boilerplate in two-thirds of builds; tomorrow we
ban three.js, push onto raw WebGPU, and make music from real harmony again.
