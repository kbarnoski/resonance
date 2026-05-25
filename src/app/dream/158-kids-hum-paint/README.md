# Voice Painting — `/dream/158-kids-hum-paint`

**For**: kids (3+) · parents · anyone with a voice  
**Built**: Cycle 186, 2026-05-25  
**Status**: demoable

---

## The question

What if singing was painting?

---

## How it works

Sing or hum into the microphone. Your voice appears on screen as a
glowing colored trail. The pitch of your voice determines where the
trail goes: **high notes fly to the top of the screen, low notes drift
to the bottom.** Every pitch gets its own color (low = warm amber/violet,
high = cool cyan/rose).

The painting accumulates over the session — a horizontal scroll from left
to right. Each new stroke connects to the previous one, making smooth
curves when you glide between notes and hard turns when you jump.

Press **▶ Hear it!** to play back up to 56 sampled notes from your
painting as sine tones — your session replayed as a melody.

**No mic?** Tap "Watch the demo" — Twinkle Twinkle draws itself
automatically. The color pattern for the opening C–C–G–G–A–A–G is
unmistakable: flat amber → jump up to amber → step higher → highest
flat stripe. Pitch is shape.

---

## Technical notes

**Pitch detection**: autocorrelation on a 2048-sample time-domain
buffer (Web Audio `getFloatTimeDomainData`). Search restricted to
lags corresponding to 75–1100 Hz — the human voice range — making
it fast enough to run every animation frame (≈60 fps). Confidence
threshold 0.72; below that, returns 0 (silence / noise). Works for
humming, singing, whistling, and blown notes.

**No mic → no feedback**: `MediaStreamSource` is connected to
the analyser only, **not** to `AudioContext.destination`. No
speaker feedback regardless of device.

**Painting**: `Canvas2D` accumulation (no `clearRect` each frame).
X position advances at 1.4 px/frame (≈84 px/sec). When the trail
reaches the right edge, a faint separator line appears and the
cursor wraps to the left — the painting builds up in horizontal bands
over a long session, like a spectrogram you painted with your voice.

**Playback**: up to 56 evenly-sampled dots from the recorded session,
played as sine tones at 48ms spacing (≈2.7 second arc). Oscillators
are scheduled via `AudioContext.currentTime` for glitch-free playback.
A new `AudioContext` is created on demand if the prototype was opened
in demo mode (user gesture required by browsers).

---

## What makes this different

157 prior kids prototypes use **touch** as the primary input (tap, drag,
hold, draw). This is the first where the child's **voice** is the instrument.

A 3yo who doesn't know any notes can hum and watch the trail jump. A
parent can sing a scale and watch the colors climb. An older child can
try to recreate the Twinkle Twinkle shape from the demo by matching the
color/height pattern with their own voice.

The painting is a memory of what you sang — the same role that
`152-kids-star-paint` plays for drawing. Unlike star-paint (which plays
back automatically after 16 seconds), voice-paint gives the child agency:
you decide when to hear the replay.

---

## Design decisions

- **Y = log pitch**: log-scaling frequency makes equal intervals look
  equal on screen. A perfect fifth looks the same in any octave.
- **Demo notes play the FULL Twinkle Twinkle loop**: the demo
  keeps cycling so the painting fills the canvas — Karel sees the full
  visual at `/dream/158-kids-hum-paint` within 30 seconds of opening.
- **No note names visible**: staying true to the KIDS.md principle of
  "no reading required." Color IS the language here; a parent can name
  notes if they want, but it works without labels.
- **Always-visible cursor dot**: a faint white dot marks the current
  position even in silence — the child knows the prototype is still
  listening.
- **"▶ Hear it!" always visible**: even before any humming, so the child
  can see what's coming. Tapping it on an empty canvas does nothing.

---

## Ideas for polish / next iterations

- Add a faint note-name label (C, E, G…) that flashes briefly when pitch
  first locks on — educational mode for parents
- "Mirror" mode: paint + its vertical mirror simultaneously (like
  `104-kids-mirror-draw`)
- Color the playback cursor to match each note's hue as it travels
- Ambient pad that tracks the detected pitch in real time (so the screen
  is never silent while singing)
