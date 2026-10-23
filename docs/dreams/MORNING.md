# Morning digest — last updated 2026-10-24T00:45Z

> **Tonight the lab closes its eyes — and it's exactly what you asked for.** Today's jury verdict (`JURY.md`, 2026-10-23) landed while I was building and its headline is *"ship the eyes-shut piece you already built."* This fire does precisely that: `stillpoint`, the no-screen / audio-only piece, banked twice and now shipped. DEEP cycle — one concept (*the eyes-closed instrument*) raced on two control surfaces; I shipped the one you can actually do with your eyes shut.

## New since yesterday — `24600-stillpoint`
- **Headphones on, eyes closed: one of your takes becomes four voices on a dome around your head, and your body navigates it.** The recording is split into four registers — bass / low-mid / mid / air — and each is HRTF-panned to a fixed spot in the room around you.
- **The field is world-locked.** Turn your body and the voices stay put — you face different ones, and the one you face comes forward, louder and brighter. **Lean toward it** and it comes *closer in distance* (real 6DoF translation of your listening position, not a volume knob — named ref: Chen & Boren, AES-159 2025, whose lean-adds-distance finding this embodies).
- **Why open it:** put on headphones, press Begin, and **close your eyes**. On a phone, turn and tilt your body. On a laptop, drag or hold the arrow keys (← → turn, ↑ ↓ lean). Do nothing and the whole field slowly drifts each voice through the front. The screen stays almost dark on purpose — the sound is the piece.

## Needs your 30-second check (headphones)
- **The binaural field can't be heard up here** — no audio device in the cloud. The input→sound wiring is fully traced and clean (tsc/eslint/QA all 0), and the keyboard/pointer path is verified. What wants *your* ears: put on headphones and confirm the four voices actually sit *around* your head and that leaning pulls the faced one closer. On a phone, the neutral-tilt point may want a small calibration tweak — tell me if it feels off. Ships *demoable*.
- **Also still open from the jury: verify `24360-duet`'s two-body camera path.** The jury is explicit — don't build Duet cycle 2 until you've confirmed the live two-person webcam path works. Bring a second person into frame (seated, waist-up) for ~30 sec when you can.

## Also built this fire (banked — see IDEAS.md §1316)
- **`innerear`** — the **camera + long-form** sibling: reach your arms *wide* to fling the voices out around the room or draw your hands *in* to gather them close, over a genuine ~6-minute field that migrates, swells and rebalances on its own so minute 5 ≠ minute 1. Lost only because camera-pose can't be verified headless and fights the eyes-closed premise — but its long-form evolution engine is the richest in the window and reusable.

## One thing I'd like your call on
- **Camera directive vs. no-screen nights.** The standing rule says every winner should be camera-tracked; a true eyes-shut piece can't be (you'd have to face the webcam). Tonight I followed the jury's "no screen" ask and shipped the device-orientation version. If you'd rather the camera rule bind even here, say so and I'll ship `innerear` next.

## Where next? (reordered to honor today's jury)
1. **Verify Duet's two-body webcam** — the jury says confirm cycle 1 works before extending it. Your 30-sec check unblocks everything downstream.
2. **`innerear`** — the camera-embodied / long-form reading of tonight's eyes-closed field.
3. **A fourth warm technique** — the jury wants the warm lane protected with a *new* technique (a meditative void that empties, slow luminance drift, or `throughlight`'s tunnel-to-light, banked §1315).
4. **Duet cycle 2** — true two-camera / remote two-person via `peerSync`, *after* cycle 1 is verified.
