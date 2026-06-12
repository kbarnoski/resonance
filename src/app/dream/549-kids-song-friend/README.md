# 549 · A Friend Made of Songs

> Kids "Companion / Presence" spine — cycle 2.

## Who it's for
A 4-year-old (and the grown-up nearby). It is meant to be sung to, not tapped.
No reading required — the friend has a face, talks in tiny sentences, and reacts
to a voice.

## The "what if"
**What if a child's creature were LITERALLY MADE of the songs they've sung to
it** — its visible body is the drawn shape of every melody it remembers — and it
keeps those songs forever, across days, singing them back to you, *changed*, each
visit?

This extends an earlier piece (518 "living ember") that only remembered a vague
humming *energy* within one session. Here the friend remembers musical
**content** — the actual sung pitch sequence — persists it across calendar
visits, and draws its body directly from those melodic contours. The child can
literally **see** their songs in their friend's shape, and it is visibly bigger
tomorrow. It does not grow on a timer (another piece already ages a plant on a
clock); it grows because of *what the child sang*.

## Subsystems
- **`audio.ts`**
  - C-major pentatonic note table (~2 octaves, 13 degrees).
  - Forgiving **autocorrelation** pitch detector tuned for a high, breathy,
    noisy child voice: RMS gate, silence trim, parabolic-interpolated peak,
    clarity-based confidence. Low confidence + present RMS → a "babble note" so
    *any* vocalization still teaches.
  - `freqToPentaIndex` quantizer and `indexToHue` (pentatonic degree → warm hue).
  - **Kid-safe master chain**: `gain → lowpass(8 kHz) → DynamicsCompressor`
    (brick-wall limiter, ratio 20, threshold −10 dBFS) `→ destination`. Soft
    attack/release on every note; no sudden-loud or harsh sounds.
  - Warm pentatonic voice (detuned sine + triangle chorus).
- **`memory.ts`** — persistent companion store in `localStorage`
  (`resonance.dream.549`, all access wrapped in try/catch). Holds the song
  library, visit count, **monotonic `totalNotesEver`**, `lastVisit`, and a
  simulated `day`. Greeting logic, calendar-day detection, song commit, seed.
- **`page.tsx`** — voice capture loop, SVG creature, recall playback, demo
  affordances, idle animation.

## Cross-day persistence model
- Every committed song is `{ notes: pentatonic indices, ts, day }`.
- On load: stored memory → the friend greets the child and is already bigger;
  if `lastVisit` was an **earlier calendar day**, it surfaces it
  ("you taught me N songs… I remembered!").
- `totalNotesEver` only ever increases — it drives visible growth, so the body
  cannot shrink even if storage is edited.
- The **"✨ pretend it's tomorrow"** button (honestly labelled as a demo
  shortcut) bumps the simulated `day` + visit count, re-runs the greeting,
  visibly grows the body, and plays a re-woven, transposed, slightly slower
  recall — so a reviewer sees the cross-day change instantly instead of waiting.

## How the body is drawn from contours
The creature's SVG body is a **pure function of the song library**:
- Each remembered song becomes one **petal** radiating around a friendly core.
  The petal is a teardrop whose outward width is modulated by that song's pitch
  contour (higher notes bulge the leaf, with a wobble traced from the melody).
- More songs → more petals; longer melodies → longer petals; the average pitch
  of a song chooses its **hue**.
- Growth scales with `totalNotesEver` and visit `day`, so the friend is visibly
  bigger after more singing and after more visits.
- A face (two blinking eyes, cheeks, a mouth that **opens when it sings**) makes
  it read as a *character*, not a graph.
- During recall each note **highlights its petal** (brighter fill, thicker
  stroke) and opens the mouth, so the child sees which song is being sung.
- Idle breathing/blinking is driven by `requestAnimationFrame` mutating SVG
  attributes directly (no per-frame React re-render); blinking uses a slow state
  cadence. Soft glow via an SVG `<filter>` (`feGaussianBlur`).

## Degradation
- **First ever load** (no stored memory) **or mic denied** → 1–2 charming
  pre-seeded "yesterday's songs" so the friend already has a body and sings
  hands-free from frame one, with zero permission.
- **Mic denied** → a warm `text-rose-300` note; the friend keeps living and the
  "sing back" / "pretend it's tomorrow" buttons still work.
- **Zero songs guard** → the friend always keeps a cute base body.
- **Private mode / quota** → `localStorage` failures are swallowed; the friend
  simply lives for the session.

## References
- **Tamagotchi** (Aki Maita / Bandai, 1996) — the persistent virtual companion
  that lives on across power cycles and asks to be cared for; the spine here is
  the same emotional contract (*it remembers you, it missed you*), but the care
  currency is **song**, not feeding.
- The idea that **a child's drawing of a creature *is* the creature** — the body
  is not a representation of the songs, it is literally built from them.
- **Brian Eno**, long-form non-repeating / generative music — the recall is
  re-synthesised and woven (two days' melodies interleaved, transposed, slowed)
  so the friend never sings back exactly the same thing twice.

## Next-cycle deepening
- True per-utterance rhythm capture (note durations, not just pitch order) so the
  petal traces *timing* as well as pitch.
- A YIN detector with octave-error correction for steadier pitch on very young
  voices.
- Let the friend **invent** a new little song from fragments of the child's
  library and offer it back as a gift.
- Persisted "moods" — songs sung softly vs. loudly tint petals differently.
- Multiple friends / a shared family memory; export the creature as a keepsake.
- Sleep/wake state tied to real time of day.
