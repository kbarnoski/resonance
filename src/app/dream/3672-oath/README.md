# 3672 · Oath

**The one question:** *What if composing meant making vows you can never take
back — every note you commit locks into an eternal loop, no undo, no erase — so
the piece you end with is the sum of every choice you dared to keep?*

Oath is a **real-consequence instrument**. It models no physical system. All of
its stakes come from a single design decision: **irreversibility**. You can
permanently vow a beautiful note or an ugly one, precisely in tune or daringly
sharp, and it stays for the life of the piece. That weight is the whole
instrument.

---

## The mechanic

- A luminous **ceremonial ring** (Canvas2D) is one looping bar — **8 beats at
  100 BPM**, ~4.8 s per revolution. A playhead sweeps it continuously, driven by
  the audio clock so sound and image never drift.
- **Audition (free, reversible).** Hold one of `A S D F G H J K` (low → high) to
  *hear* a soft "ghost" voice immediately and see a bright cursor ride the ring
  at the playhead. Let go and it's gone; nothing is committed.
- **Continuous pitch (no safe scale).** The keys are only *starting* pitches (a
  D-major-ish spread). While a key is held, **`↑` / `↓` bend the pitch
  continuously** — up to ±350 cents — so you can commit a precise, possibly
  out-of-tune value. There is deliberately **no pentatonic / just-intonation
  net**: the ability to vow a wrong pitch is the point.
- **Commit (permanent).** Press **`Space`** while auditioning to weld the live
  note to the ring at the current beat (quantized to 1/16 for groove). It
  becomes a looping voice that sounds **forever**. There is **no undo, no delete,
  no clear** — not hidden, simply absent.
- **A decision made legible.** While auditioning, a real-time consonance readout
  compares the live pitch against the already-committed canon. The cursor glows
  **violet** when it agrees and gains a **dim red edge** when it will clash. You
  always know the weight *before* you swear. There is no fail buzzer — only
  honest consequence.
- As the ring fills, the piece thickens into a canon of your permanent choices.
  **Minute three genuinely differs from minute one**, because commits accumulate
  irreversibly.

Each committed vow is drawn as a solid engraved glyph welded to the ring; it
pulses each time the playhead crosses it, and announces its birth with a short
expanding ripple.

---

## Audio pipeline (Web Audio, all client-side, no samples, no network)

```
committed pluck voices ─┐
live ghost audition ────┼─▶ bus ─▶ DynamicsCompressor ─▶ masterGain(0.28) ─▶ destination
```

- **Look-ahead scheduler.** A ~25 ms `setInterval` schedules sample-accurate
  WebAudio events ~100 ms ahead of `AudioContext.currentTime` — the standard
  "[A Tale of Two Clocks](https://web.dev/articles/audio-scheduling)" pattern.
  Each vow keeps a loop-occurrence cursor (`nextK`) so it is scheduled exactly
  once per revolution.
- **Committed voice** = a short pluck: a triangle body + soft sine octave through
  a decaying lowpass, fast attack, ~1 s tail.
- **Ghost voice** = a single persistent oscillator pair held at low gain (0.07),
  its frequency slid with `setTargetAtTime` so the continuous bend is audible.
- The `AudioContext` is created/resumed only inside a user gesture (the first key
  or the Start button) for iOS. Everything is compressed and capped so nothing
  peaks harshly.

---

## Self-demo (seeded autopilot)

On start — or after ~1.5 s of idle — a **seeded autopilot** auto-commits a short
canon (four consonant chord tones plus one deliberately daring, sharp vow) staged
over ~2.5 s, so a hands-free reviewer *hears* the canon build and *sees* vows
engrave within a second or two. The autopilot uses a local **`mulberry32`** PRNG
seeded by the constant `0x3672` (never `Math.random`); timing is derived from the
audio/`performance.now` clock (never `Date.now`). **The first real keypress hands
control over** (the header flips `AUTO → YOU`) and permanently stops the
autopilot.

---

## References

- **Tehching Hsieh — *One Year Performances* (1978–1986).** Art as irreversible
  lived commitment: once the year begins there is no editing it, only living it.
  Oath borrows that ethic — a commit is a lived, unrepeatable act.
- **Terry Riley — *In C* (1964).** Music built from looping additive cells that
  accumulate into an emergent whole. Each vow here is such a cell, added and
  never removed.
- **"You can't un-ring a bell."** The folk idiom for irreversibility that names
  the instrument's single rule.

---

## Constraints honored

- Audio-visual on the primary action; self-contained in this folder; zero new npm
  dependencies (Web Audio + Canvas2D only); no server route, network call, or
  secret.
- Tailwind semantic tokens for all chrome; violet is the only brand accent; raw
  hex/white appears **only** inside the canvas art layer.
- Degrades gracefully: with no Web Audio it shows a `text-destructive` notice and
  keeps the ring turning.
- Full teardown on unmount: cancels rAF, clears the scheduler + HUD intervals,
  stops/disconnects all oscillators, removes key listeners, and closes the
  `AudioContext`.

## Not verified in this build container

The container has no audio device and no interactive keyboard, so **actual sound
output and live keypress interaction were not exercised** here. Only static
compilation (TypeScript + ESLint) is checked. The scheduler math, consonance
readout, bend range, and autopilot script are written conservatively but have not
been heard.
