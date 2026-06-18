# Duet with the Paths

**Trade fours with a shadow that answers you using grains pulled from Karel's own recorded piano — a concatenative reply, not an echo.**

## The one question

What if your duet partner answered you using the lab owner's *own* recorded
piano — trading fours with grains retrieved from his real album?

## How it works

This is the **concatenative / corpus-based** version of the duet partner.

1. **Load.** On `Begin` (inside the user gesture, so iOS/Safari unlocks the
   `AudioContext`), it fetches Karel's solo-piano recording from the existing
   read-only `/api/audio/<id>` route. The fetch logic is copied verbatim from
   the lab's proven loader: a 4s `AbortController` timeout, handling both a JSON
   `{url}` response (then fetching that URL for bytes) and a direct-bytes
   response, then `decodeAudioData`.
2. **Analyze into a grain corpus.** The buffer is sliced into a fixed grid of
   overlapping ~240ms grains (50% overlap). Each grain is tagged with a rough
   pitch (normalized autocorrelation → MIDI), an RMS loudness (silence is
   skipped), and a brightness proxy (zero-crossing rate). This is the CataRT-style
   descriptor analysis, kept deliberately lightweight.
3. **Answer concatenatively.** When your phrase ends (~750ms of silence after
   2+ notes), it derives an *answering line* from analysis of your phrase —
   complementary register, opposite contour, density matched to your playing,
   resolving onto consonant tones in **D Dorian**. For each note of that line it
   **selects the corpus grain whose estimated pitch is closest** and plays it via
   an `AudioBufferSourceNode`, nudging `playbackRate` to fine-tune the pitch, with
   a short attack/release envelope, scheduled into the gap. The reply is built
   from *his* piano grains — not a synth approximation, and not a replay of your
   notes.
4. **Offline fallback.** If the fetch fails (no network / sandbox / offline), it
   renders a soft synthesized piano-ish corpus with an `OfflineAudioContext` and
   answers from that instead, so the piece is fully alive keyless and offline.

## References

- **MACataRT** — arXiv:2502.00023 (Feb 2025), concatenative co-improvisation.
- **CataRT** — Diemo Schwarz's corpus-based concatenative synthesis.

## Input (no hardware required)

- **Web MIDI** — `navigator.requestMIDIAccess()`; note-on/note-off parsed;
  device name shown in an emerald badge; hot-plug via `onstatechange`; wrapped in
  try/catch for browsers without Web MIDI.
- **Computer keyboard** — `a s d f g h j k l` is a diatonic run in the current
  mode; `w e t y u o` are in-between/passing notes; `z` / `x` shift octave down /
  up. Auto-repeat is ignored.
- **On-screen mini keyboard** — large (≥44px) tappable keys for mobile / no
  hardware, pointer + touch.

## Provenance behavior

- Emerald **"Karel's piano 🎹 · N grains"** when his recording loaded.
- Amber **"synth fallback · N grains (offline)"** when it didn't.
- Emerald **"MIDI: <device>"** when a MIDI input is connected; otherwise an amber
  "No MIDI — use your keyboard or tap the keys" notice. All notices are kept at
  readable contrast (never dimmed).

## Output

A Canvas2D horizontally-flowing **piano-roll river**: rounded note-bars flow
right-to-left past a vertical now-line. Your notes are warm (amber→rose), the
shadow's grains cool (cyan→violet); pitch maps to vertical position. Driven by
`requestAnimationFrame`, mutating refs with no per-frame React re-render.

## Behaviors

- **Turn-taking / ducking** — if you play while the shadow is answering, it
  yields: scheduled grains are faded and stopped. You always have the floor.
- **Idle auto-demo** — on load and after ~6s of no input, it synthesizes a short
  human-ish motif (heard + drawn) and lets the grain-shadow answer, looping — so
  someone opening the page with no MIDI and no interaction immediately hears the
  call-and-response in his piano sound. Real input cancels the demo and it
  resumes after idle.

## Audio chain

Human voice is a warm 2-op FM e-piano panned **left**; the shadow is the grain
player (or synth fallback) panned **right**; a soft sustained binding pad sits
centered and low. Per-grain gain is kept low and concurrent voices are capped (6)
since grain players stack. The master chain ends in a brick-wall limiter:
`master(0.5) → DynamicsCompressor(threshold −3, ratio 20:1) → destination`.

## Honest notes on what's unverified

- I can't hear it in the sandbox, so I can't confirm the **grain-answer reads as
  a genuinely musical reply** in his piano sound — the register/contour/density
  logic is plausible and the grain selection is pitch-correct, but whether it
  *feels* like a conversation is unconfirmed.
- The **real-piano fetch only works on the deployed site** (the `/api/audio`
  route needs Supabase + the recording). Locally/offline you'll get the amber
  synth fallback, which is by design but means the "his actual sound" claim is
  untested here.
- Grain pitch estimation is a coarse monophonic autocorrelation; on dense or
  polyphonic passages of the recording the per-grain pitch tag will be
  approximate, which `playbackRate` only partially corrects.
