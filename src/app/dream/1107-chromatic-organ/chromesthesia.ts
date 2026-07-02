/**
 * Scriabin's chromesthesia color scale — the clavier à lumières mapping from
 * his 1910 tone-poem *Prometheus: The Poem of Fire*. Scriabin (himself a
 * synesthete, or at least a systematiser of one) laid the twelve pitch-classes
 * around the circle of fifths and assigned each a colour. We hard-code that
 * canonical circle-of-fifths → hue table here.
 *
 * Circle of fifths order and Scriabin's colours:
 *   C  = red
 *   G  = orange (rosy-orange)
 *   D  = yellow
 *   A  = green
 *   E  = sky / whitish-blue
 *   B  = pale blue (bluish-white)
 *   F# = bright blue / blue-violet
 *   Db = violet
 *   Ab = purple / lilac
 *   Eb = steel (flesh-grey with a metallic sheen)
 *   Bb = steel / rosy metallic
 *   F  = deep red (crimson)
 *
 * Indexed here by chromatic pitch-class 0..11 (C, C#, D, ... B).
 */

export type RGB = readonly [number, number, number];

interface Chroma {
  name: string;
  scriabin: string;
  rgb: RGB;
}

// 0..255 encoded for readability, converted to 0..1 on read.
const TABLE: Chroma[] = [
  { name: "C", scriabin: "red", rgb: [235, 46, 46] },
  { name: "C#/Db", scriabin: "violet", rgb: [138, 66, 224] },
  { name: "D", scriabin: "yellow", rgb: [240, 214, 54] },
  { name: "D#/Eb", scriabin: "steel", rgb: [150, 160, 176] },
  { name: "E", scriabin: "sky blue", rgb: [140, 205, 250] },
  { name: "F", scriabin: "deep red", rgb: [196, 28, 66] },
  { name: "F#/Gb", scriabin: "blue-violet", rgb: [72, 104, 245] },
  { name: "G", scriabin: "orange", rgb: [244, 132, 48] },
  { name: "G#/Ab", scriabin: "purple", rgb: [188, 92, 226] },
  { name: "A", scriabin: "green", rgb: [78, 210, 104] },
  { name: "A#/Bb", scriabin: "rosy steel", rgb: [190, 150, 168] },
  { name: "B", scriabin: "pale blue", rgb: [176, 198, 252] },
];

/** Normalised (0..1) Scriabin colour for a chromatic pitch-class 0..11. */
export function scriabinColor(pitchClass: number): RGB {
  const c = TABLE[((pitchClass % 12) + 12) % 12];
  return [c.rgb[0] / 255, c.rgb[1] / 255, c.rgb[2] / 255];
}

export function scriabinName(pitchClass: number): string {
  return TABLE[((pitchClass % 12) + 12) % 12].scriabin;
}

export function pitchName(pitchClass: number): string {
  return TABLE[((pitchClass % 12) + 12) % 12].name;
}

/** Full table for the design-notes / legend. */
export const SCRIABIN_TABLE = TABLE;

/** MIDI note number → frequency (equal temperament, A4 = 440). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
