/**
 * iching.ts — a small, deterministic model of the I-Ching (Book of Changes).
 *
 * A hexagram is six stacked lines, each YIN (broken ▬ ▬) or YANG (solid ▬▬▬),
 * read from the BOTTOM up (line 1 = bottom, line 6 = top). When cast by the
 * yarrow-stalk method, some lines come up "old" / changing: an old-yin turns
 * into yang and an old-yang turns into yin. The changing lines carry a hexagram
 * forward to its "transformed" hexagram — that motion is the engine of the
 * self-playing canon in this prototype.
 *
 * Determinism: every random choice is driven by a seeded `mulberry32` PRNG.
 * There is no `Math.random`, no `Date.now`, no `new Date` anywhere in the lab.
 */

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------

/** mulberry32 — tiny, fast, deterministic 32-bit PRNG. Returns [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

// ---------------------------------------------------------------------------
// Lines & casts
// ---------------------------------------------------------------------------

export type LineType = "yin" | "yang";

/** One line of a fresh yarrow cast: its polarity and whether it is changing. */
export interface CastLine {
  type: LineType;
  changing: boolean;
}

/**
 * Cast one line by the classic four-probabilities of the yarrow-stalk method:
 *   6  old yin    (changing)  1/16   → drawn as broken, will become yang
 *   7  young yang (stable)    5/16
 *   8  young yin  (stable)    7/16
 *   9  old yang   (changing)  3/16   → drawn as solid, will become yin
 */
function castLine(rng: Rng): CastLine {
  const r = rng();
  if (r < 1 / 16) return { type: "yin", changing: true }; // 6 — old yin
  if (r < 6 / 16) return { type: "yang", changing: false }; // 7 — young yang
  if (r < 13 / 16) return { type: "yin", changing: false }; // 8 — young yin
  return { type: "yang", changing: true }; // 9 — old yang (remaining 3/16)
}

/** A full six-line yarrow cast, bottom (index 0) to top (index 5). */
export function castHexagram(rng: Rng): CastLine[] {
  const lines: CastLine[] = [];
  for (let i = 0; i < 6; i++) lines.push(castLine(rng));
  return lines;
}

/**
 * Given an existing hexagram (already-decided polarities), cast fresh
 * *changing lines* on it, preserving the conditional yarrow statistics:
 *   a yang line changes with probability 3/8  (old-yang 3/16 of young+old yang)
 *   a yin  line changes with probability 1/8  (old-yin  1/16 of young+old yin)
 * At least one line is guaranteed to change so the canon always moves on.
 */
export function castChangesOn(lines: LineType[], rng: Rng): boolean[] {
  const changing = lines.map((t) => rng() < (t === "yang" ? 3 / 8 : 1 / 8));
  if (!changing.some(Boolean)) {
    // No line came up old — force the single most "ready" line to move so the
    // walk never stalls into a hard loop. Pick deterministically via the PRNG.
    changing[Math.floor(rng() * 6) % 6] = true;
  }
  return changing;
}

/** Flip the changing lines to obtain the transformed hexagram. */
export function applyChanges(lines: LineType[], changing: boolean[]): LineType[] {
  return lines.map((t, i) =>
    changing[i] ? (t === "yang" ? "yin" : "yang") : t,
  );
}

// ---------------------------------------------------------------------------
// Trigrams & the King Wen sequence
// ---------------------------------------------------------------------------

export interface Trigram {
  name: string; // pinyin
  symbol: string; // Unicode trigram
  cn: string; // Chinese character
  gloss: string; // nature image
}

/** The eight trigrams keyed by their 3-bit value (bottom→top, yang=1). */
export const TRIGRAMS: Record<number, Trigram> = {
  0b000: { name: "Kun", symbol: "☷", cn: "坤", gloss: "Earth" },
  0b001: { name: "Gen", symbol: "☶", cn: "艮", gloss: "Mountain" },
  0b010: { name: "Kan", symbol: "☵", cn: "坎", gloss: "Water" },
  0b011: { name: "Xun", symbol: "☴", cn: "巽", gloss: "Wind" },
  0b100: { name: "Zhen", symbol: "☳", cn: "震", gloss: "Thunder" },
  0b101: { name: "Li", symbol: "☲", cn: "離", gloss: "Fire" },
  0b110: { name: "Dui", symbol: "☱", cn: "兌", gloss: "Lake" },
  0b111: { name: "Qian", symbol: "☰", cn: "乾", gloss: "Heaven" },
};

/**
 * The King Wen sequence lookup, indexed [lowerTrigram][upperTrigram] → number.
 * This is the canonical received ordering of the 64 hexagrams; it has no simple
 * closed form, so the table is given directly.
 */
