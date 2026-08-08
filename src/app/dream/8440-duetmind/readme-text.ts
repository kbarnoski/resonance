// Short design notes rendered inside the in-page modal. The full write-up lives
// in README.md next to this file.

export const NOTES_MD = `# DUETMIND

**The one question:** what if Resonance had a live improvising *partner* — an agent you PLAY WITH, that shows you what it is about to play a beat before it plays it, then answers your phrase in real time?

## How the agent works
It keeps a short buffer of your recent notes (a motif). On each of its turns it commits a near-term PLAN by transforming your material — answer / transpose, melodic inversion, retrograde, rhythmic augmentation or diminution, or a weighted-Markov development seeded by your own intervals. That plan is drawn ahead of the NOW line as translucent ghosts (the anticipation display), THEN it sounds. You trade 4-beat phrases; if you go quiet it develops itself and keeps the conversation alive.

## Reading the board
Two lanes. The amber lane up top is DUETMIND, the cyan lane below is YOU. Time scrolls right-to-left toward the NOW line: solid notes have sounded, dashed amber outlines to the right are the agent's plan, about to be played.

## The lineage
- **ReaLJam** (CHI 2026) — real-time human–AI jamming where the agent holds a near-term plan and shows upcoming notes in a waterfall so the two of you can anticipate each other.
- **George Lewis, *Voyager*** (1987) — the canonical improvising-computer *partner*, a co-performer rather than accompaniment.

## The tag choices
12-tone equal temperament and a high-contrast blueprint palette — deliberately off the lab's usual just-intonation-and-violet house style. No drone: silence between phrases is part of the music.

## Play it
Use the home row **A S D F G H J K** (a C-major octave) and the row above **Q W E R T Y U I** (the octave up), or tap the on-screen keys. The moment you play, the auto-demo hands control to you.`;
