"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

type LineVal = 6 | 7 | 8 | 9;
type Phase = "idle" | "casting" | "reading";

// ── King Wen table ────────────────────────────────────────────────────────────
// KW[lowerBin][upperBin] = hexagram number
// Trigram binary (LSB=bottom line, yang=1):
//   Kun=0  Zhen=1  Kan=2  Dui=3  Gen=4  Li=5  Xun=6  Qian=7
const KW: number[][] = [
  /* Kun  */ [ 2, 16,  8, 45, 23, 35, 20, 11],
  /* Zhen */ [24, 51,  3, 17, 27, 21, 42, 25],
  /* Kan  */ [ 7, 40, 29, 47,  4, 64, 59,  6],
  /* Dui  */ [19, 54, 60, 58, 41, 38, 61, 10],
  /* Gen  */ [15, 62, 39, 31, 52, 56, 53, 33],
  /* Li   */ [36, 55, 63, 49, 22, 30, 37, 13],
  /* Xun  */ [46, 32, 48, 28, 18, 50, 57, 44],
  /* Qian */ [12, 34,  5, 43, 26, 14,  9,  1],
];

// ── Hexagram data ─────────────────────────────────────────────────────────────
// [name, bpm, scale, baseMidi, density, filterHz, commentary]
type HexDatum = [string, number, string, number, number, number, string];

