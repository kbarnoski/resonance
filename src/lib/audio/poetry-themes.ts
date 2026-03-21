import type { Mood } from "./vibe-detection";

export interface TypographicVariant {
  fontFamily: string;
  fontWeight: number;
  letterSpacing: string;
  textTransform: "none" | "uppercase" | "lowercase";
}

export interface PoetryTheme {
  // Pool of typographic treatments — each line picks one at random
  variants: TypographicVariant[];
  sizeRange: [number, number]; // rem
  opacity: number;
  // Array of colors — each line picks one at random for variety
  colors: string[];
  textShadow: string;
  animation: string;
  animationDuration: [number, number]; // seconds
  // Hand-written lines shown immediately while API fetches the first batch
  seedLines: string[];
}

// Tight dark shadow for readability over any viz — including bright/white washouts.
// Layer 1: hard, almost no blur for crisp edge definition
// Layer 2: medium spread for dark halo
// Layer 3: wider ambient for depth against very bright backgrounds
const READABLE_SHADOW = "0 1px 2px rgba(0,0,0,1), 0 0 8px rgba(0,0,0,0.9), 0 0 24px rgba(0,0,0,0.6)";

// ─── Google Fonts URL for typography overrides ───
// Loaded dynamically by PoetryOverlay when a themed context is active.
// The CSS is tiny; actual font files are lazy-loaded by the browser on first use.
export const TYPOGRAPHY_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300&family=Bebas+Neue&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Space+Grotesk:wght@300;400;500&family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500&display=swap";

// ─── Default mood-based themes (fallback) ───

