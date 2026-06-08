# Morning digest — last updated 2026-06-08 (UTC) (cycle 358)

> **Two jury provocations, one fire.** This kids cycle answers **#1** ("subject = rhythm/timbre/noise, NOT tuning — the lab fled D-Dorian into a just-intonation monastery") *and* **#6** ("there's still no MediaPipe face-tracking piece") at once. Went **DEEP** (one big concept — *make a BEAT with your face, not a tune* — three technical attacks) and shipped the most kid-legible one. See `docs/dreams/JURY.md`.

## New since yesterday
- **`/dream/423-kids-face-beat` — Face Beat 🥁** (kids 4+). *Press Start and make faces at the camera.* **Open your mouth 😮 = a kick boom · eyebrows up 🤨 = a hi-hat · big smile 😁 = a shaker · puffed cheeks 😗 = a tom · wink 😉 = a rim.** It's the lab's **first face→PERCUSSION** piece — every prior face/voice toy made *pitch*; this one makes a **drum kit**, so the subject is **rhythm, not tuning** (no scale, no chord). Every face is quantized to a steady 100 BPM groove, so even a flailing toddler locks into a real beat. Rendered in raw **WebGL2** (Canvas2D & SVG were both over-used, so I banned them this cycle). No camera? It plays itself in ~2s via a ghost face.

## Also explored (DEEP fire — 3 builds, 2 banked in IDEAS §358)
- **`424-kids-face-jam`** — face → continuous **noise/foley texture** (mouth = whoosh, brows = fizz, scrunch = crunch), three.js point-cloud. The **"go weird"** sibling — pure timbre, no beat, no tune; honestly the strongest answer to your deeper "everything resolves to consonance" note, and it doubles as an *adult* Ikeda-ish texture instrument.
- **`425-kids-face-loop`** — face → a **looping beat that grows** (make a face to record a drum into an 8-step loop, add layers, it repeats forever). The one with **memory** — "I made this and it keeps going."

## Research finding worth a look
- The 2026 face↔audio research front is almost all going the **wrong way for us**: audio→*talking-face* avatars (lip-sync). Letting a face *make* sound live, in the browser, at play-latency is a quiet gap — that's the opening `423` walks into. Named anchor: **Expotion** (arXiv:2507.04955, 2025). (RESEARCH §358.)

## Open questions for Karel
- **Is the "rhythm/timbre not tuning" pivot what you wanted?** I read the jury as: stop making everything resolve to a pretty chord. `423` is pure percussion; `424` is pure texture. Tell me if this is the break you meant, or if I've swung too far from melody.
- **Which face sibling should I deepen next cycle?** I'd fold `425`'s **record/loop memory into `423`** (a "record mode" so the face-beat you make keeps playing) — or ship the weirder `424` foley texture. Your call.
- **Camera back-to-back, on purpose.** `419` (body) and now `423` (face) are two camera kids pieces in a row — because the jury named face-tracking the biggest untouched first. Say the word if you want me to swing away from the camera for a few.
