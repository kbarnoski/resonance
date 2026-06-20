# 770 · Answering Room

**The one question:** *What if Karel's real recorded "Welcome Home" piano kept
playing as the SOLOIST, and a real-time machine "live music agent" listened to
it and accompanied it — harmonizing underneath and answering in the gaps
between his phrases — like a duet partner who arrived to play along?*

You press **Begin**. His recording plays whole, as the lead voice. A second,
synthesized voice arrives, listens, and plays along: it lays a warm pad under
the chord his hands are making, and when he pauses, it answers into the
silence. Then it rests again and waits for him.

## How it works

Three roles, one room.

### The soloist — his recording, whole
`audio.ts` fetches the real recording (a read-only public GET) and plays it
through a single `AudioBufferSourceNode`. It is **never** chopped into grains,
never granulated, never resynthesized. It is the human in the room. If the
fetch fails, we synthesize a warm ~16s lyrical piano-ish phrase offline
(`OfflineAudioContext`) and play *that* instead, with an honest emerald
"synthesized fallback" badge — the room is never silent.

### The listener — machine listening (score-following his playing)
`listener.ts` taps the soloist's signal with an `AnalyserNode` (fftSize 2048).
Each frame it:

- folds the FFT magnitude bins into a **12-bin chroma vector**, smooths it, and
  correlates it against all 24 major/minor triad templates → the **chord under
  his hands** plus a consonance/tension estimate;
- tracks **energy** (band RMS) and **spectral flux** to sense when he is
  playing;
- runs a small state machine that detects **phrase gaps**: sustained activity
  followed by a short quiet window means *"his phrase just ended — my turn."*

### The agent — a second, synthesized voice
`agent.ts` is the accompanist. Two layers:

1. a **warm harmonizing pad** (a few detuned sine/triangle voices, lowpassed,
   slow attack/release) retuned to the detected chord and swelling gently with
   his energy — it sits *under* him and never fights;
2. a **sparse answering voice** (a soft FM bell) that fires **only in his
   gaps**, plays two-to-four notes in the detected key, loosely *inverts* the
   contour of his last gesture, and lands on a chord tone to resolve. It mostly
   rests; the **company** slider moves it from shy (rare, quiet) to talkative
   (more notes, shorter spacing).

### The visual — minimal and warm, on purpose
DOM/CSS plus a small `<canvas>` — deliberately **not** a fullscreen shader. Two
facing warm glows on a hearth-lit ground: *him* (breathing, scaled by his
energy) and *the answer* (lit up only while the agent is answering), joined by
a faint duet thread. The detected chord name is shown large. The restraint is
the point — let the sound carry it.

## Lineage

- **CHI 2026 "live music agents"** — interactive systems that listen and play
  *with* a human performer in real time.
- **Christopher Raphael, *Music Plus One*** — score-following / automatic
  accompaniment that follows a live soloist.
- **George Lewis, *Voyager*** — an improvising machine "co-performer" that
  listens and responds rather than merely accompanying.

## How this differs from prior lab listen-pieces

Earlier pieces took *live mic* input or *granulated* his recording into a
texture. This one does neither. His recording is treated as a **live soloist
playing whole**, and the machine is a **separate, synthesized duet partner**
that score-follows him and answers in the gaps. The human voice stays intact;
the machine adds a second voice rather than reprocessing the first.

## Next-cycle deepening

- Real beat/tempo tracking so the answer phrases land *in time* with him, not
  just *after* him.
- Seventh chords and inversions in the chord fit for richer harmony.
- A short memory of his motifs so the agent can quote and develop them, not
  just invert the last gesture.
- Anticipation: begin the pad swell a beat before a likely cadence.
- A gentle "trading fours" mode where the agent takes longer, more
  compositional turns.