const KING_WEN: Record<string, Record<string, number>> = {
  Qian: { Qian: 1, Zhen: 34, Kan: 5, Gen: 26, Kun: 11, Xun: 9, Li: 14, Dui: 43 },
  Zhen: { Qian: 25, Zhen: 51, Kan: 3, Gen: 27, Kun: 24, Xun: 42, Li: 21, Dui: 17 },
  Kan: { Qian: 6, Zhen: 40, Kan: 29, Gen: 4, Kun: 7, Xun: 59, Li: 64, Dui: 47 },
  Gen: { Qian: 33, Zhen: 62, Kan: 39, Gen: 52, Kun: 15, Xun: 53, Li: 56, Dui: 31 },
  Kun: { Qian: 12, Zhen: 16, Kan: 8, Gen: 23, Kun: 2, Xun: 20, Li: 35, Dui: 45 },
  Xun: { Qian: 44, Zhen: 32, Kan: 48, Gen: 18, Kun: 46, Xun: 57, Li: 50, Dui: 28 },
  Li: { Qian: 13, Zhen: 55, Kan: 63, Gen: 22, Kun: 36, Xun: 37, Li: 30, Dui: 49 },
  Dui: { Qian: 10, Zhen: 54, Kan: 60, Gen: 41, Kun: 19, Xun: 61, Li: 38, Dui: 58 },
};

export interface Hexagram {
  num: number; // King Wen number 1..64
  cn: string; // Chinese name
  pinyin: string;
  gloss: string; // short English gloss
}

