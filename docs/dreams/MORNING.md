# Morning digest — last updated 2026-10-21T13:30Z

> **The "stack 4" summit — finally climbed.** For three mornings the jury has said no piece stacks the three *discriminating* ambition axes at once: a genuine lab-first technique (#1), a multi-cycle commitment (#4), and a fresh ≤14-day paper (#5). Today's build is the first that does all three. It's also the substrate change you'd want after three straight raw-WebGL2 fires: this one runs on **WebGPU** — a different engine entirely — and the research dive went non-spatial as the jury asked, landing on a differentiable-DSP paper posted four days ago.

## New since yesterday
- **`23440-fluxmesh` — a membrane, simulated on the GPU, that you push with your body and it becomes the filter on your piano.** ~10,000 mass-spring nodes run entirely on the GPU every frame; the GPU boils the whole field down to four numbers (how much it's moving, how stretched, where the energy sits, left/right) and those four numbers drive a real filter+delay graph on one of your takes.
  - **Push the field and the piano opens up** where you pushed — the spot brightens *and* the sound brightens at the same instant. Energy opens the filter, stretch adds resonance, up/down tilts the delay, left/right pans it.
  - It's the lab's **first time a GPU *simulation* drives the live sound** (not just the picture) — exactly the lab-first the jury kept naming. It implements *Fluxion* (arXiv:2610.24622, posted 17 Oct), a differentiable-DSP runtime that runs the same filter graph on the GPU.
  - **Declared a 3-cycle build** (cycle 1 of 3): cycle 2 adds a second body-driven region + an FIR stage; cycle 3 adds Fluxion's "freeze the graph when it settles" moment and opens it to full-body / a second person.
- **Why open it:** press play, then **drag the mouse** across the field — fully playable with no webcam. With a camera, stand back and reach: your wrists push the membrane.

## Needs your 30-second check
- **The camera (full-body pose) path is untested up here** — I can't point a webcam at myself in the cloud. The mouse path is verified and complete; the body-tracking calibration (wrist→push, mirroring, seated framing) wants your quick look. It ships *demoable*, not as "working camera", on purpose.

## Also explored (banked, not shipped)
- **`fluxgraph`** — the sibling: a WebGPU compute shader that *literally computes the output audio samples* of a filter+delay graph, block by block. Gorgeous and faithful, but its camera used one hand (the sensor the jury asked me to rest this cycle) and its "first GPU-computed audio" claim collides with an old 2026 piece — so fluxmesh won. Banked in IDEAS to ship later. See IDEAS §1311.

## Open question for you
- The summit's climbed once — want me to **continue fluxmesh to cycle 2** next fire (the natural move), or chase a *second* #1+#4+#5 stack on a different substrate so it doesn't become a template? Either is good; tell me which you'd rather see.
