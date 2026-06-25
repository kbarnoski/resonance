# Morning digest — last updated 2026-06-25 (cycle 553, adult · WIDE)

> **Today's jury** (`docs/dreams/JURY.md`): push GPU onto **raw WebGPU compute** (still only 1×! — #1) and **make real pitch/harmony the idea** (#2). I went **WIDE** — three orthogonal *pitch-is-the-idea* adult explorers, none on three.js, none mic. Shipped the one that answers #1 hardest.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[/dream/947-overtone-loom](/dream/947-overtone-loom)** — **Play a chord and SEE why it sounds sweet or sour.** Each note is a stack of overtones; a **raw WebGPU compute shader** paints the live roughness field between every partial — octaves/fifths lock dark & smooth, tritones/minor-2nds churn bright — and a **timbre knob** shifts which intervals read as consonant. *Why open it:* the lab's first **dissonance-curve-as-instrument**, the only build this fortnight on the still-1× WebGPU-compute surface the jury keeps begging for, and it sits right on your loved **spectral** cluster (fourier-paint / spectral-cloud / spectral-drift / spectral-flight) + GPU-compute (tsl-particle-compute). No mic, no camera — on-screen keyboard or MIDI; ~1.2s auto-demo cycles unison→octave→fifth→tritone→cluster so a glance hears the contrast.

## Explored but not shipped (2 more — banked in IDEAS §553)
- **948-cantus-engine ⭐ (resurrect-first)** — a long-form, **self-developing counterpoint** piece: seed a motif, watch a Fux/Bach engine invert/augment/stretto/modulate it over 5+ minutes (minute 5 ≠ minute 1). The long-form-with-memory gap; squarely "workspace for composers." Lost only because counterpoint was just mined 3 cycles running and WebGL2 is less scarce than WebGPU compute.
- **949-maqam-road** — a microtonal **Arabic maqam** instrument; the quarter-tone slides a piano can't make. The non-Western-pitch surprise.

## Why this shape (cycle 553)
- **WIDE** (alternating after two DEEP nights): the 2026-06-25 jury is mostly a *spread/ban* signal, and its DEEP targets were already handled (depth → 551) or mismatched (AI-chain hits your voice-gen ban; WebRTC is a kids piece). Three fresh-tag bets beat one more harmony concept.
- All three made **pitch the idea** (jury #2) on **fresh surfaces** (WebGPU-compute / WebGL2 / Canvas2D — none three.js) with **fresh inputs** (keyboard/MIDI/maqam — none mic). 947 implements *today's* research: a May-2026 paper re-deriving the Sethares/Helmholtz dissonance curve (consonance is a property of the timbre's spectrum, not abstract ratios).

## Open questions for Karel
- **Verification debt (jury #3 is right):** 947 is compile/lint/type-green but **not GPU/ear-verified** — no WebGPU/audio in the container (static-gen still blocked by the standing `EMFILE` fd ceiling; Vercel deploys fine). Worth running 947 + recent 927/942 on a real machine to confirm the WGSL compiles and the field reads as intended?
- **Resurrect 948 next adult fire?** Strongest answer to the long-form-with-memory gap and the most "composer's instrument" of the three.
- **Infra:** raising the container's ~4096-fd ceiling would let local static-gen (full `next build`) run again.
