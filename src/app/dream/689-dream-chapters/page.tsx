"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ──────────────────────────────────────────────────────────────────────────
   Dream Chapters
   A long-form generative journey that remembers everything it has dreamed.
   Each named musical movement mints one "chapter card" image; every card it
   has ever made drifts in a receding 3D depth-field you can look back through.
   ────────────────────────────────────────────────────────────────────────── */

// ── phase definitions ───────────────────────────────────────────────────────
// D-Dorian / Aeolian modal centre. Each phase has its own harmonic colour,
// density and tempo so the music genuinely changes character phase to phase.

interface Phase {
  name: string;
  seconds: number; // 45-70s each
  // pitch classes (semitones from D) of the sustained pad voicing
  pad: number[];
  // pool of melodic motif pitches (semitones from D), drawn sparsely
  motif: number[];
  bpm: number; // note-event tempo for the sparse melody
  density: number; // 0-1 probability a beat sounds a motif note
  // image-prompt vocabulary for the chapter card
  adjectives: string[];
  scene: string;
  palette: string; // colour hint baked into prompt + procedural texture
  // procedural texture colours [r,g,b] 0-255
  colA: [number, number, number];
  colB: [number, number, number];
  colC: [number, number, number];
}

const D = 146.83; // D3 in Hz, our modal centre

const PHASES: Phase[] = [
  {
    name: "Threshold",
    seconds: 50,
    pad: [0, 7, 12], // open fifth — D A D
    motif: [0, 2, 3, 7],
    bpm: 46,
    density: 0.18,
    adjectives: ["a hushed grey dawn", "soft mist", "quiet", "liminal"],
    scene: "a vast empty plain at first light, low fog, a single distant doorway of pale light",
    palette: "muted slate and pale gold",
    colA: [40, 46, 66],
    colB: [120, 128, 150],
    colC: [222, 206, 160],
  },
  {
    name: "Drift",
    seconds: 55,
    pad: [0, 5, 10, 14], // suspended, airy
    motif: [0, 2, 5, 7, 10],
    bpm: 52,
    density: 0.26,
    adjectives: ["weightless", "slow current", "pale blue", "floating"],
    scene: "endless still water under a soft blue sky, slow drifting clouds, gentle reflections, dreamlike",
    palette: "pale cerulean and silver",
    colA: [30, 58, 90],
    colB: [90, 150, 200],
    colC: [200, 224, 240],
  },
  {
    name: "Deepening",
    seconds: 60,
    pad: [0, 3, 7, 10], // minor 7th — darker, fuller
    motif: [0, 3, 5, 7, 8, 10],
    bpm: 56,
    density: 0.34,
    adjectives: ["deep indigo", "submerged", "rich shadow", "vast"],
    scene: "a deep underwater cathedral of dark indigo, shafts of dim light from far above, immense and silent",
    palette: "deep indigo and teal",
    colA: [14, 20, 48],
    colB: [40, 60, 110],
    colC: [60, 130, 140],
  },
  {
    name: "Aurora",
    seconds: 58,
    pad: [0, 4, 7, 11, 14], // brightest — major 7 add9 colour
    motif: [0, 2, 4, 7, 9, 11],
    bpm: 60,
    density: 0.44,
    adjectives: ["luminous", "radiant", "green and violet", "cinematic"],
    scene: "a vast aurora over a still black lake, luminous green and violet ribbons of light, mirror reflections, cinematic, dreamlike",
    palette: "luminous green and violet",
    colA: [10, 16, 30],
    colB: [40, 200, 130],
    colC: [150, 90, 220],
  },
  {
    name: "Return",
    seconds: 50,
    pad: [0, 7, 12, 19], // back to open fifths, glowing
    motif: [0, 2, 3, 7, 12],
    bpm: 44,
    density: 0.2,
    adjectives: ["warm", "settling", "amber dusk", "peaceful"],
    scene: "a warm amber horizon at dusk, soft rolling hills returning home, glowing low sun, gentle and peaceful",
    palette: "warm amber and rose",
    colA: [50, 24, 30],
    colB: [200, 120, 60],
    colC: [240, 190, 130],
  },
];

const TOTAL_SECONDS = PHASES.reduce((s, p) => s + p.seconds, 0);

// ── prompt composition ───────────────────────────────────────────────────────

