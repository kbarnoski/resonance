// Design-notes content surfaced by the in-page "Read the design notes" panel.
// Kept as plain data so the page can render it without pulling in a markdown dep.

export interface NoteSection {
  title: string;
  body: string[];
}

export const NOTES: NoteSection[] = [
  {
    title: "The one question",
    body: [
      "What if a swarm of particles were also a choir — each dot simultaneously a position AND an oscillator phase, so that spatial order and musical synchrony are the same thing you steer?",
    ],
  },
  {
    title: "The model — swarmalators",
    body: [
      "Every agent i carries a 2D position xᵢ and a phase θᵢ. Both evolve under coupled equations, so space and phase pull on each other:",
      "dxᵢ/dt = (1/N) Σ [ unit(xⱼ−xᵢ)·(A + J·cosΔθ) − B·(xⱼ−xᵢ)/|xⱼ−xᵢ|² ]",
      "dθᵢ/dt = ωᵢ + (K/N) Σ sin(θⱼ−θᵢ)/|xⱼ−xᵢ|",
      "Integrated with forward Euler at N≈420, O(N²) each frame. J couples phase to space; K is the Kuramoto phase-sync strength.",
    ],
  },
  {
    title: "The five states, and how to steer",
    body: [
      "Static sync — K high, J near 0: dots freeze and all share one colour. One held chord.",
      "Static async — K low/negative, J low: a disc of every hue, no correlation. A diffuse cluster.",
      "Static phase wave — J high, K near 0: colour wraps around the disc like a rainbow ring; still. A rolled chord that holds.",
      "Splintered phase wave — J high, K slightly negative: the ring breaks into coloured clumps. A broken arpeggio.",
      "Active phase wave — J high, K more negative: the clumps rotate; hue cycles. A shimmering, moving arpeggio.",
      "Drag the K and J sliders (or drag on the field: x→K, y→J) to cross the boundaries.",
    ],
  },
  {
    title: "Phase → sound",
    body: [
      "The phase circle is split into 12 bins; each bin owns ONE voice (never 400 oscillators). A bin's mean phase is quantised to a just-intonation pentatonic — so it is always consonant. Spatial angle → stereo pan. Phase coherence R → brightness + drone swell. Spatial coherence → detune shimmer.",
      "Synced → unison/chord. Active phase wave → the bins cycle the circle and you hear a moving, shimmering arpeggio.",
    ],
  },
  {
    title: "References",
    body: [
      "K. P. O'Keeffe, H. Hong & S. H. Strogatz, \"Oscillators that sync and swarm,\" Nature Communications 8, 1504 (2017).",
      "\"Interplay of synchronization and swarming,\" Physics Reports review (2026).",
    ],
  },
  {
    title: "Next-cycle deepening",
    body: [
      "Add chirality (two counter-rotating sub-populations) for the double-mill and vortex states; spatial-hash the force sums to reach N≈2000; and let the audio scale degrees themselves drift as a slow modal rotation so long listens never loop.",
    ],
  },
];