const HEX: Record<number, HexDatum> = {
   1: ["The Creative",        80, "major",      72, 4, 5000, "Pure creative force — strong, clear, arising."],
   2: ["The Receptive",       35, "pentatonic", 36, 1,  400, "Receptive earth — be still, yield, receive."],
   3: ["Difficulty at Start", 55, "minor",      48, 2, 1200, "Chaos precedes form — persevere through confusion."],
   4: ["Youthful Folly",      65, "pentatonic", 60, 2, 2000, "Young and unknowing — seek the teacher within."],
   5: ["Waiting",             45, "pentatonic", 48, 1, 1500, "Wait with sincerity — the time will come."],
   6: ["Conflict",            90, "chromatic",  48, 3, 1800, "Inner conflict — seek counsel, do not persist."],
   7: ["The Army",            70, "minor",      36, 3,  800, "Disciplined force — order emerges from the many."],
   8: ["Holding Together",    60, "major",      48, 3, 2500, "Union — come together willingly and truly."],
   9: ["Small Taming",        75, "pentatonic", 60, 2, 3000, "Clouds gather but no rain — small restraint holds."],
  10: ["Treading",            85, "major",      60, 2, 3500, "Tread on the tiger's tail — conduct yourself well."],
  11: ["Peace",               70, "major",      60, 4, 4000, "Heaven and earth unite — great peace flows."],
  12: ["Standstill",          40, "minor",      36, 1,  600, "Stagnation — heaven and earth draw apart."],
  13: ["Fellowship",          80, "major",      60, 4, 4500, "Fellowship in the open — gather in the light."],
  14: ["Great Possession",    85, "major",      72, 5, 5000, "Great abundance — all things flourish under the sun."],
  15: ["Modesty",             55, "pentatonic", 48, 2, 2000, "Modesty — the mountain bows beneath the earth."],
  16: ["Enthusiasm",         120, "major",      60, 4, 4000, "Enthusiasm — thunder rises, the earth responds."],
  17: ["Following",           75, "major",      60, 3, 3500, "Following — adapt to the movement of the time."],
  18: ["Work on Decayed",     60, "chromatic",  48, 2, 1200, "Decay corrected — what was broken can be mended."],
  19: ["Approach",            65, "major",      60, 3, 3000, "Approach — the great time draws near."],
  20: ["Contemplation",       40, "pentatonic", 48, 1, 1500, "Contemplate — observe before you act."],
  21: ["Biting Through",     100, "chromatic",  48, 3, 2500, "Bite through — force removes the obstacle."],
  22: ["Grace",               70, "major",      60, 3, 4000, "Grace — beauty adorns what is simple."],
  23: ["Splitting Apart",     35, "chromatic",  36, 1,  500, "Splitting apart — do not act against the tide."],
  24: ["Return",              60, "major",      48, 2, 3000, "Return — one yang line rises at the bottom."],
  25: ["Innocence",           80, "pentatonic", 60, 3, 4000, "Innocence — act without calculated expectation."],
  26: ["Great Taming",        65, "major",      60, 3, 2500, "Great taming — conserve great strength for its time."],
  27: ["Nourishment",         50, "pentatonic", 48, 2, 1800, "Nourishment — attend carefully to what you take in."],
  28: ["Great Excess",        85, "chromatic",  48, 4, 2000, "Great excess — the ridgepole sags under the weight."],
  29: ["The Abysmal",         50, "chromatic",  36, 2,  600, "The abyss — pass through danger with sincerity."],
  30: ["The Clinging",       110, "major",      72, 3, 5000, "Fire clings — clarity through attachment and light."],
  31: ["Influence",           70, "major",      60, 3, 3500, "Influence — the lake rests upon the mountain."],
  32: ["Duration",            60, "pentatonic", 48, 2, 2000, "Duration — endure steadily in the correct way."],
  33: ["Retreat",             45, "minor",      48, 1, 1200, "Retreat — withdraw gracefully before advancing darkness."],
  34: ["Great Power",        100, "major",      72, 4, 4500, "Great power — thunder sounds in the sky above."],
  35: ["Progress",            80, "major",      60, 3, 4000, "Progress — the sun rises over the welcoming earth."],
  36: ["Darkening of Light",  40, "minor",      36, 1,  500, "Darkening — preserve your inner light in the dark."],
  37: ["The Family",          65, "major",      60, 3, 3000, "The family — inner order radiates outward."],
  38: ["Opposition",          90, "chromatic",  60, 2, 2500, "Opposition — in small things, proceed."],
  39: ["Obstruction",         55, "minor",      48, 2, 1000, "Obstruction — seek allies, turn inward for strength."],
  40: ["Deliverance",         80, "major",      60, 3, 3500, "Deliverance — the storm passes, the pressure releases."],
  41: ["Decrease",            50, "minor",      48, 2, 1500, "Decrease — sincerity in the act of reduction."],
  42: ["Increase",            80, "major",      60, 4, 4000, "Increase — the time of growth and giving."],
  43: ["Breakthrough",       120, "major",      72, 4, 5000, "Breakthrough — announce it in the king's court."],
  44: ["Coming to Meet",      75, "chromatic",  60, 3, 2500, "Coming to meet — do not go further than halfway."],
  45: ["Gathering Together",  70, "major",      60, 4, 3500, "Gathering — the king approaches the ancestral temple."],
  46: ["Pushing Upward",      75, "major",      60, 3, 3000, "Pushing upward — wood rises quietly from the earth."],
  47: ["Oppression",          45, "minor",      36, 1,  700, "Oppression — exhausted but the superior person prevails."],
  48: ["The Well",            55, "pentatonic", 48, 2, 2000, "The well — its water never changes, feeds all."],
  49: ["Revolution",         110, "major",      72, 4, 5000, "Revolution — the season turns on its proper day."],
  50: ["The Cauldron",        75, "major",      60, 3, 4000, "The cauldron — transformation through sacred fire."],
  51: ["The Arousing",       140, "chromatic",  48, 5, 2000, "Thunder — shock brings laughter after the fright."],
  52: ["Keeping Still",       35, "pentatonic", 36, 1,  800, "Keeping still — the mountain rests upon itself."],
  53: ["Development",         60, "pentatonic", 60, 2, 2500, "Development — the wild goose migrates, slowly, rightly."],
  54: ["Marrying Maiden",     85, "chromatic",  60, 3, 2500, "Marrying maiden — act carefully, know your position."],
  55: ["Abundance",           90, "major",      72, 5, 5000, "Abundance — the sun stands at its zenith."],
  56: ["The Wanderer",        55, "minor",      60, 2, 2000, "The wanderer — move through the world without attachment."],
  57: ["The Gentle",          60, "pentatonic", 60, 2, 3000, "The gentle wind — penetrate steadily with softness."],
  58: ["The Joyous",          80, "major",      60, 4, 4500, "Joyful — the lake's openness encourages all."],
  59: ["Dispersion",          70, "pentatonic", 60, 3, 3000, "Dispersion — dissolve rigidity, wind moves the water."],
  60: ["Limitation",          60, "minor",      48, 2, 1500, "Limitation — galling limits should not be persisted in."],
  61: ["Inner Truth",         70, "major",      60, 3, 4000, "Inner truth — pigs and fish yield to genuine sincerity."],
  62: ["Small Excess",        65, "minor",      48, 2, 1500, "Small excess — the small bird should not fly too high."],
  63: ["After Completion",    75, "major",      60, 3, 3000, "After completion — order achieved, disorder begins again."],
  64: ["Before Completion",   65, "chromatic",  48, 2, 1800, "Before completion — the fox crosses the ice carefully."],
};