function makePrompt(phase: Phase, index: number): string {
  // pick two adjectives deterministically from the chapter index so a given
  // chapter always reads the same way.
  const a = phase.adjectives[index % phase.adjectives.length];
  const b = phase.adjectives[(index + 2) % phase.adjectives.length];
  return `${phase.scene}, ${a}, ${b}, ${phase.palette}, soft volumetric light, painterly, highly detailed`;
}

// deterministic 32-bit hash of a string → used to seed procedural textures
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// small seeded PRNG (mulberry32)
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── procedural chapter-card texture (the graceful, key-free fallback) ────────
// Renders a phase's mood to an offscreen canvas as a layered gradient + value
// noise field in that phase's colours, deterministic from the prompt hash.

function drawProceduralCard(
  phase: Phase,
  promptText: string,
  chapterNumber: number
): HTMLCanvasElement {
  const W = 512;
  const H = 384;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  const seed = hashString(promptText);
  const rng = makeRng(seed);

  const [ar, ag, ab] = phase.colA;
  const [br, bg, bb] = phase.colB;
  const [cr, cg, cb] = phase.colC;

  // base vertical gradient (deep → mid)
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgb(${ar},${ag},${ab})`);
  g.addColorStop(1, `rgb(${br},${bg},${bb})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // soft luminous blobs in the accent colour (value-noise-ish field)
  const blobs = 7 + Math.floor(rng() * 6);
  for (let i = 0; i < blobs; i++) {
    const x = rng() * W;
    const y = rng() * H * 0.9;
    const r = 40 + rng() * 160;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const alpha = 0.1 + rng() * 0.28;
    rg.addColorStop(0, `rgba(${cr},${cg},${cb},${alpha})`);
    rg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // horizon band — gives every card a "landscape" read
  const horizonY = H * (0.45 + rng() * 0.2);
  const hg = ctx.createLinearGradient(0, horizonY - 30, 0, horizonY + 30);
  hg.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
  hg.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.5)`);
  hg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
  ctx.fillStyle = hg;
  ctx.fillRect(0, horizonY - 30, W, 60);

  // sparse star / grain field
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 220; i++) {
    const x = rng() * W;
    const y = rng() * horizonY;
    const s = rng() * 1.6;
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.2 + rng() * 0.5})`;
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;

  // vignette
  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    H * 0.2,
    W / 2,
    H / 2,
    H * 0.75
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // chapter label engraved into the card
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "600 20px ui-monospace, monospace";
  ctx.fillText(`CHAPTER ${chapterNumber}`, 18, H - 44);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "500 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(phase.name, 18, H - 16);

  // thin frame
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, W - 3, H - 3);

  return cv;
}

// ── chapter record ───────────────────────────────────────────────────────────

interface Chapter {
  id: number;
  phaseName: string;
  prompt: string;
  source: "model" | "local";
}

// ── audio engine ─────────────────────────────────────────────────────────────
// Sustained pad voices + sparse plucked motif over a drifting modal centre.

class JourneyAudio {
  ctx: AudioContext;
  master: GainNode;
  padGain: GainNode;
  padOscs: { osc: OscillatorNode; gain: GainNode }[] = [];
  reverb: ConvolverNode;
  wetGain: GainNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  beatTimer: number | null = null;

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0;
    this.master.connect(this.ctx.destination);