/** The 64 hexagrams in King Wen order — number, Chinese name, pinyin, gloss. */
export const HEXAGRAMS: Record<number, Hexagram> = {
  1: { num: 1, cn: "乾", pinyin: "Qián", gloss: "The Creative" },
  2: { num: 2, cn: "坤", pinyin: "Kūn", gloss: "The Receptive" },
  3: { num: 3, cn: "屯", pinyin: "Zhūn", gloss: "Difficulty at the Beginning" },
  4: { num: 4, cn: "蒙", pinyin: "Méng", gloss: "Youthful Folly" },
  5: { num: 5, cn: "需", pinyin: "Xū", gloss: "Waiting" },
  6: { num: 6, cn: "訟", pinyin: "Sòng", gloss: "Conflict" },
  7: { num: 7, cn: "師", pinyin: "Shī", gloss: "The Army" },
  8: { num: 8, cn: "比", pinyin: "Bǐ", gloss: "Holding Together" },
  9: { num: 9, cn: "小畜", pinyin: "Xiǎo Xù", gloss: "Small Taming" },
  10: { num: 10, cn: "履", pinyin: "Lǚ", gloss: "Treading" },
  11: { num: 11, cn: "泰", pinyin: "Tài", gloss: "Peace" },
  12: { num: 12, cn: "否", pinyin: "Pǐ", gloss: "Standstill" },
  13: { num: 13, cn: "同人", pinyin: "Tóng Rén", gloss: "Fellowship" },
  14: { num: 14, cn: "大有", pinyin: "Dà Yǒu", gloss: "Great Possession" },
  15: { num: 15, cn: "謙", pinyin: "Qiān", gloss: "Modesty" },
  16: { num: 16, cn: "豫", pinyin: "Yù", gloss: "Enthusiasm" },
  17: { num: 17, cn: "隨", pinyin: "Suí", gloss: "Following" },
  18: { num: 18, cn: "蠱", pinyin: "Gǔ", gloss: "Work on the Decayed" },
  19: { num: 19, cn: "臨", pinyin: "Lín", gloss: "Approach" },
  20: { num: 20, cn: "觀", pinyin: "Guān", gloss: "Contemplation" },
  21: { num: 21, cn: "噬嗑", pinyin: "Shì Kè", gloss: "Biting Through" },
  22: { num: 22, cn: "賁", pinyin: "Bì", gloss: "Grace" },
  23: { num: 23, cn: "剝", pinyin: "Bō", gloss: "Splitting Apart" },
  24: { num: 24, cn: "復", pinyin: "Fù", gloss: "Return" },
  25: { num: 25, cn: "無妄", pinyin: "Wú Wàng", gloss: "Innocence" },
  26: { num: 26, cn: "大畜", pinyin: "Dà Xù", gloss: "Great Taming" },
  27: { num: 27, cn: "頤", pinyin: "Yí", gloss: "Nourishment" },
  28: { num: 28, cn: "大過", pinyin: "Dà Guò", gloss: "Great Exceeding" },
  29: { num: 29, cn: "坎", pinyin: "Kǎn", gloss: "The Abysmal Water" },
  30: { num: 30, cn: "離", pinyin: "Lí", gloss: "The Clinging Fire" },
  31: { num: 31, cn: "咸", pinyin: "Xián", gloss: "Influence" },
  32: { num: 32, cn: "恆", pinyin: "Héng", gloss: "Duration" },
  33: { num: 33, cn: "遯", pinyin: "Dùn", gloss: "Retreat" },
  34: { num: 34, cn: "大壯", pinyin: "Dà Zhuàng", gloss: "Great Power" },
  35: { num: 35, cn: "晉", pinyin: "Jìn", gloss: "Progress" },
  36: { num: 36, cn: "明夷", pinyin: "Míng Yí", gloss: "Darkening of the Light" },
  37: { num: 37, cn: "家人", pinyin: "Jiā Rén", gloss: "The Family" },
  38: { num: 38, cn: "睽", pinyin: "Kuí", gloss: "Opposition" },
  39: { num: 39, cn: "蹇", pinyin: "Jiǎn", gloss: "Obstruction" },
  40: { num: 40, cn: "解", pinyin: "Xiè", gloss: "Deliverance" },
  41: { num: 41, cn: "損", pinyin: "Sǔn", gloss: "Decrease" },
  42: { num: 42, cn: "益", pinyin: "Yì", gloss: "Increase" },
  43: { num: 43, cn: "夬", pinyin: "Guài", gloss: "Breakthrough" },
  44: { num: 44, cn: "姤", pinyin: "Gòu", gloss: "Coming to Meet" },
  45: { num: 45, cn: "萃", pinyin: "Cuì", gloss: "Gathering Together" },
  46: { num: 46, cn: "升", pinyin: "Shēng", gloss: "Pushing Upward" },
  47: { num: 47, cn: "困", pinyin: "Kùn", gloss: "Oppression" },
  48: { num: 48, cn: "井", pinyin: "Jǐng", gloss: "The Well" },
  49: { num: 49, cn: "革", pinyin: "Gé", gloss: "Revolution" },
  50: { num: 50, cn: "鼎", pinyin: "Dǐng", gloss: "The Cauldron" },
  51: { num: 51, cn: "震", pinyin: "Zhèn", gloss: "The Arousing Thunder" },
  52: { num: 52, cn: "艮", pinyin: "Gèn", gloss: "Keeping Still" },
  53: { num: 53, cn: "漸", pinyin: "Jiàn", gloss: "Development" },
  54: { num: 54, cn: "歸妹", pinyin: "Guī Mèi", gloss: "The Marrying Maiden" },
  55: { num: 55, cn: "豐", pinyin: "Fēng", gloss: "Abundance" },
  56: { num: 56, cn: "旅", pinyin: "Lǚ", gloss: "The Wanderer" },
  57: { num: 57, cn: "巽", pinyin: "Xùn", gloss: "The Gentle Wind" },
  58: { num: 58, cn: "兌", pinyin: "Duì", gloss: "The Joyous Lake" },
  59: { num: 59, cn: "渙", pinyin: "Huàn", gloss: "Dispersion" },
  60: { num: 60, cn: "節", pinyin: "Jié", gloss: "Limitation" },
  61: { num: 61, cn: "中孚", pinyin: "Zhōng Fú", gloss: "Inner Truth" },
  62: { num: 62, cn: "小過", pinyin: "Xiǎo Guò", gloss: "Small Exceeding" },
  63: { num: 63, cn: "既濟", pinyin: "Jì Jì", gloss: "After Completion" },
  64: { num: 64, cn: "未濟", pinyin: "Wèi Jì", gloss: "Before Completion" },
};

function bit(t: LineType): number {
  return t === "yang" ? 1 : 0;
}

/** Lower and upper trigrams (as bit values) for a bottom→top line array. */
export function trigramsOf(lines: LineType[]): { lower: number; upper: number } {
  const lower = bit(lines[0]) | (bit(lines[1]) << 1) | (bit(lines[2]) << 2);
  const upper = bit(lines[3]) | (bit(lines[4]) << 1) | (bit(lines[5]) << 2);
  return { lower, upper };
}

/** Resolve a bottom→top line array to its King Wen hexagram. */
export function hexagramOf(lines: LineType[]): Hexagram {
  const { lower, upper } = trigramsOf(lines);
  const lowerName = TRIGRAMS[lower].name;
  const upperName = TRIGRAMS[upper].name;
  const num = KING_WEN[lowerName][upperName];
  return HEXAGRAMS[num];
}

export interface TrigramPair {
  lower: Trigram;
  upper: Trigram;
}

export function trigramPairOf(lines: LineType[]): TrigramPair {
  const { lower, upper } = trigramsOf(lines);
  return { lower: TRIGRAMS[lower], upper: TRIGRAMS[upper] };
}
