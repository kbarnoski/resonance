// notes.ts — the design notes shown in-page (and mirrored in README.md).
// Kept as a string so the page can reveal it without a /README.md route.

export const NOTES_MD = `# Pulse Mirror — design notes

Play a rhythm — clap, tap, sing, or knock — and a duet partner tracks your
tempo and answers ON the beat, anticipating it. A live score-follower / reactive
accompaniment: it listens, finds your pulse, and plays a warm just-intonation
call-and-response back, scheduled to your PREDICTED next beat so the answer
lands in time rather than late.

## The one question

What does it feel like to be ACCOMPANIED — to have a partner that hears your
tempo and lands its reply exactly where you were about to put the next beat?

## The pipeline

- Listener (mic): an AnalyserNode FFT; per-frame positive spectral flux (the
  sum of positive bin-to-bin magnitude increases); an adaptive threshold of
  running mean + ~1.6 x stddev over a short window; a ~90 ms refractory period
  between accepted onsets; a ~120 Hz highpass before analysis to reject rumble.
  Each accepted onset is timestamped on the AudioContext clock.
- Tempo / beat tracker: a rolling buffer of inter-onset intervals (IOIs); the
  median IOI, octave-folded into ~0.3-1.0 s (60-200 BPM), is the beat period.
  Beat phase is anchored to the most recent onset; confidence falls out of how
  tightly the IOIs cluster (tighter = higher).
- Anticipatory accompaniment: a lookahead scheduler (polls ~every 25 ms,
  schedules ~120 ms ahead on the Web Audio clock) commits a pure JI note to the
  PREDICTED next beat time, so the answer sounds ON the beat. It walks a small
  just-intonation ladder (1, 9/8, 5/4, 4/3, 3/2, 5/3, 15/8, 2) over a warm
  ~220 Hz root, over a soft JI pad + void reverb.
- Demo performer: with no mic, a self-clocking synthetic onset generator
  wanders ~90-120 BPM with slight humanization and feeds the SAME listener /
  tracker interface, so the whole follow-and-answer loop runs headless.

## The visuals (raw WebGL2)

Additive point-sprite blobs on a near-black field. An amber caller family (your
side, left) blooms on each detected onset; a violet/rose answer family (the
instrument, right) blooms on each scheduled note, its height set by pitch; an
expanding beat ring pulses on the beat; a slow sub-3 Hz background breath eases
underneath. All blooms are eased — nothing strobes faster than ~3 Hz. If WebGL2
is unavailable it degrades to an equivalent Canvas2D scene and the audio keeps
playing.

## References

- Roger B. Dannenberg, "An On-Line Algorithm for Real-Time Accompaniment"
  (ICMC 1984) — the core idea: match the performer and PREDICT ahead so the
  accompaniment does not lag.
- Daniel P.W. Ellis, "Beat Tracking by Dynamic Programming" (2007) — beat
  tracking framed as recovering a period + phase from an onset-strength signal.

## Controls

- Start mic: listen to your live rhythm (clap, tap, knock, sing).
- Start demo: run the synthetic performer with no mic.
- Badge: emerald "listening (mic)" when the mic is live, amber "demo performer"
  when synthetic. Denying the mic falls back to the demo automatically.

## Next-cycle deepening

- Two-level metre: track beat AND bar so answers can cadence over a phrase.
- Confidence-weighted voicing: thin the reply when unsure, harmonize when sure.
- Onset-strength continuum (Ellis) rather than hard-thresholded events, with
  dynamic-programming beat recovery for robustness to dropped beats.
`;
