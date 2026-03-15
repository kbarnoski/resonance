import { Note, Scale, Chord } from "tonal";

export interface ClassifiedChord {
  name: string;
  roman: string;
  function: "tonic" | "subdominant" | "dominant" | "chromatic";
  colorClass: string;
}

export const FUNCTION_COLORS: Record<
  string,
  { bg: string; text: string; badge: string }
> = {
  tonic: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  subdominant: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  dominant: {
    bg: "bg-rose-100 dark:bg-rose-900/30",
    text: "text-rose-800 dark:text-rose-300",
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  },
  chromatic: {
    bg: "bg-muted",
    text: "text-muted-foreground",
    badge: "bg-muted text-muted-foreground",
  },
};

// Roman numerals for major and minor keys
const MAJOR_ROMANS = ["I", "ii", "iii", "IV", "V", "vi", "vii\u00B0"];
const MINOR_ROMANS = ["i", "ii\u00B0", "III", "iv", "V", "VI", "VII"];

// Function assignment by scale degree (0-indexed)
const MAJOR_FUNCTIONS: ClassifiedChord["function"][] = [
  "tonic",       // I
  "subdominant", // ii
  "tonic",       // iii
  "subdominant", // IV
  "dominant",    // V
  "tonic",       // vi
  "dominant",    // vii
];

const MINOR_FUNCTIONS: ClassifiedChord["function"][] = [
  "tonic",       // i
  "subdominant", // ii
  "tonic",       // III
  "subdominant", // iv
  "dominant",    // v/V
  "tonic",       // VI
  "dominant",    // VII
];

function parseKeySignature(keySignature: string): {
  root: string;
  mode: "major" | "minor";
} | null {
  const cleaned = keySignature.trim();
  // Match patterns like "C Major", "F# Minor", "Bb major", "A minor"
  const match = cleaned.match(/^([A-Ga-g][#b]?)\s*(major|minor)$/i);
  if (!match) return null;

  const root = match[1].charAt(0).toUpperCase() + match[1].slice(1);
  const mode = match[2].toLowerCase() as "major" | "minor";
  return { root, mode };
}

function getScaleDegree(
  chordRoot: string,
  scaleNotes: string[]
): number | null {
  const chordChroma = Note.chroma(chordRoot);
  if (chordChroma === undefined) return null;

  for (let i = 0; i < scaleNotes.length; i++) {
    const noteChroma = Note.chroma(scaleNotes[i]);
    if (noteChroma === chordChroma) return i;
  }
  return null;
}

function extractChordRoot(chordName: string): string | null {
  const chord = Chord.get(chordName);
  if (chord.tonic) return chord.tonic;

  // Fallback: parse root from chord name manually
  const match = chordName.match(/^([A-Ga-g][#b]?)/);
  return match ? match[1] : null;
}

export function classifyChords(
  chords: string[],
  keySignature: string | null
): ClassifiedChord[] {
  if (!keySignature) {
    return chords.map((name) => ({
      name,
      roman: "",
      function: "chromatic" as const,
      colorClass: FUNCTION_COLORS.chromatic.badge,
    }));
  }

  const parsed = parseKeySignature(keySignature);
  if (!parsed) {
    return chords.map((name) => ({
      name,
      roman: "",
      function: "chromatic" as const,
      colorClass: FUNCTION_COLORS.chromatic.badge,
    }));
  }

  const scaleName =
    parsed.mode === "major"
      ? `${parsed.root} major`
      : `${parsed.root} minor`;
  const scale = Scale.get(scaleName);
  const scaleNotes = scale.notes;

  if (scaleNotes.length === 0) {
    return chords.map((name) => ({
      name,
      roman: "",
      function: "chromatic" as const,
      colorClass: FUNCTION_COLORS.chromatic.badge,
    }));
  }

  const romans = parsed.mode === "major" ? MAJOR_ROMANS : MINOR_ROMANS;
  const functions =
    parsed.mode === "major" ? MAJOR_FUNCTIONS : MINOR_FUNCTIONS;

  return chords.map((name) => {
    const root = extractChordRoot(name);
    if (!root) {
      return {
        name,
        roman: "",
        function: "chromatic" as const,
        colorClass: FUNCTION_COLORS.chromatic.badge,
      };
    }

    const degree = getScaleDegree(root, scaleNotes);
    if (degree === null || degree >= romans.length) {
      return {
        name,
        roman: "",
        function: "chromatic" as const,
        colorClass: FUNCTION_COLORS.chromatic.badge,
      };
    }

    const fn = functions[degree];
    return {
      name,
      roman: romans[degree],
      function: fn,
      colorClass: FUNCTION_COLORS[fn].badge,
    };
  });
}

/**
 * Classify a single chord name given a key signature.
 * Returns the function color class string for use in the timeline.
 */
export function classifyChordFunction(
  chordName: string,
  keySignature: string | null
): ClassifiedChord {
  return classifyChords([chordName], keySignature)[0];
}