export const POETRY_THEMES: Record<Mood, PoetryTheme> = {
  melancholic: {
    variants: [
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 200, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 300, letterSpacing: "-0.02em", textTransform: "none" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 300, letterSpacing: "0.15em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.06em", textTransform: "lowercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(180, 200, 255, 0.85)",
      "rgba(200, 180, 220, 0.8)",
      "rgba(160, 210, 240, 0.8)",
      "rgba(220, 200, 240, 0.75)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [18, 30],
    seedLines: [
      "the silence between notes holds everything",
      "we carry the weight of unfinished songs",
      "rain traces the shape of what we lost",
      "even the echo fades eventually",
    ],
  },
  intense: {
    variants: [
      { fontFamily: "var(--font-geist-mono)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 500, letterSpacing: "-0.01em", textTransform: "none" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 200, letterSpacing: "0.12em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 600, letterSpacing: "-0.03em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.5],
    opacity: 0.85,
    colors: [
      "rgba(255, 120, 140, 0.9)",
      "rgba(255, 180, 100, 0.85)",
      "rgba(255, 255, 200, 0.9)",
      "rgba(255, 160, 160, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-line-lifecycle",
    animationDuration: [8, 14],
    seedLines: [
      "break the pattern before it breaks you",
      "every frequency is a weapon",
      "the distortion is the message",
      "burn through the static",
    ],
  },
  dreamy: {
    variants: [
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.03em", textTransform: "lowercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 200, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.08em", textTransform: "lowercase" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 300, letterSpacing: "0.04em", textTransform: "lowercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 300, letterSpacing: "-0.01em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.5],
    opacity: 0.65,
    colors: [
      "rgba(255, 210, 160, 0.85)",
      "rgba(255, 230, 200, 0.8)",
      "rgba(240, 190, 220, 0.8)",
      "rgba(220, 200, 180, 0.75)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-breathe",
    animationDuration: [14, 22],
    seedLines: [
      "drifting through amber corridors of sound",
      "the warmth remembers what the mind forgets",
      "soft edges dissolving into light",
      "somewhere between waking and melody",
    ],
  },
  mystical: {
    variants: [
      { fontFamily: "var(--font-geist-mono)", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 400, letterSpacing: "0.05em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 200, letterSpacing: "0.12em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 300, letterSpacing: "-0.02em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.75,
    colors: [
      "rgba(190, 140, 255, 0.85)",
      "rgba(160, 200, 255, 0.85)",
      "rgba(220, 180, 255, 0.8)",
      "rgba(180, 220, 200, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-drift",
    animationDuration: [16, 26],
    seedLines: [
      "the geometry of sound reveals hidden doors",
      "listen where the frequencies converge",
      "ancient harmonics encoded in the overtones",
      "the threshold vibrates at a frequency only silence knows",
    ],
  },
  chaotic: {
    variants: [
      { fontFamily: "var(--font-geist-mono)", fontWeight: 500, letterSpacing: "0.03em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 400, letterSpacing: "-0.02em", textTransform: "none" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 600, letterSpacing: "-0.03em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.8,
    colors: [
      "rgba(255, 255, 255, 0.9)",
      "rgba(255, 200, 200, 0.85)",
      "rgba(200, 255, 255, 0.85)",
      "rgba(255, 255, 180, 0.85)",
    ],
    textShadow: READABLE_SHADOW + ", 1px 0 rgba(255, 0, 0, 0.15), -1px 0 rgba(0, 255, 255, 0.15)",
    animation: "poetry-line-lifecycle",
    animationDuration: [6, 10],
    seedLines: [
      "ctrl+z won't save you here",
      "the signal is the noise is the signal",
      "every crash is a new beginning",
      "fragments reassemble in wrong order",
    ],
  },
  hypnotic: {
    variants: [
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.04em", textTransform: "lowercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 200, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.10em", textTransform: "lowercase" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 300, letterSpacing: "0.06em", textTransform: "lowercase" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 300, letterSpacing: "-0.01em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.6,
    colors: [
      "rgba(180, 150, 255, 0.8)",
      "rgba(200, 200, 255, 0.75)",
      "rgba(160, 180, 240, 0.8)",
      "rgba(220, 180, 220, 0.75)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-breathe",
    animationDuration: [20, 32],
    seedLines: [
      "the loop deepens with each repetition",
      "circles within circles within circles",
      "surrender to the recurring pattern",
      "time folds back upon itself",
    ],
  },
  flowing: {
    variants: [
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 200, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.08em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 300, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 300, letterSpacing: "-0.02em", textTransform: "lowercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(200, 190, 255, 0.85)",
      "rgba(180, 220, 240, 0.8)",
      "rgba(220, 200, 230, 0.8)",
      "rgba(190, 210, 200, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [16, 24],
    seedLines: [
      "the current carries what the hands release",
      "water finds its way through every boundary",
      "each ripple remembers the stone",
      "flowing without resistance into the next measure",
    ],
  },
  transcendent: {
    variants: [
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.05em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 200, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 100, letterSpacing: "0.14em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 200, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "var(--font-geist-sans)", fontWeight: 300, letterSpacing: "-0.01em", textTransform: "lowercase" },
    ],
    sizeRange: [2.2, 3.5],
    opacity: 0.7,
    colors: [
      "rgba(255, 220, 140, 0.85)",
      "rgba(255, 240, 200, 0.8)",
      "rgba(240, 200, 180, 0.8)",
      "rgba(255, 200, 160, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [20, 32],
    seedLines: [
      "beyond the last note there is only light",
      "the boundary between sound and silence dissolves",
      "ascending through harmonics into pure being",
      "every overtone is a doorway upward",
    ],
  },
};

// ─── Typography overrides by realm (journey) and shader category (viz-only) ───
// Each override replaces the mood-based theme entirely when active.
// Uses Google Fonts loaded dynamically via TYPOGRAPHY_FONTS_URL.

export const TYPOGRAPHY_OVERRIDES: Record<string, PoetryTheme> = {
  // ─── Realm overrides (journey mode) ───

  heaven: {
    variants: [
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.12em", textTransform: "uppercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.08em", textTransform: "lowercase" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.16em", textTransform: "uppercase" },
    ],
    sizeRange: [2.2, 3.5],
    opacity: 0.7,
    colors: [
      "rgba(255, 248, 220, 0.9)",
      "rgba(255, 240, 200, 0.85)",
      "rgba(240, 230, 210, 0.8)",
      "rgba(255, 255, 240, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [22, 36],
    seedLines: [],
  },

  hell: {
    variants: [
      { fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400, letterSpacing: "0.06em", textTransform: "uppercase" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: "0.02em", textTransform: "uppercase" },
      { fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "-0.02em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.85,
    colors: [
      "rgba(255, 60, 40, 0.9)",
      "rgba(255, 120, 30, 0.85)",
      "rgba(255, 180, 60, 0.9)",
      "rgba(200, 40, 40, 0.85)",
    ],
    textShadow: READABLE_SHADOW + ", 0 0 20px rgba(255, 0, 0, 0.3)",
    animation: "poetry-line-lifecycle",
    animationDuration: [7, 12],
    seedLines: [],
  },

  garden: {
    variants: [
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Lora', serif", fontWeight: 400, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "'Playfair Display', serif", fontWeight: 700, letterSpacing: "-0.01em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.75,
    colors: [
      "rgba(180, 210, 160, 0.85)",
      "rgba(240, 230, 200, 0.8)",
      "rgba(200, 190, 160, 0.8)",
      "rgba(160, 200, 180, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-breathe",
    animationDuration: [16, 26],
    seedLines: [],
  },

  ocean: {
    variants: [
      { fontFamily: "'Lora', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Lora', serif", fontWeight: 500, letterSpacing: "0.01em", textTransform: "lowercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.06em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.08em", textTransform: "lowercase" },
    ],
    sizeRange: [2.0, 3.5],
    opacity: 0.7,
    colors: [
      "rgba(140, 200, 255, 0.85)",
      "rgba(180, 220, 240, 0.8)",
      "rgba(200, 240, 255, 0.8)",
      "rgba(160, 180, 220, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [18, 28],
    seedLines: [],
  },

  machine: {
    variants: [
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 400, letterSpacing: "0.08em", textTransform: "uppercase" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 400, letterSpacing: "0.06em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.0],
    opacity: 0.8,
    colors: [
      "rgba(200, 220, 240, 0.9)",
      "rgba(160, 200, 230, 0.85)",
      "rgba(180, 210, 255, 0.85)",
      "rgba(220, 230, 240, 0.8)",
    ],
    textShadow: READABLE_SHADOW + ", 0 0 10px rgba(100, 180, 255, 0.15)",
    animation: "poetry-drift",
    animationDuration: [12, 20],
    seedLines: [],
  },

  cosmos: {
    variants: [
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 400, letterSpacing: "0.06em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.14em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.5],
    opacity: 0.75,
    colors: [
      "rgba(180, 160, 255, 0.85)",
      "rgba(200, 220, 255, 0.8)",
      "rgba(160, 200, 240, 0.85)",
      "rgba(240, 220, 255, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [20, 32],
    seedLines: [],
  },


  temple: {
    variants: [
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.03em", textTransform: "none" },
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.06em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: "0.12em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.75,
    colors: [
      "rgba(220, 200, 160, 0.85)",
      "rgba(200, 180, 140, 0.8)",
      "rgba(240, 220, 180, 0.85)",
      "rgba(180, 170, 150, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-drift",
    animationDuration: [18, 28],
    seedLines: [],
  },

  labyrinth: {
    variants: [
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Lora', serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "0.08em", textTransform: "lowercase" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 300, letterSpacing: "0.06em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.0],
    opacity: 0.7,
    colors: [
      "rgba(200, 180, 200, 0.8)",
      "rgba(180, 190, 210, 0.8)",
      "rgba(210, 200, 220, 0.75)",
      "rgba(170, 180, 200, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-drift",
    animationDuration: [16, 24],
    seedLines: [],
  },

  mountain: {
    variants: [
      { fontFamily: "'Lora', serif", fontWeight: 500, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.06em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: "0.10em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.75,
    colors: [
      "rgba(220, 220, 230, 0.85)",
      "rgba(200, 210, 220, 0.8)",
      "rgba(180, 190, 210, 0.8)",
      "rgba(230, 230, 240, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [20, 30],
    seedLines: [],
  },

  desert: {
    variants: [
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: "0.03em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.06em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(240, 220, 180, 0.85)",
      "rgba(220, 200, 160, 0.8)",
      "rgba(200, 190, 170, 0.8)",
      "rgba(255, 240, 200, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-breathe",
    animationDuration: [20, 32],
    seedLines: [],
  },

  archive: {
    variants: [
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 300, letterSpacing: "0.08em", textTransform: "none" },
      { fontFamily: "'Playfair Display', serif", fontWeight: 700, letterSpacing: "0.01em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(220, 210, 190, 0.85)",
      "rgba(200, 190, 170, 0.8)",
      "rgba(180, 170, 160, 0.8)",
      "rgba(240, 230, 210, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-drift",
    animationDuration: [18, 28],
    seedLines: [],
  },

  storm: {
    variants: [
      { fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "uppercase" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.8,
    colors: [
      "rgba(200, 220, 255, 0.9)",
      "rgba(220, 230, 255, 0.85)",
      "rgba(180, 200, 240, 0.85)",
      "rgba(255, 255, 255, 0.9)",
    ],
    textShadow: READABLE_SHADOW + ", 0 0 15px rgba(150, 200, 255, 0.2)",
    animation: "poetry-line-lifecycle",
    animationDuration: [8, 14],
    seedLines: [],
  },

  // ─── Shader category overrides (viz-only mode) ───

  Visionary: {
    variants: [
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.08em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.14em", textTransform: "uppercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, letterSpacing: "0.02em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.5],
    opacity: 0.75,
    colors: [
      "rgba(220, 180, 255, 0.85)",
      "rgba(200, 200, 255, 0.8)",
      "rgba(255, 220, 200, 0.8)",
      "rgba(180, 200, 240, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [18, 30],
    seedLines: [],
  },

  Cosmic: {
    variants: [
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.12em", textTransform: "uppercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.06em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.75,
    colors: [
      "rgba(180, 160, 255, 0.85)",
      "rgba(160, 200, 255, 0.85)",
      "rgba(200, 180, 240, 0.8)",
      "rgba(220, 220, 255, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-drift",
    animationDuration: [20, 32],
    seedLines: [],
  },

  Organic: {
    variants: [
      { fontFamily: "'Lora', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "'Lora', serif", fontWeight: 500, letterSpacing: "0.04em", textTransform: "lowercase" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(200, 220, 180, 0.85)",
      "rgba(220, 210, 190, 0.8)",
      "rgba(180, 210, 200, 0.8)",
      "rgba(210, 200, 180, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-breathe",
    animationDuration: [16, 26],
    seedLines: [],
  },

  Geometry: {
    variants: [
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 400, letterSpacing: "0.06em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "0.02em", textTransform: "lowercase" },
    ],
    sizeRange: [2.0, 3.0],
    opacity: 0.75,
    colors: [
      "rgba(200, 220, 240, 0.85)",
      "rgba(220, 200, 230, 0.8)",
      "rgba(180, 210, 220, 0.85)",
      "rgba(240, 230, 220, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-drift",
    animationDuration: [14, 22],
    seedLines: [],
  },

  "3D Worlds": {
    variants: [
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.06em", textTransform: "lowercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(200, 220, 255, 0.85)",
      "rgba(220, 210, 240, 0.8)",
      "rgba(180, 200, 230, 0.8)",
      "rgba(240, 240, 255, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [16, 26],
    seedLines: [],
  },

  Elemental: {
    variants: [
      { fontFamily: "'Lora', serif", fontWeight: 500, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "'Lora', serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.08em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: "0.10em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.75,
    colors: [
      "rgba(220, 200, 180, 0.85)",
      "rgba(200, 210, 230, 0.8)",
      "rgba(180, 200, 200, 0.8)",
      "rgba(230, 220, 200, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [18, 28],
    seedLines: [],
  },

  Dark: {
    variants: [
      { fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400, letterSpacing: "0.06em", textTransform: "uppercase" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Bebas Neue', sans-serif", fontWeight: 400, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "var(--font-geist-mono)", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.8,
    colors: [
      "rgba(255, 80, 80, 0.85)",
      "rgba(200, 200, 200, 0.8)",
      "rgba(255, 160, 100, 0.85)",
      "rgba(180, 180, 200, 0.8)",
    ],
    textShadow: READABLE_SHADOW + ", 0 0 15px rgba(255, 0, 0, 0.15)",
    animation: "poetry-line-lifecycle",
    animationDuration: [8, 14],
    seedLines: [],
  },

  "AI Imagery": {
    variants: [
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.06em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "'Lora', serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "lowercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(220, 200, 240, 0.85)",
      "rgba(200, 220, 230, 0.8)",
      "rgba(240, 220, 200, 0.8)",
      "rgba(180, 200, 220, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-breathe",
    animationDuration: [18, 28],
    seedLines: [],
  },

  // ─── Seasonal realm overrides ───

  winter: {
    variants: [
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.06em", textTransform: "lowercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Space Grotesk', sans-serif", fontWeight: 300, letterSpacing: "0.14em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.5],
    opacity: 0.65,
    colors: [
      "rgba(200, 220, 240, 0.85)",
      "rgba(180, 200, 230, 0.8)",
      "rgba(220, 230, 245, 0.8)",
      "rgba(160, 190, 220, 0.75)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-breathe",
    animationDuration: [22, 36],
    seedLines: [],
  },

  spring: {
    variants: [
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Lora', serif", fontWeight: 400, letterSpacing: "0.01em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.08em", textTransform: "lowercase" },
      { fontFamily: "'Playfair Display', serif", fontWeight: 700, letterSpacing: "-0.01em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(160, 210, 160, 0.85)",
      "rgba(200, 220, 180, 0.8)",
      "rgba(240, 220, 200, 0.8)",
      "rgba(180, 200, 170, 0.85)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [16, 26],
    seedLines: [],
  },

  summer: {
    variants: [
      { fontFamily: "'Lora', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 400, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'Lora', serif", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.03em", textTransform: "none" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.75,
    colors: [
      "rgba(255, 230, 160, 0.85)",
      "rgba(240, 200, 140, 0.8)",
      "rgba(255, 220, 180, 0.85)",
      "rgba(220, 200, 160, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-drift",
    animationDuration: [16, 26],
    seedLines: [],
  },

  autumn: {
    variants: [
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.02em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.06em", textTransform: "none" },
      { fontFamily: "'Lora', serif", fontWeight: 500, letterSpacing: "0.01em", textTransform: "lowercase" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.10em", textTransform: "uppercase" },
    ],
    sizeRange: [2.0, 3.2],
    opacity: 0.7,
    colors: [
      "rgba(220, 160, 100, 0.85)",
      "rgba(200, 140, 80, 0.8)",
      "rgba(180, 130, 90, 0.8)",
      "rgba(240, 200, 140, 0.8)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-float",
    animationDuration: [18, 30],
    seedLines: [],
  },

  spirit: {
    variants: [
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.10em", textTransform: "none" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 400, letterSpacing: "0.06em", textTransform: "lowercase" },
      { fontFamily: "'Playfair Display', serif", fontWeight: 400, letterSpacing: "0.03em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.14em", textTransform: "uppercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" },
    ],
    sizeRange: [2.2, 3.5],
    opacity: 0.8,
    colors: [
      "rgba(200, 180, 255, 0.9)",
      "rgba(255, 240, 210, 0.85)",
      "rgba(180, 210, 255, 0.85)",
      "rgba(255, 220, 240, 0.8)",
      "rgba(220, 255, 240, 0.85)",
    ],
    textShadow: READABLE_SHADOW + ", 0 0 20px rgba(160, 120, 255, 0.15)",
    animation: "poetry-float",
    animationDuration: [20, 34],
    seedLines: [],
  },

  pain: {
    variants: [
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.02em", textTransform: "lowercase" },
      { fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, letterSpacing: "0.04em", textTransform: "none" },
      { fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: "0.08em", textTransform: "lowercase" },
    ],
    sizeRange: [2.0, 3.0],
    opacity: 0.5,
    colors: [
      "rgba(120, 130, 160, 0.7)",
      "rgba(100, 110, 140, 0.6)",
      "rgba(140, 140, 160, 0.65)",
      "rgba(80, 90, 120, 0.6)",
    ],
    textShadow: READABLE_SHADOW,
    animation: "poetry-breathe",
    animationDuration: [24, 40],
    seedLines: [],
  },
};
