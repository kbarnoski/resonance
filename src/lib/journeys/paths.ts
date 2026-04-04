export interface JourneyPath {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  journeyIds: string[];
  culminationJourneyId: string;
  palette: { accent: string; glow: string };
}

export const JOURNEY_PATHS: JourneyPath[] = [
  {
    id: "descent-and-return",
    name: "The Descent and Return",
    subtitle: "into the dark, through it, and back",
    description:
      "A path through fire, depth, living earth, and the raw truth of pain — and the slow return to the surface carrying what you found.",
    journeyIds: ["inferno", "abyssal-dive", "mycelium-dream", "the-wound"],
    culminationJourneyId: "the-wellspring",
    palette: { accent: "#c04040", glow: "#e06060" },
  },
  {
    id: "architecture-of-knowing",
    name: "The Architecture of Knowing",
    subtitle: "the mind as cathedral",
    description:
      "Lost in the labyrinth, wired into the machine, reading the infinite archive, and arriving at sacred resonance — the structures we build to hold understanding.",
    journeyIds: ["the-maze", "neural-link", "the-reading", "sacred-resonance"],
    culminationJourneyId: "the-silence-between",
    palette: { accent: "#a09070", glow: "#c0a880" },
  },
  {
    id: "vast-and-still",
    name: "The Vast and the Still",
    subtitle: "where distance becomes devotion",
    description:
      "Crossing impossible terrain, climbing toward thin air, drifting through cosmic silence — the journeys that dissolve the self into scale.",
    journeyIds: ["the-crossing", "the-ascent", "cosmic-drift"],
    culminationJourneyId: "the-vanishing-point",
    palette: { accent: "#7080b0", glow: "#90a0d0" },
  },
  {
    id: "wheel-of-the-year",
    name: "The Wheel of the Year",
    subtitle: "the oldest story humanity knows",
    description:
      "Spring emergence, summer fullness, autumn release, winter silence — the cycle that turns beneath everything.",
    journeyIds: ["the-bloom", "the-solstice", "the-harvest", "first-snow"],
    culminationJourneyId: "the-return",
    palette: { accent: "#80a060", glow: "#a0c080" },
  },
  {
    id: "light-above-storm-below",
    name: "Light Above, Storm Below",
    subtitle: "electricity and transcendence",
    description:
      "The raw power of the tempest, dissolution into nothing, and the ascension into golden light — the vertical axis of destruction and grace.",
    journeyIds: ["the-tempest", "dissolution", "the-ascension"],
    culminationJourneyId: "the-radiance",
    palette: { accent: "#d0a040", glow: "#e0b860" },
  },
];

export const GRAND_CULMINATION_ID = "the-spirit";

/** Find which path a journey belongs to (null if none) */
export function getPathForJourney(journeyId: string): JourneyPath | null {
  return (
    JOURNEY_PATHS.find(
      (p) =>
        p.journeyIds.includes(journeyId) ||
        p.culminationJourneyId === journeyId
    ) ?? null
  );
}

/** Check if all journeys in a path are completed (unlocking its culmination) */
export function isPathCulminationUnlocked(
  path: JourneyPath,
  completedIds: string[]
): boolean {
  return path.journeyIds.every((id) => completedIds.includes(id));
}

/** Check if all 5 path culminations are completed (unlocking the grand culmination) */
export function isGrandCulminationUnlocked(completedIds: string[]): boolean {
  return JOURNEY_PATHS.every((path) =>
    completedIds.includes(path.culminationJourneyId)
  );
}

/** Get the next incomplete journey in a path (null if all done) */
export function getNextInPath(
  path: JourneyPath,
  completedIds: string[]
): string | null {
  return path.journeyIds.find((id) => !completedIds.includes(id)) ?? null;
}
