# Morning digest — last updated 2026-06-17 (UTC) · cycle 451

## New since yesterday
- **🕺🔊 [677-presence-field](https://getresonance.vercel.app/dream/677-presence-field)** — *"Presence Field."* Step back from the screen and your **whole body, tracked as a luminous skeleton, conducts a SPATIAL ensemble** — each limb is a voice placed in 3D around you (its own HRTF panner), so spreading and raising your arms literally **sweeps the music through the room**. Spatialization *is* the instrument: where your body is becomes where the sound is. Slow drifting D-Dorian harmony (no pentatonic), three.js glowing room. **Why open it:** it's the lab's **first adult installation / room-presence piece** — the single biggest untouched first the jury has named *three times running* ("zero embodied-spatial builds still"). Best on headphones.
- *2 more body→spatial-audio explorers built this fire — banked, see IDEAS §451 (both demoable, fast to resurrect).*

## How this cycle ran (orchestration)
- **DEEP fire, 3 parallel builders** — ONE concept (body-presence → spatial HRTF ensemble) via three body-sensing techniques: **677 pose/skeleton** (three.js) · **678 frame-diff motion-field** (no-ML, WebGL2) · **679 selfie-segmentation envelopment** (WebGL2). Shipped 677; banked 678 + 679.
- **Why 677 won:** the most literal *installation room* (a body in a 3D space placing voices at each joint), the scarcest renderer (three.js, 0× in the last 10), and its **glance path needs no camera and no MediaPipe** — an idle preview + auto-demo run a synthetic body through the room on their own. (678 is the bulletproof no-dependency twin — banked ⭐ as the safest resurrect.)
- **Mode note:** 448/449/450 were all WIDE → DEEP was due ("alternate deliberately"), and "massively bigger concept" wants one ambitious idea, not three small ones.

## In progress / partial
- None. Clean tree; one commit this cycle. Build verified (487/487 pages, exit 0).

## Research findings worth a look
- **RESEARCH §451** — *spatialization itself is the immersion* (arXiv:2601.22082, Jan 2026): placing sound in 3D around the listener measurably raises the felt *sense of presence* — it's the payload of a room piece, not a garnish. Plus "Sounding Bodies" (pose→spatial sound) and online spatial sonification (Dec 2024). This is what bent the build away from "a pretty body viz" toward "your body moves the sound's *position*."

## Open questions for Karel
- **677 needs your ears + a body** (sandbox has no camera/audio): does the joint→HRTF placement actually read as voices moving *around* you? HRTF front/back cues are much stronger on **headphones** than speakers — worth a headphone test.
- This lands the *embodied / get-off-the-couch* reading of "off the glass." The *audio-first / no-screen* reading is already served (669/666/655). Which "off the glass" do you want more of next?
- The two banked twins are ready: **678** (no-CDN, bulletproof) and **679** (envelopment-by-approach). Want either shipped as a cycle-2 of the spatial-room thread?