// ── Scale intervals (semitones from root) ────────────────────────────────────
const SCALES: Record<string, number[]> = {
  major:      [0, 4, 7, 12, 16, 19],
  minor:      [0, 3, 7, 10, 12, 15],
  pentatonic: [0, 2, 4, 7,  9, 12],
  chromatic:  [0, 1, 2, 3,  5,  7],
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function castCoin(): 2 | 3 {
  return Math.random() < 0.5 ? 2 : 3;
}

function lineFromCoins(a: number, b: number, c: number): LineVal {
  return (a + b + c) as LineVal;
}

function yangBit(v: LineVal): number {
  return v === 7 || v === 9 ? 1 : 0;
}

function hexNumFromLines(ls: LineVal[]): number {
  const lower = yangBit(ls[0]) + yangBit(ls[1]) * 2 + yangBit(ls[2]) * 4;
  const upper = yangBit(ls[3]) + yangBit(ls[4]) * 2 + yangBit(ls[5]) * 4;
  return KW[lower][upper];
}

function registerLabel(baseMidi: number): string {
  return `C${Math.round((baseMidi - 24) / 12)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OracleMusic() {
  const [phase, setPhase]       = useState<Phase>("idle");
  const [lines, setLines]       = useState<LineVal[]>([]);
  const [lineIdx, setLineIdx]   = useState(0);
  const [coins, setCoins]       = useState<[number, number, number]>([0, 0, 0]);
  const [spinning, setSpinning] = useState(false);
  const [hexNum, setHexNum]     = useState(0);

  const acRef      = useRef<AudioContext | null>(null);
  const filterRef  = useRef<BiquadFilterNode | null>(null);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hexRef     = useRef(0);   // stable ref to current hexagram number
  const linesRef   = useRef<LineVal[]>([]);

  // ── Audio: fire one note ────────────────────────────────────────────────────
  const fireNote = useCallback(
    (freq: number, startTime: number, bpm: number, density: number) => {
      const ac   = acRef.current;
      const filt = filterRef.current;
      if (!ac || !filt) return;
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(filt);
      osc.type = "triangle";
      osc.frequency.value = freq;
      const beatDur = 60 / bpm;
      const attack  = Math.min(0.1, beatDur * 0.18);
      const dur     = beatDur * 0.72;
      const peak    = 0.22 / Math.sqrt(density);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(peak, startTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
      osc.start(startTime);
      osc.stop(startTime + dur + 0.06);
    },
    []
  );

  // ── Audio: trigger chord from current hexagram ──────────────────────────────
  const triggerChord = useCallback(() => {
    const ac   = acRef.current;
    const filt = filterRef.current;
    if (!ac || !filt) return;
    const datum = HEX[hexRef.current];
    if (!datum) return;
    const [, bpm, scale, baseMidi, density, fc] = datum;
    const intervals = SCALES[scale] ?? SCALES.major;
    const now = ac.currentTime;
    filt.frequency.exponentialRampToValueAtTime(Math.max(80, fc), now + 0.4);
    const offset = Math.floor(Math.random() * 3);
    const isArp  = density > 2;
    for (let i = 0; i < Math.min(density, intervals.length); i++) {
      const semis    = intervals[(offset + i) % intervals.length];
      const freq     = midiToHz(baseMidi + semis);
      const arpDelay = isArp ? (60 / bpm / density) * i : 0;
      fireNote(freq, now + arpDelay, bpm, density);
    }
  }, [fireNote]);

  // ── Audio: beat loop ────────────────────────────────────────────────────────
  const scheduleBeat = useCallback(() => {
    const datum = HEX[hexRef.current];
    if (!datum) return;
    triggerChord();
    timerRef.current = setTimeout(scheduleBeat, 60000 / datum[1]);
  }, [triggerChord]);

  // ── Audio: start ────────────────────────────────────────────────────────────
  const startAudio = useCallback(
    (num: number) => {
      const datum = HEX[num];
      if (!datum) return;
      hexRef.current = num;
      const ac     = new AudioContext();
      acRef.current = ac;
      const filt   = ac.createBiquadFilter();
      filt.type    = "lowpass";
      filt.frequency.value = datum[5];
      filt.Q.value = 0.65;
      filterRef.current = filt;
      const master = ac.createGain();
      master.gain.value = 0.65;
      filt.connect(master);
      master.connect(ac.destination);
      // First beat after the hexagram fully reveals
      timerRef.current = setTimeout(scheduleBeat, 900);
    },
    [scheduleBeat]
  );

  // ── Audio: stop ─────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    acRef.current?.close();
    acRef.current   = null;
    filterRef.current = null;
  }, []);

  // ── Casting sequence ────────────────────────────────────────────────────────
  const runCast = useCallback(async () => {
    setPhase("casting");
    setLines([]);
    setHexNum(0);
    linesRef.current = [];

    for (let i = 0; i < 6; i++) {
      setLineIdx(i);
      setSpinning(true);
      setCoins([0, 0, 0]);
      await new Promise<void>((r) => setTimeout(r, 550));

      const a = castCoin();
      const b = castCoin();
      const c = castCoin();
      setCoins([a, b, c]);
      setSpinning(false);
      await new Promise<void>((r) => setTimeout(r, 380));

      const lv = lineFromCoins(a, b, c);
      linesRef.current = [...linesRef.current, lv];
      setLines([...linesRef.current]);
      await new Promise<void>((r) => setTimeout(r, 260));
    }

    const finalLines = linesRef.current as LineVal[];
    const num = hexNumFromLines(finalLines);
    setHexNum(num);
    setPhase("reading");
    startAudio(num);
  }, [startAudio]);

  const handleCast = useCallback(() => {
    stopAudio();
    runCast();
  }, [stopAudio, runCast]);

  useEffect(() => () => { stopAudio(); }, [stopAudio]);

  const datum = HEX[hexNum];

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 py-10 relative">

      {/* Header */}
      <div className="text-center mb-10">
        <div className="text-[9px] tracking-[0.35em] uppercase text-muted-foreground/70 mb-2">
          Dream Sandbox · /dream/69-oracle-music
        </div>
        <h1 className="text-3xl tracking-tight text-foreground">Oracle Music</h1>
        <p className="text-sm text-muted-foreground/70 mt-2">The I Ching answers in sound</p>
      </div>

      {/* Central panel */}
      <div className="flex flex-col items-center gap-8 w-full max-w-[18rem]">

        {/* ── IDLE ── */}
        {phase === "idle" && (
          <div className="flex flex-col items-center gap-7">
            <p className="text-xs text-muted-foreground/70 text-center leading-relaxed">
              Three coins are cast six times. Their sum on each throw
              determines a line — solid or broken. Six lines form one of
              64 hexagrams, each with its own music.
            </p>
            {/* Ghost hexagram placeholder */}
            <div className="flex flex-col-reverse gap-[7px]" style={{ width: 148 }}>
              {([8, 7, 8, 7, 8, 7] as LineVal[]).map((v, i) => (
                <HexLine key={i} value={v} dim />
              ))}
            </div>
            <button
              onClick={handleCast}
              className="px-8 py-4 text-sm tracking-widest uppercase border border-border rounded hover:bg-accent hover:border-border transition text-muted-foreground"
            >
              ✦ Cast the Coins
            </button>
          </div>
        )}

        {/* ── CASTING ── */}
        {phase === "casting" && (
          <div className="flex flex-col items-center gap-6">
            <div className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70">
              Line {lineIdx + 1} of 6
            </div>

            {/* Three coins */}
            <div className="flex gap-5">
              {([0, 1, 2] as const).map((i) => {
                const val = coins[i];
                const isYang = val === 3;
                const style: CSSProperties = {
                  width: 38, height: 38, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16,
                  borderWidth: 1.5, borderStyle: "solid",
                  borderColor: isYang ? "rgba(255,210,50,0.75)" : "rgba(255,255,255,0.28)",
                  background: isYang ? "rgba(255,210,50,0.12)" : "transparent",
                  color: isYang ? "rgba(255,210,50,0.9)" : "rgba(255,255,255,0.6)",
                  opacity: spinning ? 0.3 : 1,
                  transform: spinning ? "scale(0.8) rotate(160deg)" : "scale(1) rotate(0deg)",
                  transition: "all 0.28s ease",
                };
                return (
                  <div key={i} style={style}>
                    {!spinning && (isYang ? "●" : "○")}
                  </div>
                );
              })}
            </div>

            {/* Coin readout */}
            {!spinning && coins[0] !== 0 && (
              <div className="text-[10px] text-muted-foreground/70 tracking-wider text-center">
                {coins[0] === 3 ? "yang" : "yin"} · {coins[1] === 3 ? "yang" : "yin"} · {coins[2] === 3 ? "yang" : "yin"}
                <span className="text-muted-foreground ml-2">
                  = {lineFromCoins(coins[0], coins[1], coins[2])}
                  {" — "}
                  {lineFromCoins(coins[0], coins[1], coins[2]) === 6 ? "moving yin" :
                   lineFromCoins(coins[0], coins[1], coins[2]) === 7 ? "stable yang" :
                   lineFromCoins(coins[0], coins[1], coins[2]) === 8 ? "stable yin" : "moving yang"}
                </span>
              </div>
            )}

            {/* Hexagram building */}
            <div className="flex flex-col-reverse gap-[7px]" style={{ width: 148 }}>
              {lines.map((lv, i) => (
                <HexLine key={i} value={lv} dim={false} />
              ))}
              {Array.from({ length: 6 - lines.length }).map((_, i) => (
                <HexLine key={`ph${i}`} value={8} dim />
              ))}
            </div>
          </div>
        )}

        {/* ── READING ── */}
        {phase === "reading" && datum && (
          <div className="flex flex-col items-center gap-5" style={{ animation: "oracleIn 0.7s ease forwards" }}>
            <div className="text-[9px] tracking-[0.3em] uppercase text-muted-foreground/70">
              Hexagram {hexNum}
            </div>

            {/* Hexagram symbol */}
            <div className="flex flex-col-reverse gap-[7px]" style={{ width: 148 }}>
              {lines.map((lv, i) => (
                <HexLine key={i} value={lv} dim={false} />
              ))}
            </div>

            {/* Name */}
            <div className="text-xl tracking-wide text-foreground text-center">
              {datum[0]}
            </div>

            {/* Commentary */}
            <div className="text-xs text-muted-foreground text-center leading-relaxed max-w-[13rem]">
              {datum[6]}
            </div>

            {/* Musical parameters */}
            <div className="flex flex-col items-center gap-1 text-[10px] tracking-[0.18em] text-muted-foreground/70">
              <div>{datum[1]} BPM · {datum[2]}</div>
              <div>register {registerLabel(datum[3])} · {datum[4]} voices</div>
            </div>

            {/* Sounding indicator */}
            <div className="flex items-center gap-2">
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: "rgba(255,255,255,0.55)",
                animation: "oraclePulse 1.4s ease-in-out infinite",
              }} />
              <span className="text-[10px] text-muted-foreground/70 tracking-wider">sounding</span>
            </div>

            {/* Moving lines notice */}
            {lines.some(v => v === 6 || v === 9) && (
              <div className="text-[10px] text-violet-300/60 text-center">
                ✦ moving lines present — the hexagram is in transition
              </div>
            )}

            <button
              onClick={handleCast}
              className="mt-1 px-6 py-3 text-xs tracking-widest uppercase border border-border rounded hover:bg-accent hover:border-border transition text-muted-foreground"
            >
              ✦ Cast again
            </button>
          </div>
        )}

        <Link href="/dream" className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground mt-2">
          ← back to dream sandbox
        </Link>
      </div>

      <style>{`
        @keyframes oraclePulse {
          0%, 100% { opacity: 0.35; transform: scale(0.88); }
          50%       { opacity: 1;    transform: scale(1.25); }
        }
        @keyframes oracleIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes oracleLine {
          from { opacity: 0; transform: scaleX(0.4); }
          to   { opacity: 1; transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}

// ── Hexagram line ─────────────────────────────────────────────────────────────

function HexLine({ value, dim }: { value: LineVal; dim: boolean }) {
  const yang    = value === 7 || value === 9;
  const moving  = value === 6 || value === 9;
  const opacity = dim ? 0.12 : 1;

  const barStyle: CSSProperties = {
    height: 4,
    borderRadius: 3,
    background: moving ? "rgba(255,210,50,0.9)" : "rgba(255,255,255,0.88)",
    boxShadow: moving
      ? "0 0 8px rgba(255,210,50,0.55)"
      : "0 0 5px rgba(255,255,255,0.25)",
    animation: dim ? undefined : "oracleLine 0.22s ease forwards",
  };

  if (yang) {
    return (
      <div style={{ opacity, width: "100%" }}>
        <div style={barStyle} />
      </div>
    );
  }
  return (
    <div style={{ opacity, display: "flex", gap: 10, alignItems: "center" }}>
      <div style={{ ...barStyle, flex: 1 }} />
      {moving ? (
        <div style={{
          width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
          background: "rgba(255,210,50,0.9)",
          boxShadow: "0 0 8px rgba(255,210,50,0.7)",
        }} />
      ) : (
        <div style={{ width: 16, flexShrink: 0 }} />
      )}
      <div style={{ ...barStyle, flex: 1 }} />
    </div>
  );
}
