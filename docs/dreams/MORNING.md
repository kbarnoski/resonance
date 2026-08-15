# Morning digest — last updated 2026-08-15T~10:00Z (cycle 1141, WIDE)

## New since yesterday
- **[13360-handreader](https://getresonance.vercel.app/dream/13360-handreader)** — **watch your own hands play.** It reads your real note-roll and reconstructs a plausible **two-hand keyboard choreography in 3D** — two luminous hands gliding across a lit 88-key stage, keys hinging down on your *actual* onsets, strike depth scaling with how hard you hit. Pick a track (defaults to *Bath*) and press play; the hands stay locked to your real audio. **Why open this:** the lab has now drawn your **harmony** (vocabularygraph), your **timing** (rubatoline), and your catalog as **space** (resonantrooms) — this is the first time it's drawn your **playing itself, as motion**. Off every recent style (no shader field, no ink-on-paper — a warm 3D stage). On a muted phone the hands are already moving on the first frame. Honest caveat: the left/right split and finger assignment are *plausibility* heuristics, not a recovery of your true fingering — it reads as playing, it isn't a mocap of you.

## Explored this fire (WIDE — 3 unrelated directions, 3 renderers; 2 banked, not shipped)
- Three ways to "read your real playing as something new," each a different renderer. Shipped handreader as the freshest/most different-in-kind.
- **voiceweave** (⭐⭐⭐ resurrect-strong) — your **counterpoint** untangled: a real pitch-proximity voice-separator pulls your polyphony into 4–5 continuous **braided strands** (SVG), so you watch your inner voices cross exactly where they do. Best next step: **fuse it into handreader** so each finger carries its voice's color. IDEAS §1141.
- **scoreterminal** (⭐⭐) — your music read out as a **Ryoji-Ikeda data-terminal**: the chord now, key/tempo, a bass↔treble register histogram and a dynamics meter, all in animated monospace type — no drawing surface at all. IDEAS §1141.

## Research finding worth a look
- **2026 piano-MIR is capturing the pianist's *body* as a first-class modality** — SKY-Piano (arXiv:2607.27296, ISMIR 2026) is 11h of synchronized motion-capture + video + audio + MIDI; Profy (arXiv:2606.10627) visualizes the physicality that separates expert from novice technique. That's the seed for handreader: your performance as *motion*, reconstructed from your note-roll. RESEARCH §1141.

## Open questions for Karel
- **Sound-on / real-device review is the biggest lever** — handreader really wants your machine: does the choreography read as *your* playing, and does three.js render on your hardware? Same standing ask: vocabularygraph (centrality), rubatoline (onsets), resonantrooms (headphones).
- **Where next?** — take handreader deeper by **fusing voiceweave into it** (fingers colored by voice) + adding a velocity/dynamics read so you *see* your touch; OR continue vocabularygraph's cycle-2; OR finally chase the AI-pipeline chain (music → image → video, needs a FAL_KEY budget + your go-ahead). 1142 is a DEEP fire by rotation.
