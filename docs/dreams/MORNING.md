# Morning digest — last updated 2026-06-05 (UTC), cycle 315

Open the lab: https://getresonance.vercel.app/dream

## ⭐ Open this first (adult — best with headphones)
- **[321-spectral-flight](https://getresonance.vercel.app/dream/321-spectral-flight)** — **fly through the inside of your own recording.** Press **Fly through his recording**: the app pulls one of your real *Welcome Home* piano tracks, runs the whole thing through an offline spectrogram, and turns it into a glowing 3D landscape — time stretching ahead of you, frequency rising, brightness = loudness — and the camera flies forward *locked to playback*. Drag or use arrow keys to steer; space to play/pause. *Why open it:* the "use my actual music" direction finally reaches the immersive layer — where 308 put your recording in spatial *audio*, this puts you **inside its spectrogram as a place** you pilot.

## Why this one won (3 explored, 1 shipped)
- **Your real music, the loved territory.** It pulls straight from your most-loved cluster — your real recordings (**227-paths-granular ❤️**, **163-paths-visualizer ❤️**) + immersive/spectral (**243-spectral-cloud ❤️**, **267-spectral-drift ❤️**). If `/api/featured` is unreachable at review it falls back to a synth bed and *says so* (rose label), so it always runs.
- **Diversity-clean under a tight constraint.** Canvas2D had hit 4× in the last 10 ships and was *banned* this cycle — 321 renders in **three.js** (a point-cloud you fly through). Fallback is A-natural-minor, not pentatonic.
- **Ambition 3/5:** 4 subsystems (real-stem fetch+decode · from-scratch offline STFT · three.js flythrough · transport-sync) + named refs (**Anadol *Latent City* 2026**, **Ikeda *data-verse***) + a specced cycle-2.

## Also explored this fire (WIDE — 2 more, banked in IDEAS.md)
- **322-strange-attractor** — a **Lorenz attractor synthesized at audio rate** in a custom AudioWorklet: the waveform you hear *is* the glowing butterfly you see; drag to push it from periodic into chaos. On your explicit "strange-attractor" wishlist — complete and ship-ready.
- **323-stillness** — a **Cage-style anti-instrument**: it blooms only when you're *quiet* and collapses at the first sound you make; it remembers your longest silence. **I've flagged this as the next adult build** — it's the boldest answer to the "too similar" note, because it *inverts* the always-on reactive form rather than swapping a sensor.

## Threads / what's next
- **Adult (317):** ship banked **323-stillness** (the conceptual inversion) — or **322-strange-attractor** (your wishlist). Or deepen **321**: spatialize the audio (fly *toward* a sound and it gets louder), branch the flight path, chain multiple tracks into worlds you fly between.
- **Kids (316):** ship banked **321-kids-seed-garden** (long-form, grows while away) or **322-kids-sing-up** (voice). *(Those kids slugs are banked labels — they renumber on ship; today's adult 321/322 are the committed ones.)*

## Open questions for you
- **AI-pipeline-chain** (image gen *inside* an AV piece) is still your most-wanted, never-built direction; it needs paid FAL generation and I won't spend autonomously. **Grant a per-prototype budget (e.g. $X/cycle) and I'll build it next adult fire.**
- **321 is build-verified, not browser-verified** — the open risks are by-eye: does `/api/featured` serve a Welcome Home track from prod (fallback covers the no), and does flying through the points read as a *place* vs. a fog? Worth a 30-second flight at review.
