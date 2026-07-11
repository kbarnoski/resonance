'use client';

import { useEffect, useRef, useState } from 'react';

const DEG = Math.PI / 180;

// --- Types ---
type Seg = {
  x1: number; y1: number;
  x2: number; y2: number;
  depth: number;
  tBirth: number;   // seconds from tree's own start when this segment appears
  pitchIdx: number;
  played: boolean;
};

type Leaf = {
  x: number; y: number;
  rx: number; ry: number;
  angle: number;
  tBirth: number;
};

type TreeData = {
  rootX: number;
  rootY: number;
  spIdx: number;
  segs: Seg[];
  leaves: Leaf[];
  startedAt: number; // elapsed seconds (from effect start) when this tree was planted
};

// --- Species: [branchAngle(rad), rootLen, maxDepth, ratio, hue] ---
const SPECIES: [number, number, number, number, number][] = [
  [20 * DEG, 70, 6, 0.72, 140],  // tall narrow — deep green
  [30 * DEG, 54, 5, 0.70, 100],  // medium — yellow-green
  [40 * DEG, 42, 4, 0.68, 60],   // short broad — amber-green
];

const PENTA_HZ = [130.81, 164.81, 196.00, 220.00, 261.63];

// --- Pure helpers (no use* prefix) ---
function buildTreeData(
  rootX: number,
  rootY: number,
  spIdx: number,
  seed: number,
): TreeData {
  const [angle, lenRoot, maxDepth, ratio, hue] = SPECIES[spIdx];
  void hue; // hue used only in rendering
  const segs: Seg[] = [];
  const leaves: Leaf[] = [];

  let rng = seed >>> 0;
  const rand = (): number => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 0x100000000;
  };

  const addBranch = (
    x: number, y: number,
    a: number, len: number,
    depth: number, tBirth: number,
  ): void => {
    if (depth > maxDepth || len < 5) return;
    const x2 = x + Math.sin(a) * len;
    const y2 = y - Math.cos(a) * len;
    const pitchIdx = Math.min(depth, 4);
    segs.push({ x1: x, y1: y, x2, y2, depth, tBirth, pitchIdx, played: false });

    const jitter = (rand() - 0.5) * angle * 0.45;
    const nextLen = len * ratio;
    const nextT = tBirth + 1.5 + rand() * 0.9;

    addBranch(x2, y2, a - angle + jitter, nextLen, depth + 1, nextT);
    addBranch(x2, y2, a + angle + jitter, nextLen, depth + 1, nextT);

    // occasional middle branch
    if (depth < maxDepth - 1 && rand() < 0.32) {
      addBranch(x2, y2, a + (rand() - 0.5) * angle * 0.6, nextLen * 0.72, depth + 2, nextT + 0.4);
    }

    // leaves near terminal branches
    if (depth >= maxDepth - 1) {
      const leafT = tBirth + 0.4 + rand() * 0.4;
      for (let k = 0; k < 4; k++) {
        leaves.push({
          x: x2 + (rand() - 0.5) * 14,
          y: y2 + (rand() - 0.5) * 14,
          rx: 3 + rand() * 5,
          ry: 6 + rand() * 7,
          angle: rand() * Math.PI,
          tBirth: leafT,
        });
      }
    }
  };

  addBranch(rootX, rootY, 0, lenRoot, 0, 0.4 + rand() * 0.4);
  return { rootX, rootY, spIdx, segs, leaves, startedAt: 0 };
}

function buildKSBuf(actx: AudioContext, freq: number): AudioBuffer {
  const sr = actx.sampleRate;
  const N = Math.floor(sr * 2.8);
  const buf = actx.createBuffer(1, N, sr);
  const d = buf.getChannelData(0);
  const dl = Math.max(2, Math.floor(sr / freq));
  const delay = new Float32Array(dl);
  for (let i = 0; i < dl; i++) delay[i] = Math.random() * 2 - 1;
  let ptr = 0;
  for (let i = 0; i < N; i++) {
    const next = (ptr + 1) % dl;
    const s = 0.498 * (delay[ptr] + delay[next]);
    d[i] = s;
    delay[ptr] = s;
    ptr = next;
  }
  return buf;
}

