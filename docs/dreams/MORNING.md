# Morning digest — last updated 2026-07-29 (cycle 949, WIDE)

> **The jury's story yesterday: the fail-state rut healed, but it flipped into a *no-stakes* one (11 of the last 12 have no win/lose), and touch/pointer has been the top input three windows running. So tonight went WIDE on the exact fix — three divergent instruments, none touch, each PLAYED with a real consequence — and shipped the lab's first hardware wire.** See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3720-relay](https://getresonance.vercel.app/dream/3720-relay)** — **the lab's FIRST Web MIDI hardware input: a one-take recording desk where TIMING is the whole stake.** A click runs. Every note — from a real MIDI controller, the QWERTY home row, or a self-playing AUTO demo — is judged on one thing: how close to the click you landed. On-beat (±55 ms) → a clean **violet** mark that gilds the loop; off → a permanent **red scar** at its real offset that roughens it. You get **20 commits**; the counter only falls; at zero the take **seals and loops forever** — clean where you were tight, scarred where you rushed. No undo. **Plug in a MIDI keyboard if you have one — this one's built to be played on your rig.**

## Why this one
It answers the jury's two loudest notes at once: it brings **real consequence back without a physics textbook** (the stake is your own timing under a finite, irreversible budget — it models nothing), and it **gets off touch onto a wire** — the still-zero MIDI/OSC hardware path, which is your stated live-performance priority. It also uses the scarce **Canvas2D** output the jury asked to protect, not another shader.

## Also explored this WIDE cycle (built + banked, not shipped — IDEAS §949)
- **`3728-conjure`** (⭐⭐ HIGH) — **hold a chord-shape in the air or it decoheres to noise.** Real MediaPipe **hand-landmark** tracking (21 points, not optical flow) → a coherent WebGL2 lattice that dissolves the instant your hand drifts. The close 2nd; teed up for the next camera/body window (answers the jury's hand-landmark ask, feeds the loved `3416-baton` cluster).
- **`3712-steady`** (⭐⭐) — **hold your hand physically still or the tone frays; a phrase held steady commits to a permanent loop.** Device-motion (accelerometer) + three.js plumb-line. Non-touch, real stakes; wants a phone-in-hand window.

## Research (RESEARCH §949)
- **Web MIDI is shipping and ready** (Chrome/Edge/Opera) — hardware knobs/keys straight into the browser — plus the accelerometer-gesture-to-MIDI lineage (Source Audio *Hothand*). The freshest synth papers (*Sonify Anything*, *PAVAS*) are both physics-model pieces — the rut the jury banned a relapse into — so logged, not built. Chain: today's research (the wire/body input class) → today's build (`3720-relay`, direct).

## Open questions for Karel
- **Does clean↔scar read as *musical stakes*?** Built headless — it needs your ears. Does an on-beat note audibly gild and an off-beat one audibly roughen, and is ±55 ms the right tightness? Play a take to zero and see if the sealed loop feels earned.
- **Does a real MIDI controller wire up on your rig?** The Web MIDI path is built but untested against hardware here — plug in and check the badge names your device.
- **Next: ship `3728-conjure` (hand-landmarks) on a camera window, or push installation/spatial (#4, still 0×)?** Say the word.
