**For**: kids (4+)

# Shadow Monster Stage

> "What if a 4-year-old's whole BODY becomes a giant googly shadow-monster on a
> stage — wave your arms and it whooshes, jump and it BOINGs, stretch big and it
> ROARs?"

Stand in front of the camera and your whole body becomes a huge glowing
shadow-puppet monster on a theatre stage, with big friendly googly eyes near the
top. The monster mirrors you. Move and the air whooshes. Jump and it goes BOING.
Get BIG (step in, throw your arms wide) and it lets out a soft, happy ROAR. There
is nothing to get wrong — every wiggle just makes something delightful happen.

## How it works

- **INPUT — body silhouette MASK.** The webcam frame goes to **MediaPipe
  ImageSegmenter** (the selfie / person-segmentation model), loaded *dynamically
  from the jsDelivr CDN at runtime* (ESM bundle + `.wasm` fileset + the
  segmenter model). There is **no npm dependency** — it is CDN-only and wrapped
  in `try/catch`. We use the filled body **mask** (a silhouette blob), then
  downsample it into a small occupancy grid.
- **Signals from the mask** (`mask.ts`), each frame:
  - **motion energy** — frame-to-frame change of the mask → the **WHOOSH**
    intensity tracks how much the kid is moving.
  - **centroid rising fast** (a jump) → a **BOING**.
  - **area growing** (steps toward camera / arms up / gets big) → a **ROAR**
    that swells in.
- **CREATURE.** The mask becomes the monster body: a dark friendly puppet
  silhouette with a glowing, wobbling, breathing outline (squash-and-stretch),
  a soft inner glow that pulses with the roar, whoosh streaks that smear with
  motion, and two procedural **googly eyes** placed near the top of the mask's
  bounding box, pupils rolling toward where the body moves.
- **OUTPUT — WebGPU / WGSL.** A hand-written WGSL fragment shader (`gpu.ts`)
  uploads the mask as an `r8unorm` texture and renders the glowing creature
  field on a spotlit stage. A **full Canvas2D fallback** (`render2d.ts`) draws
  the same silhouette + googly eyes + glow and is auto-selected when
  `navigator.gpu` is absent or WebGPU init fails. A small live badge shows which
  backend is active.
- **SOUND** (`audio.ts`). An always-on warm ambient theatre bed (never silent),
  a continuous airy whoosh, a swelling soft roar, and a comic spring boing.
  Kid-safe master chain: `masterGain (0.55) → lowpass (7.5 kHz) →
  DynamicsCompressor (-18 / 6 / 12) → destination`. The roar is soft-attacked
  and heavily low-passed — a happy dinosaur, never a scary growl.

## Design notes (kids 4+)

- **No reading required**; **color is the language**. Big targets — the Start
  button is ≥64px and the fallback ROAR / WHOOSH / BOING buttons are ≥88px.
- **No fail states, no "wrong."** Every movement does something nice.
- **Always-on soft bed — never silent.** Sounds are gentle: no sudden loud
  transients, no piercing highs.
- **Response < 50ms.** Persistent audio voices (bed, whoosh, roar) are
  pre-created; only the boing is a short one-shot.
- The `AudioContext` is created and resumed inside the first tap (iOS unlock).
- **~2.5s idle auto-demo.** With no interaction and/or no camera, a "ghost
  silhouette" performs on its own — it drifts, waves, jumps and grows on a loop —
  so a silent 06:30 glance SEES the monster move AND HEARS whoosh/boing/roar with
  zero interaction. It loops, and yields the moment a real camera mask appears.

## Fallback behavior (robust no-camera path)

The whole camera + MediaPipe init lives in **one `try/catch`** inside the Start
gesture. Any failure — camera denied / blocked, CDN / WASM / model load error,
or unsupported browser — shows a friendly `text-rose-300` notice and the piece
stays **fully playable**: three big buttons (**ROAR / WHOOSH / BOING**) and keys
**A / S / D**, while the idle auto-demo keeps the monster alive. If WebGPU is
absent or fails, the Canvas2D renderer takes over automatically.

Privacy: camera frames are analysed in the browser only — never recorded or
sent anywhere.

## Honesty note

This piece derives everything from a **segmentation MASK** (a filled body
silhouette), **not** from pose / skeleton landmarks. That makes it deliberately
distinct from prior pose/landmark prototypes — we never read joints, only the
body blob.

## Named references

- **Shadow-puppet theatre** — the wayang kulit / hand-shadow tradition of casting
  a whole body or hand as a giant creature on a lit screen.
- **Daniel Rozin's mechanical mirrors** — work that turns a viewer's silhouette
  into a living, materialised reflection.
- **Tex Avery / Looney Tunes squash-and-stretch** — the elastic, exaggerated
  cartoon physics behind the wobble, the BOING, and the comic googly eyes.
- **MediaPipe ImageSegmenter** — the on-device body-segmentation model that
  produces the silhouette mask.