function buildNoiseBuf(actx: AudioContext, secs: number, brown: boolean): AudioBuffer {
  const sr = actx.sampleRate;
  const N = Math.floor(sr * secs);
  const buf = actx.createBuffer(1, N, sr);
  const d = buf.getChannelData(0);
  if (brown) {
    let last = 0;
    for (let i = 0; i < N; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.022) * 0.997;
      d[i] = last * 3.8;
    }
  } else {
    for (let i = 0; i < N; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

// --- Component ---
export default function EcoBloom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [started, setStarted] = useState(false);
  const [rainOn, setRainOn] = useState(false);
  const [birdsOn, setBirdsOn] = useState(false);
  const [birdsReady, setBirdsReady] = useState(false);

  const rainRef = useRef(false);
  const birdsRef = useRef(false);
  const clearRef = useRef(false);
  const plantRef = useRef<{ x: number; seed: number } | null>(null);

  useEffect(() => { rainRef.current = rainOn; }, [rainOn]);
  useEffect(() => { birdsRef.current = birdsOn; }, [birdsOn]);

  // Reveal bird toggle after 18 s (canopy starts filling by then)
  useEffect(() => {
    if (!started) return;
    const t = setTimeout(() => setBirdsReady(true), 18000);
    return () => clearTimeout(t);
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const setSize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(canvas);

    const actx = new AudioContext();
    const master = actx.createGain();
    master.gain.value = 0.88;
    master.connect(actx.destination);

    // KS banks: low (C3–C4) and high (C4–C5)
    const ksLow = PENTA_HZ.map(f => buildKSBuf(actx, f));
    const ksHigh = PENTA_HZ.map(f => buildKSBuf(actx, f * 2));

    const playKS = (pitchIdx: number, depth: number, when: number, gain = 0.17): void => {
      const src = actx.createBufferSource();
      src.buffer = depth >= 3 ? ksHigh[pitchIdx] : ksLow[pitchIdx];
      const g = actx.createGain();
      g.gain.value = gain * Math.max(0.08, 1 - depth * 0.11);
      src.connect(g);
      g.connect(master);
      src.start(when);
    };

    // Root C1 resonance with gentle LFO
    const rootOsc = actx.createOscillator();
    rootOsc.type = 'sine';
    rootOsc.frequency.value = 32.7; // C1
    const rootGain = actx.createGain();
    rootGain.gain.value = 0;
    rootGain.gain.linearRampToValueAtTime(0.055, actx.currentTime + 9);
    const lfo = actx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = actx.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain);
    lfoGain.connect(rootGain.gain);
    rootOsc.connect(rootGain);
    rootGain.connect(master);
    rootOsc.start();
    lfo.start();

    // Wind: brown noise → bandpass
    const windBuf = buildNoiseBuf(actx, 12, true);
    const windSrc = actx.createBufferSource();
    windSrc.buffer = windBuf;
    windSrc.loop = true;
    const windFilt = actx.createBiquadFilter();
    windFilt.type = 'bandpass';
    windFilt.frequency.value = 650;
    windFilt.Q.value = 1.4;
    const windGain = actx.createGain();
    windGain.gain.value = 0;
    windGain.gain.linearRampToValueAtTime(0.026, actx.currentTime + 28);
    windSrc.connect(windFilt);
    windFilt.connect(windGain);
    windGain.connect(master);
    windSrc.start();

    // Rain: white noise → lowpass
    const rainBuf = buildNoiseBuf(actx, 9, false);
    const rainSrc = actx.createBufferSource();
    rainSrc.buffer = rainBuf;
    rainSrc.loop = true;
    const rainFilt = actx.createBiquadFilter();
    rainFilt.type = 'lowpass';
    rainFilt.frequency.value = 1100;
    const rainGain = actx.createGain();
    rainGain.gain.value = 0;
    rainSrc.connect(rainFilt);
    rainFilt.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();

    const cW = () => canvas.offsetWidth;
    const cH = () => canvas.offsetHeight;

    const trees: TreeData[] = [];
    const startMs = performance.now();

    const addTree = (x: number, seed: number): void => {
      const spIdx = trees.length % 3;
      const tree = buildTreeData(x, cH() - 20, spIdx, seed);
      tree.startedAt = (performance.now() - startMs) / 1000;
      trees.push(tree);
    };

    addTree(cW() * 0.22, 42);
    addTree(cW() * 0.52, 77);
    addTree(cW() * 0.80, 13);

    // Canvas tap → plant new tree
    const onPointer = (e: PointerEvent): void => {
      if (trees.length >= 6) return;
      const rect = canvas.getBoundingClientRect();
      plantRef.current = { x: e.clientX - rect.left, seed: Math.floor(Math.random() * 99999) };
    };
    canvas.addEventListener('pointerdown', onPointer);

    // Initial canvas clear
    const ctx0 = canvas.getContext('2d');
    if (ctx0) { ctx0.fillStyle = '#030904'; ctx0.fillRect(0, 0, canvas.width, canvas.height); }

    let animId = 0;
    let lastBirdT = -999;

    const frame = (ts: number): void => {
      animId = requestAnimationFrame(frame);
      const elapsed = (ts - startMs) / 1000;

      // Handle pending plant
      if (plantRef.current) {
        addTree(plantRef.current.x, plantRef.current.seed);
        plantRef.current = null;
      }

      // Handle clear
      if (clearRef.current) {
        clearRef.current = false;
        trees.length = 0;
        addTree(cW() * 0.22, Math.floor(Math.random() * 99999));
        addTree(cW() * 0.52, Math.floor(Math.random() * 99999));
        addTree(cW() * 0.80, Math.floor(Math.random() * 99999));
      }

      // Rain gain follow toggle
      const rainTarget = rainRef.current ? 0.042 : 0;
      rainGain.gain.setTargetAtTime(rainTarget, actx.currentTime, 1.6);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;

      // Canopy density for background fade
      let total = 0, revealed = 0;
      for (const t of trees) {
        total += t.segs.length;
        for (const s of t.segs) if (s.played) revealed++;
      }
      const density = total > 0 ? revealed / total : 0;

      // Background: slowly shift toward deep forest green
      const br = Math.round(3 + density * 3);
      const bg = Math.round(9 + density * 22);
      const bb = Math.round(3 + density * 5);
      ctx.fillStyle = `rgba(${br},${bg},${bb},0.16)`;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.scale(dpr, dpr);

      for (const tree of trees) {
        const hue = SPECIES[tree.spIdx][4];
        const treeAge = elapsed - tree.startedAt;

        // Branches
        for (const seg of tree.segs) {
          if (treeAge < seg.tBirth) continue;
          if (!seg.played) {
            seg.played = true;
            playKS(seg.pitchIdx, seg.depth, actx.currentTime + 0.008);
          }
          const progress = Math.min(1, (treeAge - seg.tBirth) / 0.4);
          const ix2 = seg.x1 + (seg.x2 - seg.x1) * progress;
          const iy2 = seg.y1 + (seg.y2 - seg.y1) * progress;
          const lw = Math.max(0.5, 5.5 - seg.depth * 0.72);
          const light = 20 + seg.depth * 5;
          ctx.beginPath();
          ctx.moveTo(seg.x1, seg.y1);
          ctx.lineTo(ix2, iy2);
          ctx.strokeStyle = `hsl(${hue},46%,${light}%)`;
          ctx.lineWidth = lw;
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // Leaves
        for (const leaf of tree.leaves) {
          if (treeAge < leaf.tBirth) continue;
          const leafAge = treeAge - leaf.tBirth;
          const leafAlpha = Math.min(0.22, leafAge * 0.04);
          ctx.save();
          ctx.translate(leaf.x, leaf.y);
          ctx.rotate(leaf.angle + elapsed * 0.07);
          ctx.globalAlpha = leafAlpha;
          ctx.fillStyle = `hsl(${hue + 18},52%,42%)`;
          ctx.beginPath();
          ctx.ellipse(0, 0, leaf.rx, leaf.ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();
        }
      }

      // Bird calls: every 8 s, after density > 20%
      if (birdsRef.current && density > 0.2 && elapsed - lastBirdT > 8) {
        lastBirdT = elapsed;
        const t0 = actx.currentTime + 0.06;
        for (let i = 0; i < 5; i++) {
          playKS(Math.floor(Math.random() * 5), 3, t0 + i * 0.08, 0.11);
        }
      }

      ctx.restore();
    };

    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('pointerdown', onPointer);
      ro.disconnect();
      rootOsc.stop();
      lfo.stop();
      windSrc.stop();
      rainSrc.stop();
      actx.close();
    };
  }, [started]);

  return (
    <div className="relative flex flex-col h-screen bg-[#030904] overflow-hidden select-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10 px-6">
          <div className="text-center max-w-sm">
            <h1 className="text-3xl font-semibold text-foreground mb-3">Eco Bloom</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Three tree species grow before you — L-system branches unfold over 45 seconds,
              each new branch a Karplus-Strong pluck. Wind and rain layer in as the canopy fills.
            </p>
          </div>
          <button
            onClick={() => setStarted(true)}
            className="px-7 py-3 bg-violet-500/20 border border-violet-400/40 text-violet-300 text-base rounded-lg min-h-[44px] hover:bg-violet-500/30 transition-colors"
          >
            Grow the forest
          </button>
          <p className="text-muted-foreground text-sm">Tap canvas to plant more trees · max 6</p>
        </div>
      )}

      {/* Controls */}
      {started && (
        <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-3 z-10 flex-wrap px-4">
          <button
            onClick={() => setRainOn(r => !r)}
            className={`px-4 py-2.5 rounded-lg text-sm min-h-[44px] border transition-colors ${
              rainOn
                ? 'bg-violet-500/25 border-violet-400/50 text-violet-300'
                : 'bg-muted border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            🌧 Rain
          </button>
          {birdsReady && (
            <button
              onClick={() => setBirdsOn(b => !b)}
              className={`px-4 py-2.5 rounded-lg text-sm min-h-[44px] border transition-colors ${
                birdsOn
                  ? 'bg-violet-500/25 border-violet-400/50 text-violet-300'
                  : 'bg-muted border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              🐦 Birds
            </button>
          )}
          <button
            onClick={() => { clearRef.current = true; }}
            className="px-4 py-2.5 rounded-lg text-sm min-h-[44px] bg-muted border border-border text-muted-foreground hover:bg-accent transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Design notes link */}
      <a
        href="/dream/146-eco-bloom/README.md"
        className="absolute top-3 right-3 z-10 text-muted-foreground text-xs hover:text-muted-foreground transition-colors"
      >
        Design notes ↗
      </a>
    </div>
  );
}
