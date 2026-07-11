"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";

// ─── Hexagram data ──────────────────────────────────────────────────────────
// Trigram bit encoding: bit0=bottom_of_trigram, bit1=middle, bit2=top
// K'un=0 Chen=1 K'an=2 Tui=3 Ken=4 Li=5 Sun=6 Ch'ien=7
// KW_TABLE[lower_bits][upper_bits] = King Wen number 1–64
const KW_TABLE: ReadonlyArray<ReadonlyArray<number>> = [
  [2, 16, 8, 45, 23, 35, 20, 12], // lower 0 K'un
  [24, 51, 3, 17, 27, 21, 42, 25], // lower 1 Chen
  [7, 40, 29, 47, 4, 64, 59, 6], // lower 2 K'an
  [19, 54, 60, 58, 41, 38, 61, 10], // lower 3 Tui
  [15, 62, 39, 31, 52, 56, 53, 33], // lower 4 Ken
  [36, 55, 63, 49, 22, 30, 37, 13], // lower 5 Li
  [46, 32, 48, 28, 18, 50, 57, 44], // lower 6 Sun
  [11, 34, 5, 43, 26, 14, 9, 1], // lower 7 Ch'ien
];

function computeKW(lines: number[]): number {
  const lower = lines[0] | (lines[1] << 1) | (lines[2] << 2);
  const upper = lines[3] | (lines[4] << 1) | (lines[5] << 2);
  return KW_TABLE[lower][upper];
}

interface HexagramEntry {
  name: string;
  chinese: string;
  interp: string;
  prompt: string;
}

