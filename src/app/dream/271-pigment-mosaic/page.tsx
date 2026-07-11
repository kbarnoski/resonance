"use client";

/**
 * 271 · Pigment Mosaic
 * ─────────────────────
 * An AI-generated chapter image treated as reconfigurable MATTER: it is sliced
 * into an N×M grid of tiles and each tile's scale / rotation / offset / brightness
 * is driven by a frequency band of the live audio. Loud bands explode their tiles
 * outward and shatter the picture; quiet passages let the mosaic settle back into
 * the coherent image. Big transients re-sort the tiles by brightness so the picture
 * physically reorganizes itself to the sound.
 *
 * Deliberately NON-LUMINOUS — pure drawImage, no additive blending, no glow.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const GRID_COLS = 16;
const GRID_ROWS = 12;
const FFT_SIZE = 2048;
const MIN_REGEN_MS = 25_000;

const README_URL =
  "https://github.com/kbarnoski/resonance/blob/main/src/app/dream/271-pigment-mosaic/README.md";

type SourceKind = "idle" | "mic" | "file" | "track" | "synth";

// ── Per-tile state (precomputed source rects + smoothed transform) ───────────────
type Tile = {
  // immutable source rect into the chapter image
  col: number;
  row: number;
  // smoothed mean luminance of this tile (0..1), for brightness sort + tint
  lum: number;
  // smoothed transform state
  scale: number;
  rot: number;
  ox: number;
  oy: number;
  bright: number;
  // which logical home slot this tile currently occupies (for re-sort)
  slot: number;
};

export default function PigmentMosaicPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // refs read inside the rAF loop (never via state)
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const tilesRef = useRef<Tile[]>([]);
  const imgRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const prevImgRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null);
  const crossfadeRef = useRef(0); // 1 -> 0 as new chapter settles in

  // analysis state (smoothed)
  const bandsRef = useRef<number[]>(new Array(GRID_COLS).fill(0));
  const rmsRef = useRef(0);
  const centroidRef = useRef(0.5);
  const fluxRef = useRef(0);
  const prevSpectrumRef = useRef<Float32Array>(new Float32Array(GRID_COLS));
  const lastSortRef = useRef(0);
  const lastRegenRef = useRef(0);

  // UI state
  const [source, setSource] = useState<SourceKind>("idle");
  const [running, setRunning] = useState(false);
  const [trackId, setTrackId] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [keyNotice, setKeyNotice] = useState(false);
  const [summoning, setSummoning] = useState(false);
  const [autoRegen, setAutoRegen] = useState(false);
  const [chapterLabel, setChapterLabel] = useState<string>("procedural");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const autoRegenRef = useRef(false);
  useEffect(() => {
    autoRegenRef.current = autoRegen;
  }, [autoRegen]);

  // ── Build the tile list (source rects are derived at draw time from col/row) ─────
  const makeTiles = useCallback(() => {
    const tiles: Tile[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const i = r * GRID_COLS + c;
        tiles.push({
          col: c,
          row: r,
          lum: 0.5,
          scale: 1,
          rot: 0,
          ox: 0,
          oy: 0,
          bright: 1,
          slot: i,
        });
      }
    }
    tilesRef.current = tiles;
  }, []);

  // ── Procedural source: rich value-noise gradient tinted by mood ──────────────────
  const drawProceduralSource = useCallback((hueBase: number) => {
    const w = 1024;
    const h = 768;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const g = off.getContext("2d");
    if (!g) return off;

    // base vertical gradient
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `hsl(${hueBase}, 45%, 16%)`);
    grad.addColorStop(0.5, `hsl(${(hueBase + 40) % 360}, 38%, 28%)`);
    grad.addColorStop(1, `hsl(${(hueBase + 80) % 360}, 30%, 12%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // layered soft blobs = painterly value noise (non-luminous, source-over only)
    const blobs = 90;
    for (let i = 0; i < blobs; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const rad = 40 + Math.random() * 220;
      const hue = (hueBase + (Math.random() - 0.5) * 120 + 360) % 360;
      const light = 18 + Math.random() * 42;
      const rg = g.createRadialGradient(x, y, 0, x, y, rad);
      rg.addColorStop(0, `hsla(${hue}, 50%, ${light}%, 0.5)`);
      rg.addColorStop(1, `hsla(${hue}, 50%, ${light}%, 0)`);
      g.fillStyle = rg;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }

    // fine grain for tactile, photographic feel
    const grain = g.getImageData(0, 0, w, h);
    const d = grain.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      d[i] = Math.max(0, Math.min(255, d[i] + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    g.putImageData(grain, 0, 0);
    return off;
  }, []);

  // ── Compute per-tile mean luminance from current source image ────────────────────
  const computeTileLum = useCallback(
    (src: HTMLImageElement | HTMLCanvasElement) => {
      const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
      const sh = "naturalHeight" in src ? src.naturalHeight : src.height;
      if (!sw || !sh) return;
      // sample into a tiny GRID_COLS×GRID_ROWS canvas — one pixel per tile
      const tiny = document.createElement("canvas");
      tiny.width = GRID_COLS;
      tiny.height = GRID_ROWS;
      const tg = tiny.getContext("2d", { willReadFrequently: true });
      if (!tg) return;
      try {
        tg.drawImage(src, 0, 0, GRID_COLS, GRID_ROWS);
        const data = tg.getImageData(0, 0, GRID_COLS, GRID_ROWS).data;
        const tiles = tilesRef.current;
        for (const t of tiles) {
          const idx = (t.row * GRID_COLS + t.col) * 4;
          const lum =
            (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) /
            255;
          t.lum = lum;
        }
      } catch {
        // cross-origin taint on getImageData — keep default lums (still draws fine)
      }
    },
    []
  );

  // ── Install a new chapter source (image or procedural canvas) with crossfade ─────
  const installSource = useCallback(
    (src: HTMLImageElement | HTMLCanvasElement, label: string) => {
      prevImgRef.current = imgRef.current;
      imgRef.current = src;
      crossfadeRef.current = prevImgRef.current ? 1 : 0;
      computeTileLum(src);
      setChapterLabel(label);
    },
    [computeTileLum]
  );

  // ── Mood → poetic prompt from live analysis ──────────────────────────────────────
  const buildPrompt = useCallback(() => {
    const rms = rmsRef.current;
    const cen = centroidRef.current;
    const energy = rms < 0.18 ? "hushed and still" : rms < 0.4 ? "breathing, mid-bodied" : "surging and loud";
    const colour =
      cen < 0.33 ? "deep umber and indigo, low warm light" : cen < 0.66 ? "ochre, teal and dusk rose" : "pale gold and bright cyan, high airy light";
    return `a richly textured painterly landscape as physical pigment, ${energy}, ${colour}, thick impasto matter, tactile photographic detail, cinematic colour, no glow`;
  }, []);

  // ── Procedural mood hue from centroid ────────────────────────────────────────────
  const moodHue = useCallback(() => {
    return Math.floor(200 + centroidRef.current * 140) % 360;
  }, []);

  // ── Summon an AI chapter (degrades to procedural on any failure) ─────────────────
  const summonChapter = useCallback(async () => {
    if (summoning) return;
    setSummoning(true);
    setErrorMsg(null);
    lastRegenRef.current = performance.now();
    const prompt = buildPrompt();
    try {
      const res = await fetch("/dream/271-pigment-mosaic/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.status === 501) {
        setKeyNotice(true);
        installSource(drawProceduralSource(moodHue()), "procedural");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { url?: string; error?: string };
      if (!json.url) throw new Error(json.error || "no url");
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image load failed"));
        img.src = json.url as string;
      });
      setKeyNotice(false);
      installSource(img, "AI chapter");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`Chapter summon failed (${msg}) — using procedural matter.`);
      installSource(drawProceduralSource(moodHue()), "procedural");
    } finally {
      setSummoning(false);
    }
  }, [summoning, buildPrompt, installSource, drawProceduralSource, moodHue]);

  // ── The render + analysis loop ───────────────────────────────────────────────────
  const runLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const freq = freqRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !analyser || !freq || !ctx) {
      rafRef.current = requestAnimationFrame(runLoop);
      return;
    }

    // resize to device
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }

    // ── analysis ──────────────────────────────────────────────────────────────────
    analyser.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);
    const bins = freq.length;
    const bands = bandsRef.current;
    const prevSpec = prevSpectrumRef.current;
    let rmsAcc = 0;
    let centNum = 0;
    let centDen = 0;
    let flux = 0;
    const perBand = GRID_COLS;
    const binsPerBand = Math.floor(bins / 2 / perBand) || 1; // use lower half (musical range)
    for (let b = 0; b < perBand; b++) {
      let sum = 0;
      for (let k = 0; k < binsPerBand; k++) {
        const v = freq[b * binsPerBand + k] / 255;
        sum += v;
      }
      const raw = sum / binsPerBand;
      // logarithmic emphasis so bass doesn't dominate
      const target = Math.pow(raw, 0.8);
      bands[b] += (target - bands[b]) * 0.25;
      const d = target - prevSpec[b];
      if (d > 0) flux += d;
      prevSpec[b] = target;
      rmsAcc += raw * raw;
      centNum += target * b;
      centDen += target;
    }
    const rms = Math.sqrt(rmsAcc / perBand);
    rmsRef.current += (rms - rmsRef.current) * 0.2;
    const centroid = centDen > 0.0001 ? centNum / centDen / perBand : 0.5;
    centroidRef.current += (centroid - centroidRef.current) * 0.1;
    fluxRef.current += (flux - fluxRef.current) * 0.4;

    const now = performance.now();
    const tiles = tilesRef.current;

    // ── transient → re-sort tiles by brightness (debounced) ─────────────────────────
    const onset = fluxRef.current;
    if (onset > 2.2 && now - lastSortRef.current > 900 && tiles.length) {
      lastSortRef.current = now;
      const order = [...tiles].sort((a, b) => b.lum - a.lum);
      // assign new home slots in a serpentine so bright tiles cluster top-left
      for (let i = 0; i < order.length; i++) order[i].slot = i;
    }

    // ── auto-regenerate chapter ─────────────────────────────────────────────────────
    if (
      autoRegenRef.current &&
      !summoning &&
      now - lastRegenRef.current > MIN_REGEN_MS
    ) {
      lastRegenRef.current = now;
      void summonChapter();
    }

    // crossfade decay
    if (crossfadeRef.current > 0) {
      crossfadeRef.current = Math.max(0, crossfadeRef.current - 0.02);
    }

    // ── draw: non-luminous, source-over only ────────────────────────────────────────
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, W, H);

    const src = imgRef.current;
    if (!src) {
      rafRef.current = requestAnimationFrame(runLoop);
      return;
    }
    const sw = "naturalWidth" in src ? src.naturalWidth : src.width;
    const sh = "naturalHeight" in src ? src.naturalHeight : src.height;
    if (!sw || !sh) {
      rafRef.current = requestAnimationFrame(runLoop);
      return;
    }

    // fit the grid to canvas with small margin
    const margin = W * 0.04;
    const gridW = W - margin * 2;
    const gridH = H - margin * 2;
    const cellW = gridW / GRID_COLS;
    const cellH = gridH / GRID_ROWS;
    const srcCellW = sw / GRID_COLS;
    const srcCellH = sh / GRID_ROWS;

    const cf = crossfadeRef.current;
    const prevSrc = prevImgRef.current;

    for (const t of tiles) {
      const band = bands[t.col];
      // loud band → grow, rotate, push outward (shatter)
      const energy = band;
      const scaleTarget = 1 + energy * 0.9;
      const rotTarget = (energy - 0.2) * (t.col % 2 === 0 ? 0.9 : -0.9);
      t.scale += (scaleTarget - t.scale) * 0.18;
      t.rot += (rotTarget - t.rot) * 0.15;
      const bandRow = bands[Math.min(GRID_COLS - 1, Math.floor((t.row / GRID_ROWS) * GRID_COLS))];

      // home position from current slot (re-sort moves tiles in serpentine grid)
      const slotCol = t.slot % GRID_COLS;
      const slotRow = Math.floor(t.slot / GRID_COLS);
      const homeX = margin + slotCol * cellW + cellW / 2;
      const homeY = margin + slotRow * cellH + cellH / 2;

      // outward push from canvas centre, scaled by energy
      const cx = W / 2;
      const cy = H / 2;
      const dirX = homeX - cx;
      const dirY = homeY - cy;
      const pushTarget = energy * energy * 0.6;
      const oxTarget = dirX * pushTarget + (bandRow - 0.25) * cellW * 0.3;
      const oyTarget = dirY * pushTarget;
      t.ox += (oxTarget - t.ox) * 0.12;
      t.oy += (oyTarget - t.oy) * 0.12;

      // brightness: loud → slightly darker punch, quiet → settle (no glow)
      const brTarget = 1 - energy * 0.35;
      t.bright += (brTarget - t.bright) * 0.15;

      const dx = homeX + t.ox;
      const dy = homeY + t.oy;
      const dw = cellW * t.scale * 1.02; // slight overlap to seal seams when settled
      const dh = cellH * t.scale * 1.02;

      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(t.rot);
      ctx.globalAlpha = 1;
      ctx.filter = t.bright < 0.999 ? `brightness(${t.bright.toFixed(3)})` : "none";
      ctx.drawImage(
        src,
        t.col * srcCellW,
        t.row * srcCellH,
        srcCellW,
        srcCellH,
        -dw / 2,
        -dh / 2,
        dw,
        dh
      );
      // crossfade the previous chapter underneath, at home slot, fading out
      if (cf > 0 && prevSrc) {
        const psw = "naturalWidth" in prevSrc ? prevSrc.naturalWidth : prevSrc.width;
        const psh = "naturalHeight" in prevSrc ? prevSrc.naturalHeight : prevSrc.height;
        if (psw && psh) {
          ctx.globalAlpha = cf;
          ctx.filter = "none";
          ctx.drawImage(
            prevSrc,
            t.col * (psw / GRID_COLS),
            t.row * (psh / GRID_ROWS),
            psw / GRID_COLS,
            psh / GRID_ROWS,
            -dw / 2,
            -dh / 2,
            dw,
            dh
          );
        }
      }
      ctx.restore();
    }
    ctx.filter = "none";
    ctx.globalAlpha = 1;

    rafRef.current = requestAnimationFrame(runLoop);
  }, [summoning, summonChapter]);

  // ── Audio graph setup shared by all sources ──────────────────────────────────────
  const ensureContext = useCallback(() => {
    if (!audioCtxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      audioCtxRef.current = new Ctor();
    }
    const ctx = audioCtxRef.current;
    if (!analyserRef.current) {
      const an = ctx.createAnalyser();
      an.fftSize = FFT_SIZE;
      an.smoothingTimeConstant = 0.6;
      analyserRef.current = an;
      freqRef.current = new Uint8Array(an.frequencyBinCount);
    }
    return ctx;
  }, []);

  const stopCurrentSource = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  // ── Synth fallback: gentle evolving DORIAN pad (NOT C-pentatonic) ────────────────
  const startSynth = useCallback(async () => {
    const ctx = ensureContext();
    await ctx.resume();
    stopCurrentSource();
    const an = analyserRef.current!;
    // D dorian-ish drone: D F A C E G (mode tones), detuned pad
    const freqs = [146.83, 174.61, 220.0, 261.63, 329.63, 392.0];
    const master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(an);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(master.gain);
    lfo.start();
    const oscs: OscillatorNode[] = [];
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.2 + Math.random() * 0.3;
      o.connect(g).connect(master);
      o.start();
      oscs.push(o);
    }
    // stash a fake "source" handle so stop cleans the oscillators
    const holder = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    holder.buffer = buf;
    holder.onended = () => {
      oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      });
      try {
        lfo.stop();
      } catch {
        /* noop */
      }
    };
    sourceNodeRef.current = holder;
    setSource("synth");
    setRunning(true);
  }, [ensureContext, stopCurrentSource]);

  // ── Decoded buffer → playing source ──────────────────────────────────────────────
  const startBuffer = useCallback(
    async (decoded: AudioBuffer, kind: SourceKind) => {
      const ctx = ensureContext();
      await ctx.resume();
      stopCurrentSource();
      const an = analyserRef.current!;
      const node = ctx.createBufferSource();
      node.buffer = decoded;
      node.loop = true;
      node.connect(an);
      an.connect(ctx.destination);
      node.start();
      sourceNodeRef.current = node;
      setSource(kind);
      setRunning(true);
    },
    [ensureContext, stopCurrentSource]
  );

  // ── Mic ──────────────────────────────────────────────────────────────────────────
  const startMic = useCallback(async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const ctx = ensureContext();
      await ctx.resume();
      stopCurrentSource();
      micStreamRef.current = stream;
      const an = analyserRef.current!;
      const srcNode = ctx.createMediaStreamSource(stream);
      srcNode.connect(an);
      setSource("mic");
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`Mic unavailable (${msg}) — starting synth demo.`);
      void startSynth();
    }
  }, [ensureContext, stopCurrentSource, startSynth]);

  // ── File ───────────────────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg(null);
      try {
        const arrayBuf = await file.arrayBuffer();
        const tempCtx = new AudioContext();
        const decoded = await tempCtx.decodeAudioData(arrayBuf);
        await tempCtx.close();
        await startBuffer(decoded, "file");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(`Could not decode "${file.name}": ${msg}`);
      }
    },
    [startBuffer]
  );

  // ── Karel's Welcome Home track by ID ─────────────────────────────────────────────
  const loadTrack = useCallback(async () => {
    if (!trackId.trim()) return;
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(trackId.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let arrayBuf: ArrayBuffer;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("application/json")) {
        const json = (await res.json()) as { url: string };
        const audioRes = await fetch(json.url);
        if (!audioRes.ok) throw new Error(`Audio fetch HTTP ${audioRes.status}`);
        arrayBuf = await audioRes.arrayBuffer();
      } else {
        arrayBuf = await res.arrayBuffer();
      }
      const tempCtx = new AudioContext();
      const decoded = await tempCtx.decodeAudioData(arrayBuf);
      await tempCtx.close();
      await startBuffer(decoded, "track");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(`Could not load track "${trackId}" (${msg}) — synth demo instead.`);
      void startSynth();
    }
  }, [trackId, startBuffer, startSynth]);

  // ── Mount: tiles + procedural seed + loop; unmount: full cleanup ─────────────────
  useEffect(() => {
    makeTiles();
    // seed with a procedural chapter so the canvas is alive before any audio/AI
    installSource(drawProceduralSource(230), "procedural");
    rafRef.current = requestAnimationFrame(runLoop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      stopCurrentSource();
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      analyserRef.current = null;
      freqRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasCanvas =
    typeof window !== "undefined" && !!document.createElement("canvas").getContext;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0a0f] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Read the design notes — corner link */}
      <a
        href={README_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-4 top-4 z-20 rounded-md bg-black/40 px-3 py-2 font-mono text-base text-muted-foreground backdrop-blur transition hover:text-foreground"
      >
        Read the design notes
      </a>

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6">
        {/* Header */}
        <header className="max-w-2xl">
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
            Pigment Mosaic
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            An AI image becomes reconfigurable matter — a non-luminous mosaic of
            tiles the music shatters, scales and re-sorts in real time.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => (running ? void summonChapter() : void startSynth())}
              className="min-h-[44px] rounded-lg bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-300 transition hover:bg-violet-500/30"
            >
              {running ? "Summon chapter" : "Begin (synth demo)"}
            </button>
          </div>
        </header>

        {/* Notices */}
        <div className="pointer-events-none mx-auto w-full max-w-2xl space-y-2">
          {!hasCanvas && (
            <p className="rounded-md bg-black/50 px-4 py-2.5 text-base text-violet-300">
              This browser has no Canvas2D — the mosaic cannot render.
            </p>
          )}
          {keyNotice && (
            <p className="rounded-md bg-violet-500/10 px-4 py-2.5 text-base text-violet-300/95">
              Image generation needs FAL_KEY — running in procedural mode. The
              shatter-and-settle experience is fully live.
            </p>
          )}
          {errorMsg && (
            <p className="rounded-md bg-black/50 px-4 py-2.5 text-base text-violet-300">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Controls */}
        <section className="w-full">
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-black/40 p-4 backdrop-blur">
            {/* sources */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void startMic()}
                className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base text-foreground transition hover:bg-accent"
              >
                Use mic
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base text-foreground transition hover:bg-accent"
              >
                Drop / pick file
              </button>
              <button
                onClick={() => void startSynth()}
                className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base text-foreground transition hover:bg-accent"
              >
                Synth demo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>

            {/* track loader */}
            <div className="flex items-end gap-2">
              <label className="flex flex-col text-base text-muted-foreground">
                Welcome Home track ID
                <input
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  placeholder="e.g. 42"
                  className="mt-1 min-h-[44px] w-40 rounded-lg bg-muted px-3 py-2 font-mono text-base text-foreground placeholder:text-muted-foreground"
                />
              </label>
              <button
                onClick={() => void loadTrack()}
                className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base text-foreground transition hover:bg-accent"
              >
                Load track
              </button>
            </div>

            {/* chapter controls */}
            <div className="ml-auto flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-base text-muted-foreground">
                <input
                  type="checkbox"
                  checked={autoRegen}
                  onChange={(e) => setAutoRegen(e.target.checked)}
                  className="h-5 w-5 accent-violet-400"
                />
                Auto-regen (~25s)
              </label>
              <button
                onClick={() => void summonChapter()}
                disabled={summoning}
                className="min-h-[44px] rounded-lg bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-300 transition hover:bg-violet-500/30 disabled:opacity-50"
              >
                {summoning ? "Summoning…" : "Summon chapter"}
              </button>
            </div>

            <p className="w-full font-mono text-base text-muted-foreground">
              source: {source} · chapter: {chapterLabel} · {GRID_COLS}×{GRID_ROWS} tiles
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
