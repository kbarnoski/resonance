# Morning digest — last updated 2026-06-24 ~18:2x UTC (cycle 540, kids · WIDE)

**Open this first (prop the phone up and dance!):** https://getresonance.vercel.app/dream/911-kids-shadow-dance

## New since yesterday
- **[/dream/911-kids-shadow-dance](https://getresonance.vercel.app/dream/911-kids-shadow-dance)** 🕺✨ — **a 4-year-old DANCES and their whole body becomes a cloud of light.** The front camera reads whole-body movement (MediaPipe Pose) and maps its *quality* — energy, fluidity, impulsivity — to a GPU particle bloom + granular texture; a sudden move is the beat. **Zero pitch logic** (one warm drone underneath). Why open it: the lab's first "make music by moving your whole body" kids piece. No camera? a ghost-dancer auto-demo blooms + sounds within ~1s.

## Mode + how it was made
- **KIDS · WIDE** — orchestrated **3 parallel builders** on ONE theme ("music from the BODY, not pitch") via different non-touch inputs. Shipped the dance piece; **2 more explored, banked in IDEAS §540**:
  - ⭐ `913-kids-spin-galaxy` — spin the tablet → a **WebGPU** star-galaxy whose orbits ring a rhythm (the purest "swing back to GPU" answer; resurrect on a desktop where WebGPU lands).
  - `912-kids-wind-garden` — **blow** at the screen → wind sweeps a glowing meadow, dandelion seeds chime (clever spectral-flatness blow-vs-hum detection; calm/bedtime).

## Research findings worth a look
- **RESEARCH §540** — the children's-movement-sonification model (Frontiers PMC5104747): movement has three sonifiable qualities — *energy, fluidity, impulsivity*. Plus *The Moving Mandala* (2025): rhythmic music + embodied movement → child synchrony. This cycle's build implements that mapping directly. (6 straight cycles now carry an in-README dated citation — criterion #5 is locked in.)

## Honest caveats
- Winner is **compile/lint/type-clean** but **not** camera/ear-verified in the container — whether MediaPipe Pose reliably tracks a *small* child across lighting, and the motion-scaling feel, need a real-device playtest. The auto-demo guarantees a glance always works.
- Static-gen still blocked by the standing container fd ceiling (EMFILE) — infra, not code; Vercel deploys normally.

## Open questions for Karel
- Dance (911) vs. spin-galaxy (913, WebGPU) vs. blow (912) — which embodied input feels most "yours" for the kids zone? I shipped dance as the directest research fit; happy to resurrect either sibling next.
- Still 0× in the lab: depth-camera, multi-user/WebRTC, AI-pipeline-chains. Want me to push toward one of those next adult cycle (541)?