    // simple algorithmic reverb tail
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.4, 2.6);
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.55;
    this.reverb.connect(this.wetGain);
    this.wetGain.connect(this.master);

    this.padGain = this.ctx.createGain();
    this.padGain.gain.value = 0.0;
    this.padGain.connect(this.master);
    this.padGain.connect(this.reverb);

    // slow shimmer LFO on pad volume
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.value = 0.07;
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.value = 0.04;
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.padGain.gain);
    this.lfo.start();
  }

  makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        data[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  async resume() {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  fadeIn() {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0.85, now + 4);
    this.padGain.gain.linearRampToValueAtTime(0.18, now + 5);
  }

  semiToHz(semi: number): number {
    return D * Math.pow(2, semi / 12);
  }

  // (re)build the sustained pad to a new voicing, gently crossfading.
  setPad(phase: Phase) {
    const now = this.ctx.currentTime;
    // fade out old pad oscillators
    for (const v of this.padOscs) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 3);
      v.osc.stop(now + 3.2);
    }
    this.padOscs = [];

    phase.pad.forEach((semi, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      const detune = (i - phase.pad.length / 2) * 3;
      osc.frequency.value = this.semiToHz(semi);
      osc.detune.value = detune;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const target = 0.16 / Math.sqrt(phase.pad.length);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(target, now + 3.5);
      osc.connect(g);
      g.connect(this.padGain);
      osc.start(now);
      this.padOscs.push({ osc, gain: g });
    });
  }

  // pluck a single sparse motif note
  pluck(semi: number, octave: number) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = this.semiToHz(semi + octave * 12);
    const g = this.ctx.createGain();
    const peak = 0.12;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    osc.connect(g);
    g.connect(this.padGain);
    g.connect(this.reverb);
    osc.start(now);
    osc.stop(now + 2.6);
  }

  // run the sparse melodic motif for a phase
  startMotif(getPhase: () => Phase) {
    if (this.beatTimer !== null) window.clearInterval(this.beatTimer);
    const tick = () => {
      const phase = getPhase();
      if (Math.random() < phase.density) {
        const m = phase.motif[Math.floor(Math.random() * phase.motif.length)];
        const oct = Math.random() < 0.4 ? 2 : 1;
        this.pluck(m, oct);
      }
    };
    // recompute interval each tick by using a steady base; the perceived tempo
    // comes from density + bpm. We use a fixed-ish grid keyed off current phase.
    const schedule = () => {
      const phase = getPhase();
      const interval = (60 / phase.bpm) * 1000;
      tick();
      this.beatTimer = window.setTimeout(schedule, interval);
    };
    schedule();
  }

  async stop() {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 2.5);
    if (this.beatTimer !== null) {
      window.clearTimeout(this.beatTimer);
      this.beatTimer = null;
    }
    setTimeout(() => {
      try {
        this.lfo.stop();
        for (const v of this.padOscs) v.osc.stop();
      } catch {
        /* already stopped */
      }
    }, 2700);
  }

  async close() {
    if (this.beatTimer !== null) {
      window.clearTimeout(this.beatTimer);
      this.beatTimer = null;
    }
    try {
      await this.ctx.close();
    } catch {
      /* already closed */
    }
  }
}

// ── three.js gallery (receding depth-field of textured planes) ───────────────

interface GalleryHandle {
  addCard: (tex: THREE.Texture) => void;
  dispose: () => void;
  setDrag: (active: boolean, dx: number, dy: number) => void;
}

function makeGallery(
  container: HTMLDivElement,
  onError: () => void
): GalleryHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    onError();
    return null;
  }
  if (!renderer.getContext()) {
    onError();
    return null;
  }

  const W = container.clientWidth || 800;
  const H = container.clientHeight || 600;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x05060a, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060a, 0.018);

  const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 200);
  camera.position.set(0, 0, 6);

  const ambient = new THREE.AmbientLight(0xffffff, 1.1);
  scene.add(ambient);

  // each card is a textured plane positioned further back as more arrive.
  const cardGeo = new THREE.PlaneGeometry(4, 3);
  interface Card {
    mesh: THREE.Mesh;
    targetZ: number;
    baseX: number;
    baseY: number;
    phase: number;
    mat: THREE.MeshBasicMaterial;
  }
  const cards: Card[] = [];
  const SPACING = 3.2;

  function addCard(tex: THREE.Texture) {
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(cardGeo, mat);
    // newest card at the front; push all existing cards back.
    for (const c of cards) c.targetZ -= SPACING;
    // gentle alternating offset so the corridor isn't a dead-straight tunnel.
    const n = cards.length;
    const baseX = (n % 2 === 0 ? 1 : -1) * (1.2 + (n % 3) * 0.35);
    const baseY = Math.sin(n * 1.3) * 0.7;
    const card: Card = {
      mesh,
      targetZ: 1.5,
      baseX,
      baseY,
      phase: Math.random() * Math.PI * 2,
      mat,
    };
    mesh.position.set(baseX, baseY, -8); // fly in from the back
    scene.add(mesh);
    cards.push(card);
  }

  // drag-to-look (gentle, secondary input — piece runs hands-off)
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  function setDrag(active: boolean, dx: number, dy: number) {
    if (active) {
      look.tx = THREE.MathUtils.clamp(dx * 0.0025, -0.8, 0.8);
      look.ty = THREE.MathUtils.clamp(dy * 0.0025, -0.5, 0.5);
    } else {
      look.tx = 0;
      look.ty = 0;
    }
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let disposed = false;

  function animate() {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    const dt = Math.min(clock.getDelta(), 0.05);

    // slow auto-drift of the camera through the gallery
    look.x += (look.tx - look.x) * 0.05;
    look.y += (look.ty - look.y) * 0.05;
    camera.position.x = Math.sin(t * 0.07) * 1.4 + look.x * 3;
    camera.position.y = Math.cos(t * 0.05) * 0.6 + look.y * 2;
    camera.lookAt(0, 0, -10);

    for (const c of cards) {
      // ease toward target depth
      c.mesh.position.z += (c.targetZ - c.mesh.position.z) * Math.min(dt * 2, 1);
      // parallax sway + slow rotation
      c.mesh.position.x =
        c.baseX + Math.sin(t * 0.2 + c.phase) * 0.25;
      c.mesh.position.y =
        c.baseY + Math.cos(t * 0.15 + c.phase) * 0.2;
      c.mesh.rotation.y = Math.sin(t * 0.1 + c.phase) * 0.12;
      c.mesh.lookAt(camera.position.x, camera.position.y, camera.position.z);
      // fade-in newly arrived cards
      if (c.mat.opacity < 1) c.mat.opacity = Math.min(1, c.mat.opacity + dt * 0.6);
    }

    renderer.render(scene, camera);
  }
  animate();

  function onResize() {
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    for (const c of cards) {
      c.mat.map?.dispose();
      c.mat.dispose();
    }
    cardGeo.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === container)
      container.removeChild(renderer.domElement);
  }

  return { addCard, dispose, setDrag };
}