// Index = King Wen number − 1 (index 0 = Hexagram 1)
const HEXAGRAMS: ReadonlyArray<HexagramEntry> = [
  { name: "Ch'ien — The Creative", chinese: "乾", interp: "Pure creative force fills the sky with ceaseless motion. Heaven's power moves without rest or diminishment.", prompt: "triumphant orchestral, rising major chord, celestial power, bright and expansive, 85 BPM" },
  { name: "K'un — The Receptive", chinese: "坤", interp: "The earth receives all things with quiet devotion. Deep stillness opens an inexhaustible capacity.", prompt: "deep drone, dark low strings, earth resonance, slow meditative, 30 BPM, bass register" },
  { name: "Chun — Difficulty at the Beginning", chinese: "屯", interp: "A blade of grass pushes through frozen ground. In disorder the seeds of order are already present.", prompt: "sparse piano emerging from silence, slow building, minor with hope, 45 BPM" },
  { name: "Meng — Youthful Folly", chinese: "蒙", interp: "A spring wells up from beneath the mountain. The young student seeks the teacher with fresh eyes.", prompt: "gentle music box, simple pentatonic melody, curious and light, 60 BPM" },
  { name: "Hsu — Waiting", chinese: "需", interp: "Clouds gather above the sky — rain has not yet fallen. Patient waiting nourishes the spirit.", prompt: "suspended held chords, gentle tension, waiting calm, 50 BPM, strings" },
  { name: "Sung — Conflict", chinese: "訟", interp: "Water flows opposite to heaven — tension seeks resolution. Pause before pressing the dispute further.", prompt: "dissonant minor intervals, slow chromatic motion, unresolved tension, 55 BPM" },
  { name: "Shih — The Army", chinese: "師", interp: "Water gathers in the earth, disciplined and contained. Leadership requires order and shared purpose.", prompt: "slow march rhythm, deep bass, disciplined, 60 BPM, ceremonial percussion" },
  { name: "Pi — Holding Together", chinese: "比", interp: "Water flows upon the earth — streams seeking the river. Unity arises from genuine accord.", prompt: "warm flowing strings, gentle waves, togetherness, 55 BPM, major key" },
  { name: "Hsiao Ch'u — The Taming Power of the Small", chinese: "小畜", interp: "Wind drives over heaven, gathering but not yet releasing. Small restraint brings eventual progress.", prompt: "airy flute tones, light wind texture, gentle persistence, 65 BPM" },
  { name: "Lü — Treading", chinese: "履", interp: "A tiger is tread upon yet does not bite — conduct with awareness. Walk the path with careful grace.", prompt: "careful stepping melody, single piano, precise and quiet, 70 BPM" },
  { name: "T'ai — Peace", chinese: "泰", interp: "Heaven descends and earth rises — the two meet in harmony. The great and small flow together in abundance.", prompt: "open major harmony, warm and bright, peaceful, 60 BPM, rising phrases" },
  { name: "P'i — Standstill", chinese: "否", interp: "Heaven rises away from earth — communion is severed. In times of stagnation, the noble one withdraws inward.", prompt: "cold drone, descending minor, distant, withdrawn, 40 BPM" },
  { name: "T'ung Jen — Fellowship with Men", chinese: "同人", interp: "Fire rises toward heaven — two flames aspiring together. Fellowship endures when founded on openness.", prompt: "bright warm unison melody, uplifting, shared harmony, 75 BPM" },
  { name: "Ta Yu — Possession in Great Measure", chinese: "大有", interp: "Fire blazes in the center of heaven — great clarity and abundance. Wealth comes to those who resist arrogance.", prompt: "full orchestral, rich and abundant, triumphant, 80 BPM, warm brass" },
  { name: "Ch'ien — Modesty", chinese: "謙", interp: "Mountain beneath the earth — great height hidden below. True strength does not announce itself.", prompt: "quiet sustained tones, humble and soft, sparse, 45 BPM, low register" },
  { name: "Yü — Enthusiasm", chinese: "豫", interp: "Thunder erupts from the earth in a burst of release. When ready, move forward with joyful energy.", prompt: "building energy, rhythmic pulse, joyful release, 90 BPM, percussion" },
  { name: "Sui — Following", chinese: "隨", interp: "Thunder over the lake — the lake follows the thunder's voice. Flexibility and responsiveness open every door.", prompt: "gentle responsive melody, light and following, 70 BPM, soft dance rhythm" },
  { name: "Ku — Work on What Has Been Spoiled", chinese: "蠱", interp: "Wind stirs beneath the mountain — decay calls for renewal. Face what has been neglected with courage.", prompt: "dark minor, slow resolution, serious intention, 50 BPM, low cello" },
  { name: "Lin — Approach", chinese: "臨", interp: "The earth rests over the lake — something great draws near. Welcome the approaching tide with receptivity.", prompt: "anticipating melody, building slowly, hopeful, 60 BPM" },
  { name: "Kuan — Contemplation", chinese: "觀", interp: "Wind moves over the earth — one surveys what cannot be fully seen. Deep looking reveals hidden order.", prompt: "meditative drones, slow panoramic, wide reverb, 35 BPM, spacious" },
  { name: "Shih Ho — Biting Through", chinese: "噬嗑", interp: "Fire and thunder — lightning pierces with decisive clarity. Obstacles yield to principled force.", prompt: "sharp attack notes, decisive rhythm, cutting through, 80 BPM" },
  { name: "Pi — Grace", chinese: "賁", interp: "Fire at the foot of the mountain — beauty illuminates form. Adorn what is inwardly true.", prompt: "lyrical piano melody, graceful and beautiful, warm reverb, 65 BPM" },
  { name: "Po — Splitting Apart", chinese: "剥", interp: "The mountain rests on the earth and slowly erodes. When the ground falls away, wait for the new seed.", prompt: "descending minor phrases, fragmentation, slow dissolution, 40 BPM" },
  { name: "Fu — Return", chinese: "復", interp: "Thunder stirs deep within the earth — the solstice turns. The first tender shoot of return rises.", prompt: "first light dawn music, single rising tone, quiet rebirth, 55 BPM" },
  { name: "Wu Wang — Innocence", chinese: "無妄", interp: "Thunder under heaven — action without ulterior motive. Move naturally and let things unfold as they will.", prompt: "open and free melody, innocent wonder, pure tones, 70 BPM" },
  { name: "Ta Ch'u — The Taming Power of the Great", chinese: "大畜", interp: "Heaven within the mountain — vast force held in reserve. Great potential awaits its proper moment.", prompt: "restrained power, held tension resolving slowly, 55 BPM, wide dynamic range" },
  { name: "I — The Corners of the Mouth", chinese: "頤", interp: "Thunder and mountain face each other in stillness. Feed the spirit as carefully as the body.", prompt: "gentle sustain, nourishing warmth, soft overtones, 50 BPM" },
  { name: "Ta Kuo — Preponderance of the Great", chinese: "大過", interp: "Lake above and below — the ridgepole bends under excess. Great weight calls for decisive action before collapse.", prompt: "heavy sustained low tones, weight and pressure, slow resolution, 45 BPM" },
  { name: "K'an — The Abysmal", chinese: "坎", interp: "Water flows over water — peril upon peril. Move through the depths with constancy and faith.", prompt: "deep water resonance, dark bass drone, 40 BPM, underground echoes" },
  { name: "Li — The Clinging Fire", chinese: "離", interp: "Fire clings to its fuel — clarity depends on what it illuminates. To shed light, surrender attachment.", prompt: "bright shimmering harmonics, fire overtones, warm glow, 70 BPM" },
  { name: "Hsien — Influence", chinese: "咸", interp: "Lake over mountain — still water resting on high ground. Subtle attraction draws kindred spirits together.", prompt: "gentle attraction, soft arpeggios, tender pull, 60 BPM" },
  { name: "Heng — Duration", chinese: "恆", interp: "Thunder and wind endure together without ceasing. What persists through change is the true nature.", prompt: "repeating cyclic melody, enduring rhythm, calm persistence, 65 BPM" },
  { name: "Tun — Retreat", chinese: "遯", interp: "Heaven above and mountain below — graceful withdrawal. Retreat is not defeat; it preserves strength.", prompt: "fading away, gentle diminuendo, quiet and receding, 45 BPM" },
  { name: "Ta Chuang — The Power of the Great", chinese: "大壯", interp: "Thunder rises above heaven — immense strength surges outward. Use great power with the discipline it demands.", prompt: "powerful rhythm, bold energy, strong bass pulse, 95 BPM" },
  { name: "Chin — Progress", chinese: "晉", interp: "Fire blazes over the earth — the sun rises, progress is sure. The clear and devoted rise naturally.", prompt: "rising optimistic melody, bright morning, progressive energy, 75 BPM" },
  { name: "Ming I — Darkening of the Light", chinese: "明夷", interp: "Fire sinks into the earth — light is wounded. In darkness, shelter the inner flame with care.", prompt: "dim and somber, quiet minor, hidden inner warmth, 40 BPM" },
  { name: "Chia Jen — The Family", chinese: "家人", interp: "Wind fans the inner fire — the household thrives on shared warmth. Each person's role sustains the whole.", prompt: "warm chamber music, home and hearth, gentle major, 60 BPM" },
  { name: "K'uei — Opposition", chinese: "睽", interp: "Fire above and lake below — they move in opposite directions. In opposition, small steps find unexpected accord.", prompt: "call and response, two voices in tension, 65 BPM" },
  { name: "Chien — Obstruction", chinese: "蹇", interp: "Water rests on the mountain — forward progress is blocked. Turning inward, one finds the path around.", prompt: "halting melody, obstacles, slow and considered, 45 BPM, minor key" },
  { name: "Hsieh — Deliverance", chinese: "解", interp: "Thunder over water — the storm breaks and pressure releases. Swiftly return to normal life after liberation.", prompt: "release and relief, tension dissolving, bright resolution, 70 BPM" },
  { name: "Sun — Decrease", chinese: "損", interp: "Mountain over lake — something is reduced for a higher purpose. Sincerity makes decrease rich.", prompt: "quiet simplicity, letting go, slow single notes, 45 BPM" },
  { name: "I — Increase", chinese: "益", interp: "Wind and thunder augment each other — both gain strength. Seize the moment; increase flows from sincere giving.", prompt: "growing and expanding, adding voices, warm crescendo, 70 BPM" },
  { name: "Kuai — Breakthrough", chinese: "夬", interp: "Water surges above heaven — the breakthrough is at hand. Resolve and declare; one step clears the final obstacle.", prompt: "decisive breakthrough, strong and clear, 85 BPM" },
  { name: "Kou — Coming to Meet", chinese: "姤", interp: "Wind flows beneath heaven — something unexpected arrives. Discern carefully what approaches from below.", prompt: "unexpected encounter, wandering melody, curious tonality, 60 BPM" },
  { name: "Ts'ui — Gathering Together", chinese: "萃", interp: "Lake over the earth — water gathers in the low places. People assemble around a worthy center.", prompt: "gathering voices, communal warmth, rounds and harmonics, 65 BPM" },
  { name: "Sheng — Pushing Upward", chinese: "升", interp: "Wood grows up through the earth — effortless ascent. Rise steadily through patient, persistent effort.", prompt: "gradual ascending melody, growth and rising, 60 BPM, hopeful" },
  { name: "K'un — Oppression", chinese: "困", interp: "Lake drains into the earth — the water is exhausted. When confined, inner joy sustains the spirit.", prompt: "sparse and confined, single voice, 35 BPM, restrained" },
  { name: "Ching — The Well", chinese: "井", interp: "Water rises through wood — the well feeds all without diminishing. Return always to the inexhaustible source.", prompt: "deep and clear, rising from depth, 50 BPM, cool sustained tones" },
  { name: "Ko — Revolution", chinese: "革", interp: "Fire below the lake — incompatible forces transform each other. Fundamental change requires the right moment.", prompt: "transforming energy, shifting harmonics, modal change, 75 BPM" },
  { name: "Ting — The Caldron", chinese: "鼎", interp: "Fire beneath the wood — the sacred vessel is heated. Refinement transforms raw material into nourishment.", prompt: "ritual fire, slow transformation, ceremonial, 55 BPM" },
  { name: "Chên — The Arousing", chinese: "震", interp: "Thunder over thunder — shock follows shock in succession. After the first terror, laughter returns.", prompt: "percussive shock, sharp attack, thunder-like, 90 BPM, electrifying" },
  { name: "Ken — Keeping Still", chinese: "艮", interp: "Mountain over mountain — absolute stillness. Rest the body and mind together; action will come.", prompt: "complete stillness, sustained single drone, 30 BPM, mountain silence" },
  { name: "Chien — Development", chinese: "漸", interp: "Wind over the mountain — the wild goose migrates in sequence. Gradual progress follows the natural order.", prompt: "gentle progression, step by step, 55 BPM, patient melody" },
  { name: "Kuei Mei — The Marrying Maiden", chinese: "歸妹", interp: "Thunder over the lake — the lesser in service of the greater. Relationship requires knowing one's place.", prompt: "tender and bittersweet, 60 BPM, minor-major ambiguity" },
  { name: "Feng — Abundance", chinese: "豐", interp: "Thunder and lightning together — this moment is at its zenith. Be not sad that high noon does not last.", prompt: "fullness and abundance, bright peak, 85 BPM, luminous" },
  { name: "Lü — The Wanderer", chinese: "旅", interp: "Fire moves over the mountain — the stranger passes through. Travel light; dwelling must come from within.", prompt: "wandering lonely melody, sparse accompaniment, 50 BPM, solo voice" },
  { name: "Sun — The Gentle", chinese: "巽", interp: "Wind follows wind — gentle persistence penetrates everywhere. Repeated small influences achieve great things.", prompt: "gentle wind, soft insistent melody, 55 BPM, airy" },
  { name: "Tui — The Joyous", chinese: "兌", interp: "Lake over lake — joy springs from inner truth. Genuine delight in the present moment refreshes all things.", prompt: "joyful and sparkling, bright arpeggios, 80 BPM, pure delight" },
  { name: "Huan — Dispersion", chinese: "渙", interp: "Wind blows over the water — it disperses and dissolves. Let the hard heart soften and flow.", prompt: "dissolving harmonics, fluid and dispersing, 55 BPM, open spaces" },
  { name: "Chieh — Limitation", chinese: "節", interp: "Water over the lake — when the lake is full, water overflows. Limitation channels power into purpose.", prompt: "precise and bounded, clear structure, 65 BPM, disciplined rhythm" },
  { name: "Chung Fu — Inner Truth", chinese: "中孚", interp: "Wind over the lake — truth emanates from the center outward. Sincerity moves even the hardest hearts.", prompt: "pure inner resonance, honest melody, open harmony, 60 BPM" },
  { name: "Hsiao Kuo — Preponderance of the Small", chinese: "小過", interp: "Thunder over the mountain — the small surpasses the great. Attend to small things with more care than large.", prompt: "delicate and precise, small gestures, quiet attention, 50 BPM" },
  { name: "Chi Chi — After Completion", chinese: "既濟", interp: "Water above fire — perfect balance achieved. But completion contains the seed of unraveling; stay attentive.", prompt: "balanced resolution, quiet satisfaction, 60 BPM, gentle close" },
  { name: "Wei Chi — Before Completion", chinese: "未濟", interp: "Fire above water — the fox crosses, but the tail gets wet. The end is near; do not falter on the final step.", prompt: "incomplete resolution, yearning, almost but not yet, 65 BPM, suspended harmony" },
];

