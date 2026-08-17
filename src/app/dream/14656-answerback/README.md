# 14656 · answerback — a duet with your recorded self

## The ONE question

**What if playing a phrase called back an ANSWER from your own recorded self?**

A call-and-**response** duet with Karel's own catalog. He plays a short phrase
on a MIDI keyboard; when he pauses, the machine ANSWERS by searching across his
real recordings for the phrase whose melodic shape best matches what he just
played, and plays that phrase back — sliced from the **real decoded audio** of
that take. His call, the catalog's answer, his call again: he is composing a
_conversation_ with his recorded self, not re-arranging a single take.

This is the lab's first real-time call-and-response **retrieval** duet, and its
first MIDI-input piece — Karel is a pianist, so MIDI is his instrument.

## The retrieval / contour-matching approach (the core)

1. **Bank (precomputed).** On Start we load a small, varied subset of the real
   catalog (Interplay, Welcome Home, 2019, Rebound, Snowflake) — decoded audio
   buffer + `loadTrackAnalysis` for each. From each track's time-sorted
   `notes[]` we slide windows of 4 / 6 / 8 consecutive notes and store, per
   candidate: its melodic **contour** (the sequence of pitch intervals), a
   12-bin **pitch-class histogram** (key affinity), and — crucially — the exact
   **start/end time** of that phrase inside the source recording. See
   `catalog.ts` (`buildBank`). Windows shorter than 0.35 s or longer than 5.5 s
   are dropped; the bank is capped for load time and memory.
2. **Capture.** Live note **onsets** (MIDI, QWERTY, or the demo) accumulate into
   a phrase. A ~700 ms silence ends it (`PAUSE_MS`).
3. **Query.** The phrase becomes the same representation: contour + pitch-class
   histogram (`buildQuery`).
4. **Score.** Every candidate is scored (`scorePhrase`):
   `0.55 · contour + 0.33 · pitch-class + 0.12 · length`. Contour similarity
   resamples both interval sequences to a fixed length and takes cosine
   similarity (so a 3-note call and an 8-note phrase are comparable by _shape_);
   pitch-class similarity is cosine on the histograms; length affinity keeps a
   short call from always being answered by a long run.
5. **Pick & play.** We take the top-8 and draw from them weighted toward higher
   scores, excluding the previous answer, so the duet stays varied instead of
   latching. The chosen phrase's time-slice is played from the real
   `AudioBuffer` via `AudioBufferSourceNode.start(when, offset, duration)` with
   a short fade envelope (no clicks), through `createSafeMaster` (`AnswerPlayer`).

**No synthesis anywhere.** The answer is real recorded audio. Karel's live call
is deliberately **visual-only** — never voiced by an oscillator (rule-compliant
option (a)). Playing a new note while an answer sounds interrupts it: his turn.

## Input — Web MIDI first, always-playable fallback

`midi.ts` requests `navigator.requestMIDIAccess` (feature-checked, wrapped in
try/catch) and wires every input's `onmidimessage` for note-on (`0x90`, vel > 0)
/ note-off. The connected device name shows in the status badge. In parallel the
**computer keyboard is always live** (`a s d f g h j k l` = a diatonic-ish
octave, the row above for sharps, `z x c v b n m` a lower octave), so the piece
plays on any machine. If MIDI is unsupported or blocked the badge says so calmly
in `text-muted-foreground` and falls back silently. A **"Play me a demo call"**
button fires a canned phrase so a reviewer with neither MIDI nor patience sees
the whole loop instantly.

## The stage — three.js (WebGL)

`scene.ts` renders two facing "voices" across a gap: a **warm** amber organism
(left) for his call and a **cool** teal organism (right) for the answer — a
two-hue dialogue, deliberately away from the lab's usual violet-on-black. Each
is an icosahedron point-cloud displaced in a vertex shader; his form flares on
every note, the answer form blooms driven by the live audio analyser. A strand
of light between them carries a travelling pulse — outward-faint while he plays,
a bright pulse crossing _back_ from the catalog when it answers — so the
turn-taking reads spatially. WebGL-unavailable shows a graceful
`text-destructive` notice.

## Named reference

The **query-by-humming / query-by-contour** MIR retrieval lineage and the
call-and-response tradition. Kin to the **Infinite Jukebox** (Paul Lamere, 2012)
— navigating a recording by self-similarity — but here it retrieves an answer
_across a catalog_ rather than within one song.

## Next-cycle ideas

- **Concatenative call (option b):** voice his live notes with real grains too,
  so both halves of the duet are his timbre.
- **Harmonic answering:** score against the chord track / key signature so the
  answer also fits the harmony he implied, not just the melodic contour.
- **Memory:** let answers seed the next query (an evolving chain), or bias away
  from tracks already used so the whole catalog gets pulled into the conversation.
- **Bigger bank, lazy loaded:** stream more of the 16 tracks in the background
  after the first answer, widening the pool without slowing the first turn.
- **DTW instead of resampled cosine** for contour, to reward local alignment of
  ornamented phrases.
