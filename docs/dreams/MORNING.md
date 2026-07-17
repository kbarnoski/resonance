# Morning digest — last updated 2026-07-17 (cycle 803)

**Cycle 803 · WIDE · shipped `1832-choir-of-strangers` — a chord you can't build alone.** Best heard with a second tab open.

## New since yesterday
- **[1832-choir-of-strangers](https://getresonance.vercel.app/dream/1832-choir-of-strangers)** — a pure just-intonation chord that **no one can build alone**: each open browser TAB holds one voice, and the beatless five-limit harmony physically can't exist until several people join. **Why open this:** press *Take a voice* and you hear a lonely tone + watch a harmonic lattice with dashed "ghost" outlines of the missing voices; a seeded **phantom choir** fades in over ~15s so you hear the chord assemble solo — then hit **Open another voice** and a real second tab *replaces* a phantom (its node flips ghost→live and that tab makes the sound). **The idea, built:** following a 2026 paper (IEEE — *Real-Time Collaborative Music on the Web*), the tabs send **only control events, never audio** — each tab synthesizes its own voice locally, so the music *only exists in the aggregate*. This is the **multi-user lane your jury named the glaring 0×-built gap** — the lab kept *banking* this Dream-House idea (1814, 1828) and never shipping it; now it's live, with a phantom self-demo so it isn't demo-gated. **Best on speakers/headphones + a second tab; I built it headless and can't hear if the beatless JI chord locks in.**
- **2 more explored, banked to IDEAS §803:** **⭐⭐`1834-livingwall`** — an audio-reactive texture painted by the **CSS Houdini Paint API** (a `registerPaint` worklet as the render surface, no canvas/WebGL — extends the 1778-CSS / 1792-SVG "substrate courage" you've liked; Chromium-only so it falls back to Canvas2D on iPhone). **⭐`1830-roomtone`** — your **webcam's color** (not motion) tunes a drone: a warm room bends the chord toward major, a cool room toward minor — Scriabin inverted (light→tone).

## In progress / partial
- Nothing half-built. WIDE fire: 3 parallel takes, shipped the most on-mandate + research-backed; the other two are ready-to-resurrect specs.

## Research findings worth a look
- **Collaborative browser music is now a *control-event* problem, not an audio problem** (IEEE 2026 + Sequencer.party's CRDT model): you don't stream audio between peers — you send timing/state and each client synthesizes locally. That's the license for tonight's build and the whole "no single tab holds the sound" concept. Full note in RESEARCH.md §803.

## Open questions for Karel
1. **Does the JI chord land — and is the multi-tab payoff worth it?** Open two tabs side by side: do the pure fifths/thirds lock in beatlessly, and is the phantom→live handoff smooth? If close: I can add a real **WebRTC/relay** so remote *strangers* (not just your own tabs) assemble the chord — the true version of this lane.
2. **The journey-engine lane is getting crowded** — you now have jazz (1812), EDM (1818), cinematic (1824). That's an emerging "same shape" cluster. Want me to **deepen one into a real instrument** (your 802 Q2), or keep exploring fresh lanes like tonight's multi-user piece?
3. **Still standing:** the **audio→image→video AI-pipeline chain** (2+ models) is the one genuinely-absent frontier — it just needs your go on a small per-prototype paid budget (safety rule #6). Say the word.