// ─── Bloom ───────────────────────────────────────────────────────────────────

const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function CoinDisc({
  isHeads,
  flipping,
  delayMs,
}: {
  isHeads: boolean;
  flipping: boolean;
  delayMs: number;
}) {
  return (
    <div
      className="w-14 h-14 rounded-full border-2 flex items-center justify-center text-xl select-none"
      style={{
        borderColor: isHeads ? "rgba(251,191,36,0.75)" : "rgba(139,92,246,0.65)",
        backgroundColor: isHeads ? "rgba(251,191,36,0.07)" : "rgba(139,92,246,0.06)",
        opacity: flipping ? 0.25 : 1,
        transform: flipping ? "scale(0.82)" : "scale(1)",
        transition: `opacity 0.18s ${delayMs}ms, transform 0.18s ${delayMs}ms`,
      }}
    >
      <span style={{ color: isHeads ? "rgba(251,191,36,0.9)" : "rgba(167,139,250,0.85)" }}>
        {isHeads ? "☉" : "○"}
      </span>
    </div>
  );
}

function HexLine({ yang }: { yang: boolean | null }) {
  if (yang === null) {
    return (
      <div className="flex items-center gap-2 h-4 w-24 opacity-15">
        <div className="h-0.5 flex-1 bg-muted rounded-full" />
        <div className="h-0.5 flex-1 bg-muted rounded-full" />
      </div>
    );
  }
  if (yang) {
    return (
      <div className="flex items-center h-4 w-24">
        <div
          className="h-1 w-full rounded-full"
          style={{
            backgroundColor: "rgba(251,191,36,0.95)",
            boxShadow: "0 0 8px rgba(251,191,36,0.55)",
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 h-4 w-24">
      <div
        className="h-1 flex-1 rounded-full"
        style={{
          backgroundColor: "rgba(167,139,250,0.9)",
          boxShadow: "0 0 8px rgba(167,139,250,0.45)",
        }}
      />
      <div
        className="h-1 flex-1 rounded-full"
        style={{
          backgroundColor: "rgba(167,139,250,0.9)",
          boxShadow: "0 0 8px rgba(167,139,250,0.45)",
        }}
      />
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type Phase = "intro" | "casting" | "hexagram" | "generating" | "ready" | "playing";

export default function RitualComposePage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [lines, setLines] = useState<number[]>([]);
  const [coinFaces, setCoinFaces] = useState<[boolean, boolean, boolean]>([true, false, true]);
  const [coinFlipping, setCoinFlipping] = useState(false);
  const [hexKW, setHexKW] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const bloomRafRef = useRef(0);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const stopFlagRef = useRef(false);
  const isFlippingRef = useRef(false);
  const linesRef = useRef<number[]>([]);

  // Keep linesRef in sync
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // Timer during playback
  useEffect(() => {
    if (phase !== "playing") return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(bloomRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    } else if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }

  function drawBloom(analyser: AnalyserNode) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = canvas.offsetWidth;
    let h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      bloomRafRef.current = requestAnimationFrame(tick);
      if (canvas.offsetWidth !== w || canvas.offsetHeight !== h) {
        w = canvas.offsetWidth;
        h = canvas.offsetHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
      }
      analyser.getByteFrequencyData(freqData);
      const binPer = Math.floor(freqData.length / 6);
      const bands = Array.from({ length: 6 }, (_, b) => {
        let s = 0;
        for (let j = b * binPer; j < (b + 1) * binPer; j++) s += freqData[j] ?? 0;
        return s / binPer / 255;
      });
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.1;
      const maxR = Math.min(w, h) * 0.42;
      ctx.globalCompositeOperation = "lighter";
      for (let b = 0; b < 6; b++) {
        const e = bands[b];
        if (e < 0.01) continue;
        const r = base + e * maxR;
        const angle = (b / 6) * Math.PI * 2 - Math.PI / 2;
        const [cr, cg, cb] = BAND_COLORS[b];
        const gx = cx + Math.cos(angle) * r * 0.28;
        const gy = cy + Math.sin(angle) * r * 0.28;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.6 * e + 0.04})`);
        grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},${0.25 * e})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(gx, gy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };
    tick();
  }

  function clearBloom() {
    cancelAnimationFrame(bloomRafRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function castLine() {
    if (isFlippingRef.current || linesRef.current.length >= 6) return;
    isFlippingRef.current = true;
    setCoinFlipping(true);
    if (phase === "intro") setPhase("casting");

    const faces: [boolean, boolean, boolean] = [
      Math.random() < 0.5,
      Math.random() < 0.5,
      Math.random() < 0.5,
    ];

    // Reveal new faces mid-flip
    setTimeout(() => {
      setCoinFaces(faces);
    }, 220);

    // Unflip and record line
    setTimeout(() => {
      setCoinFlipping(false);
      isFlippingRef.current = false;
      const headsCount = faces.filter(Boolean).length;
      const isYang = headsCount >= 2 ? 1 : 0;
      const newLines = [...linesRef.current, isYang];
      setLines(newLines);
      if (newLines.length === 6) {
        setHexKW(computeKW(newLines));
        setPhase("hexagram");
      }
    }, 480);
  }

  async function generateMusic() {
    if (hexKW === 0) return;
    const hex = HEXAGRAMS[hexKW - 1];
    setPhase("generating");
    setErrorMsg("");
    try {
      const res = await fetch("/dream/151-ritual-compose/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: hex.prompt + ", ambient journey music",
          seed: Math.floor(Math.random() * 100000),
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!data.url) throw new Error(data.error ?? "No audio URL returned");
      const actx = getAudioCtx();
      const ab = await fetch(data.url).then((r) => r.arrayBuffer());
      audioBufferRef.current = await actx.decodeAudioData(ab);
      setPhase("ready");
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("hexagram");
    }
  }

  function playAudio() {
    const buf = audioBufferRef.current;
    if (!buf) return;
    stopFlagRef.current = true;
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* ok */
      }
      sourceRef.current = null;
    }
    clearBloom();
    stopFlagRef.current = false;
    setElapsed(0);
    setDuration(Math.round(buf.duration));
    setPhase("playing");

    const actx = getAudioCtx();
    let analyser = analyserRef.current;
    if (!analyser) {
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
    }
    drawBloom(analyser);

    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    analyser.connect(actx.destination);
    src.start(0);
    sourceRef.current = src;
    src.onended = () => {
      sourceRef.current = null;
      if (!stopFlagRef.current) {
        setPhase("ready");
        clearBloom();
      }
    };
  }

  function stopAudio() {
    stopFlagRef.current = true;
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* ok */
      }
      sourceRef.current = null;
    }
    setPhase("ready");
    clearBloom();
  }

  function reCast() {
    stopFlagRef.current = true;
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* ok */
      }
      sourceRef.current = null;
    }
    clearBloom();
    audioBufferRef.current = null;
    isFlippingRef.current = false;
    setCoinFlipping(false);
    setLines([]);
    linesRef.current = [];
    setHexKW(0);
    setErrorMsg("");
    setPhase("casting");
  }

  const hex = hexKW > 0 ? HEXAGRAMS[hexKW - 1] : null;
  const castsLeft = 6 - lines.length;
  const canCast = (phase === "intro" || phase === "casting") && lines.length < 6;

  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col select-none">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-mono font-semibold tracking-tight">Oracle</h1>
          <p className="text-base text-muted-foreground mt-1 max-w-md">
            Cast three coins six times. The I Ching hexagram becomes a journey in sound.
          </p>
        </div>
        <Link
          href="/dream"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
        >
          ← dream lab
        </Link>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left: coins + hexagram lines */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-border">
          {/* Coin toss area */}
          <div
            className={`flex-1 flex flex-col items-center justify-center gap-6 px-8 py-8 ${canCast ? "cursor-pointer" : ""}`}
            onClick={canCast ? castLine : undefined}
          >
            {/* Coins */}
            <div className="flex gap-5">
              {([0, 1, 2] as const).map((i) => (
                <CoinDisc
                  key={i}
                  isHeads={coinFaces[i]}
                  flipping={coinFlipping}
                  delayMs={i * 60}
                />
              ))}
            </div>

            {/* Status text */}
            {phase === "intro" && (
              <div className="text-center">
                <p className="text-muted-foreground text-base mb-1">Cast the oracle</p>
                <p className="text-muted-foreground/70 text-sm">tap to toss the coins</p>
              </div>
            )}
            {phase === "casting" && coinFlipping && (
              <p className="text-violet-300/95 text-base animate-pulse">Tossing…</p>
            )}
            {phase === "casting" && !coinFlipping && castsLeft > 0 && (
              <div className="text-center">
                <p className="text-muted-foreground text-base mb-1">
                  {castsLeft === 1 ? "One more toss" : `${castsLeft} tosses remaining`}
                </p>
                <p className="text-muted-foreground/70 text-sm">tap to continue</p>
              </div>
            )}
            {(phase === "hexagram" ||
              phase === "generating" ||
              phase === "ready" ||
              phase === "playing") && (
              <button
                onClick={reCast}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border border-border rounded-lg min-h-[40px]"
              >
                ↺ Re-cast
              </button>
            )}
          </div>

          {/* Hexagram lines — upper trigram / gap / lower trigram */}
          <div className="px-8 pb-8 flex flex-col items-center">
            <div className="flex flex-col items-center gap-2">
              {/* Upper trigram: lines 6, 5, 4 (displayed top to bottom) */}
              {[5, 4, 3].map((lineIdx) => (
                <HexLine
                  key={lineIdx}
                  yang={lineIdx < lines.length ? lines[lineIdx] === 1 : null}
                />
              ))}
              {/* Trigram gap */}
              <div className="h-3" />
              {/* Lower trigram: lines 3, 2, 1 (displayed top to bottom) */}
              {[2, 1, 0].map((lineIdx) => (
                <HexLine
                  key={lineIdx}
                  yang={lineIdx < lines.length ? lines[lineIdx] === 1 : null}
                />
              ))}
            </div>
            {hex && (
              <p className="text-muted-foreground/70 text-xs font-mono mt-3">
                Hexagram {hexKW}
              </p>
            )}
          </div>
        </div>

        {/* Right: hexagram info + bloom */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Hexagram detail */}
          {hex ? (
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-start gap-4 mb-2">
                <span
                  className="text-5xl font-semibold leading-none shrink-0"
                  style={{ color: "rgba(251,191,36,0.9)" }}
                >
                  {hex.chinese}
                </span>
                <div className="pt-1">
                  <p className="text-foreground text-xl font-semibold leading-tight">{hex.name}</p>
                  <p className="text-muted-foreground text-sm font-mono mt-0.5">Hexagram {hexKW} of 64</p>
                </div>
              </div>

              <p className="text-foreground text-base leading-relaxed italic mb-3">{hex.interp}</p>

              {errorMsg && <p className="text-violet-300 text-sm mb-2 leading-snug">{errorMsg}</p>}

              {phase === "hexagram" && (
                <button
                  onClick={generateMusic}
                  className="px-5 py-2.5 bg-violet-600/25 hover:bg-violet-600/45 border border-violet-500/40 rounded-lg text-violet-200 text-base font-medium transition-colors min-h-[44px]"
                >
                  Generate Journey Music
                </button>
              )}
              {phase === "generating" && (
                <p className="text-violet-300/95 text-base animate-pulse">
                  Lyria is reading the oracle…
                </p>
              )}
              {phase === "ready" && (
                <button
                  onClick={playAudio}
                  className="px-5 py-2.5 bg-violet-600/20 hover:bg-violet-600/35 border border-violet-500/35 rounded-lg text-violet-300 text-base font-medium transition-colors min-h-[44px]"
                >
                  ▶ Play Journey
                </button>
              )}
              {phase === "playing" && (
                <div className="flex items-center gap-4">
                  <button
                    onClick={stopAudio}
                    className="px-5 py-2.5 bg-violet-600/20 hover:bg-violet-600/35 border border-violet-500/35 rounded-lg text-violet-300 text-base font-medium transition-colors min-h-[44px]"
                  >
                    ■ Stop
                  </button>
                  <span className="text-muted-foreground text-sm font-mono">
                    {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                    {duration > 0 && (
                      <>
                        {" / "}
                        {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}
                      </>
                    )}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-4 border-b border-border">
              <p className="text-muted-foreground/70 text-base leading-relaxed">
                Complete the six coin tosses — the oracle will speak
              </p>
            </div>
          )}

          {/* Bloom canvas */}
          <div className="flex-1 relative bg-black min-h-[220px]">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {phase !== "playing" && (
              <div className="absolute inset-0 flex items-end justify-center pointer-events-none pb-4">
                {phase === "ready" && (
                  <p className="text-muted-foreground/70 text-sm">press Play to hear the oracle</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground/70">
        <span>~$0.08 / generation · Lyria 3 Pro · FAL_KEY</span>
        <Link
          href="/dream/151-ritual-compose/README.md"
          className="hover:text-muted-foreground transition-colors ml-auto"
        >
          design notes ↗
        </Link>
      </div>
    </div>
  );
}
