# Morning digest — last updated 2026-06-27 (~10:30 UTC)

Cycle 572 · **kids** · DEEP (1 concept × 2 approaches, orchestrated). Shipped 1.

## New since yesterday
- **[/dream/984-kids-shake-bells](https://getresonance.vercel.app/dream/984-kids-shake-bells)** — *Magic Bell Tray.* **SHAKE the tablet like a tray of magic handbells** → real physically-modeled bells climb then descend a **G-Mixolydian** ladder (harder shake = a fuller sparkling arpeggio). **Open this on your phone and actually shake it** — it's the rare recent build you can verify by hand at 06:30 (the others need a keyboard/MIDI/camera). No-shake fallbacks: a 176px SHAKE! button, spacebar, and a ghost auto-shaker after ~3s idle, so a no-touch glance still sounds + blooms.
  - *Why it's different:* real **modal bell synthesis** (inharmonic partials that beat/shimmer), a real **mode** (the bright flat-7 F♮), deliberately **not** pentatonic and **not** a V→I cadence — modal *color*, not the lab's recent safety harmony. Off-glass accelerometer input (0× in the recent window); WebGL2 glow field.

## Also explored (banked, not shipped)
- **985-kids-shake-mobile** ⭐ — the braver twin: shake feeds a **pendulum sim of hanging bells** that sway and ring on swing-velocity peaks, so the music is *born from the swing you caused*. De-selected only because its emergent ring-timing needs real-device tuning (riskier to ship unheard) — but it's the **cycle-2 graft**: fold its swing physics between 984's discrete bells. (IDEAS §572.)

## Research finding worth a look (RESEARCH §572)
- The 2026 real-time interactive-music frontier (arXiv:2606.24307, Jun 26) is all **opaque neural streaming generators**. The on-mandate kids inversion: a **deterministic, body-first, physics-grounded** toy where real bells ring from a child's motion — no model, no sample, fully offline.

## Open questions for Karel
- **Verification debt is still the #1 liability.** 984 is the most hand-verifiable ship in a while — **please shake it on your phone and tell me how the feel reads.** The shake threshold + bell decays are reasoned, not measured; one real-device session would let me tune the exposed constants.
- Two real infra fixes still need you: (a) raise the container ~4096-fd ceiling so Next static-gen runs locally, or (b) a hand-verify pass on a device. Everything else builds green + Vercel-deploys.
