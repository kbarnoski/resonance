// readme.ts — design-notes text surfaced by the in-page "Read the design notes"
// panel. Kept in sync with README.md.

export const PITCH =
  "A cathedral of light that builds itself, strut by strut, over ten minutes — a sapling at minute one, a towering vault by minute ten, and never the same structure twice along the way.";

export interface NoteBlock {
  heading: string;
  body: string;
}

export const NOTES: NoteBlock[] = [
  {
    heading: "What you are watching",
    body: "A space-colonization algorithm (Runions et al., 2005 — a cousin of Lindenmayer's L-systems) grows a branching structure toward a cloud of attraction points shaped like a gothic cathedral: flared base, ribbed pillars, an arched vault, a tapering spire. The node list only ever accumulates — genuine memory, not a loop.",
  },
  {
    heading: "See it = hear it",
    body: "Every attractor a branch reaches is consumed and fires a growth event. Each event flares a tip of light AND rings a soft inharmonic bell pitched by the height of that event — low struts sound low, the spire sounds like high glass. Under it all, a just-intonation drone bed slowly opens its filter as the structure fills in.",
  },
  {
    heading: "The long arc",
    body: "Start runs the full ~10-minute slow build from the sapling. The idle preview you saw on load is the same growth fast-forwarded, so a 20-second glance still shows the cathedral visibly rising. Growth is paced against a wall clock, so it tracks the arc no matter how the algorithm branches.",
  },
  {
    heading: "Steering",
    body: "It fully self-plays — do nothing and the camera slowly orbits, ascends, and pulls back to keep the growing spire framed. Tilt your device (or move the pointer / arrow keys on desktop) to steer your gaze around the structure. Input only adds parallax; it is never required.",
  },
  {
    heading: "Lineage",
    body: "Terry Riley's In C and Éliane Radigue's hour-long ARP drones (slow structural accretion, long-form evolution); the Buddhist kalpa (deep time); and the growing-cathedral / temple imagery reported in deep meditation and high-dose psilocybin states — architecture assembling itself over subjective aeons.",
  },
];