// load a remote image into a three texture, falling back to procedural canvas.
function loadRemoteTexture(
  url: string,
  fallback: HTMLCanvasElement
): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(new THREE.CanvasTexture(imgToCanvas(img)));
    img.onerror = () => resolve(new THREE.CanvasTexture(fallback));
    img.src = url;
  });
}

// draw a loaded image onto a canvas (keeps texture handling uniform + avoids
// cross-origin tainting surprises by going through CanvasTexture consistently)
function imgToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 384;
  const ctx = cv.getContext("2d")!;
  ctx.drawImage(img, 0, 0, 512, 384);
  return cv;
}

// ── component ────────────────────────────────────────────────────────────────

export default function DreamChaptersPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<GalleryHandle | null>(null);
  const audioRef = useRef<JourneyAudio | null>(null);
  const phaseIdxRef = useRef(0);
  const elapsedRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const chapterCountRef = useRef(0);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [localOnly, setLocalOnly] = useState(false);
  const [status, setStatus] = useState<string>("");

  // mint one chapter card for the given phase
  const mintChapter = useCallback(async (phase: Phase) => {
    const chapterNumber = chapterCountRef.current + 1;
    chapterCountRef.current = chapterNumber;
    const prompt = makePrompt(phase, chapterNumber);
    const fallback = drawProceduralCard(phase, prompt, chapterNumber);

    let source: "model" | "local" = "local";
    let tex: THREE.Texture | null = null;

    try {
      const res = await fetch(
        "/dream/689-dream-chapters/api",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { url?: string };
        if (data.url) {
          tex = await loadRemoteTexture(data.url, fallback);
          source = "model";
        }
      } else {
        // 501 (no key) / 429 (limit) / 5xx → procedural fallback
        setLocalOnly(true);
      }
    } catch {
      setLocalOnly(true);
    }

    if (!tex) {
      tex = new THREE.CanvasTexture(fallback);
      source = "local";
    }

    galleryRef.current?.addCard(tex);
    setChapters((prev) => [
      { id: chapterNumber, phaseName: phase.name, prompt, source },
      ...prev,
    ]);
  }, []);

  // begin the journey
  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    setStatus("");

    const mount = mountRef.current;
    if (mount && !galleryRef.current) {
      const g = makeGallery(mount, () => setWebglOk(false));
      galleryRef.current = g;
    }

    // audio
    const a = new JourneyAudio();
    audioRef.current = a;
    await a.resume();
    a.fadeIn();
    a.setPad(PHASES[0]);
    a.startMotif(() => PHASES[phaseIdxRef.current]);

    // mint the opening chapter immediately
    void mintChapter(PHASES[0]);

    // master timeline tick (250ms)
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const d = (now - last) / 1000;
      last = now;
      elapsedRef.current += d;
      setElapsed(elapsedRef.current);

      // determine which phase we're in by cumulative seconds
      let acc = 0;
      let idx = 0;
      for (let i = 0; i < PHASES.length; i++) {
        if (elapsedRef.current < acc + PHASES[i].seconds) {
          idx = i;
          break;
        }
        acc += PHASES[i].seconds;
        idx = i + 1;
      }

      if (idx < PHASES.length && idx !== phaseIdxRef.current) {
        // crossed a phase boundary → change music + mint a chapter
        phaseIdxRef.current = idx;
        setPhaseIdx(idx);
        a.setPad(PHASES[idx]);
        void mintChapter(PHASES[idx]);
      }

      if (elapsedRef.current >= TOTAL_SECONDS) {
        // loop the journey — memory keeps accumulating across cycles
        elapsedRef.current = 0;
        phaseIdxRef.current = 0;
        setPhaseIdx(0);
        a.setPad(PHASES[0]);
        void mintChapter(PHASES[0]);
      }

      tickRef.current = window.setTimeout(step, 250);
    };
    tickRef.current = window.setTimeout(step, 250);
  }, [started, mintChapter]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (tickRef.current !== null) window.clearTimeout(tickRef.current);
      void audioRef.current?.stop();
      void audioRef.current?.close();
      galleryRef.current?.dispose();
      galleryRef.current = null;
    };
  }, []);

  // gentle drag-to-look wiring
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      galleryRef.current?.setDrag(true, dx, dy);
    };
    const onUp = () => {
      draggingRef.current = false;
      galleryRef.current?.setDrag(false, 0, 0);
    };
    mount.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      mount.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const phase = PHASES[phaseIdx];
  const currentPrompt = makePrompt(phase, chapterCountRef.current || 1);
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060a] text-white">
      {/* three.js gallery canvas */}
      <div
        ref={mountRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        aria-label="Receding depth-field gallery of dreamed chapter cards"
      />

      {/* WebGL fallback notice + stacked-card Canvas2D substitute */}
      {!webglOk && (
        <div className="absolute inset-0 overflow-y-auto bg-[#05060a] p-6">
          <p className="mb-4 text-base text-amber-300/95">
            WebGL is unavailable — showing a flat stacked-card gallery instead.
          </p>
          <div className="flex flex-col gap-4">
            {chapters.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="text-xl font-medium text-white/95">
                  Chapter {c.id} · {c.phaseName}
                </div>
                <div className="mt-1 text-base text-white/75">{c.prompt}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* heading + journey HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white/95">
          Dream Chapters
        </h1>
        <p className="mt-1 max-w-xl text-base text-white/75">
          A long-form generative journey that remembers everything it has
          dreamed — each movement mints a chapter card, accumulating a visible
          gallery of its own past.
        </p>

        {started && (
          <div className="mt-5 max-w-xl rounded-xl border border-white/10 bg-black/45 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between text-base">
              <span className="font-mono text-xl text-white/95">
                {phase.name}
              </span>
              <span className="font-mono text-base text-white/75">
                {String(mins).padStart(2, "0")}:
                {String(secs).padStart(2, "0")} · {chapters.length} chapter
                {chapters.length === 1 ? "" : "s"}
              </span>
            </div>
            {/* timeline of named phases */}
            <div className="mt-3 flex gap-1">
              {PHASES.map((p, i) => (
                <div
                  key={p.name}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i === phaseIdx
                      ? "bg-white/90"
                      : i < phaseIdx
                        ? "bg-white/40"
                        : "bg-white/15"
                  }`}
                  title={p.name}
                />
              ))}
            </div>
            <p className="mt-3 font-mono text-base leading-relaxed text-white/75">
              {currentPrompt}
            </p>
            {localOnly && (
              <p className="mt-3 text-base text-amber-300/95">
                dreaming locally (no model key) — chapter cards painted in code
              </p>
            )}
            {status && (
              <p className="mt-2 text-base text-rose-300">{status}</p>
            )}
          </div>
        )}
      </div>

      {/* begin overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#05060a]/80 px-6 text-center backdrop-blur-sm">
          <p className="max-w-md text-base leading-relaxed text-white/75">
            Five named movements over five-plus minutes. At each phase boundary
            the piece dreams a chapter card; every card it has ever made drifts
            in a receding corridor you can look back through. Runs hands-off —
            drag gently to glance around.
          </p>
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-white px-8 py-2.5 text-base font-medium text-black transition-opacity hover:opacity-90"
          >
            Begin
          </button>
          <Link
            href="/dream"
            className="text-base text-white/75 underline-offset-4 hover:text-white hover:underline"
          >
            ← back to the lab
          </Link>
        </div>
      )}
    </main>
  );
}
