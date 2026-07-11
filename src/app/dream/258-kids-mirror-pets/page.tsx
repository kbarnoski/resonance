"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// **For**: kids (4+)
// A music-box mirror in the style of Daniel Rozin's mosaic mirrors (Wooden Mirror,
// PomPom Mirror). The webcam never shows your literal face — instead a grid of
// soft glowing "pets" (little circles with eyes) light up to FORM your reflection.
// The pets that wake up sing: vertical position picks a pentatonic note, open
// mouth runs a sparkly arpeggio, a smile turns everyone warm and happy, head tilt
// pans the music box left/right and leans the whole swarm.

// ── Pentatonic scale (C major pentatonic) across several octaves ───────────────
// Low rows = low notes, high rows = high notes (a vertical xylophone of faces).
const PENTA = [
  130.81, 146.83, 164.81, 196.0, 220.0, // C3 D3 E3 G3 A3
  261.63, 293.66, 329.63, 392.0, 440.0, // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, 783.99, 880.0, // C5 D5 E5 G5 A5
];

// Grid size (cols x rows). Kept modest so it reads as chunky "physical units".
const COLS = 14;
const ROWS = 18;

interface Tile {
  // target & eased brightness 0..1
  target: number;
  bright: number;
  // tiny eye life
  blink: number; // 0..1, 1 = open
  blinkPhase: number;
}

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  pan: StereoPannerNode;
  busy: boolean;
  freeAt: number;
}

export default function KidsMirrorPets() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const [started, setStarted] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // smoothed driving values (refs so the animation loop always sees latest)
  const drive = useRef({
    jaw: 0, // 0..1 mouth open
    smile: 0, // 0..1
    cx: 0.5, // face center x (0..1, already mirrored)
    cy: 0.5, // face center y
    tilt: 0, // -1..1 head tilt
    present: 0, // 0..1 confidence face is here
  });

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;

    // ── tile grid ────────────────────────────────────────────────────────────
    const tiles: Tile[] = [];
    for (let i = 0; i < COLS * ROWS; i++) {
      tiles.push({
        target: 0,
        bright: 0,
        blink: 1,
        blinkPhase: Math.random() * Math.PI * 2,
      });
    }
    // freshly-lit pulse markers (for the arpeggio sparkle sweep)
    const sparkle: number[] = new Array(COLS * ROWS).fill(0);

    let stopped = false;
    let demoMode = false; // flips true if camera/MediaPipe is unavailable
    let stream: MediaStream | null = null;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown } | null = null;
    let lastDetect = 0;
    // latest landmarks for painting the mosaic portrait
    let faceLandmarks: { x: number; y: number }[] | null = null;

    // ── audio graph ──────────────────────────────────────────────────────────
    const ac = new AudioContext();
    acRef.current = ac;
    const master = ac.createGain();
    master.gain.value = 0.9;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 24;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ac.destination);

    // gentle always-on ambient bed
    function makeBed() {
      ([
        [65.41, 0.05],
        [98.0, 0.035],
        [130.81, 0.03],
      ] as [number, number][]).forEach(([hz, g]) => {
        const osc = ac.createOscillator();
        const gn = ac.createGain();
        const lfo = ac.createOscillator();
        const lfoGain = ac.createGain();
        osc.type = "sine";
        osc.frequency.value = hz;
        gn.gain.setValueAtTime(0, ac.currentTime);
        gn.gain.linearRampToValueAtTime(g, ac.currentTime + 3.5);
        // slow shimmer
        lfo.type = "sine";
        lfo.frequency.value = 0.08 + Math.random() * 0.06;
        lfoGain.gain.value = g * 0.35;
        lfo.connect(lfoGain);
        lfoGain.connect(gn.gain);
        osc.connect(gn);
        gn.connect(master);
        osc.start();
        lfo.start();
      });
    }
    makeBed();

    // pool of plucky music-box voices
    const POOL = 12;
    const voices: Voice[] = [];
    for (let i = 0; i < POOL; i++) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const pan = ac.createStereoPanner();
      osc.type = "triangle";
      osc.frequency.value = 440;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(master);
      osc.start();
      voices.push({ osc, gain, pan, busy: false, freeAt: 0 });
    }

    function makeSing(hz: number, vol: number, panV: number, happy: number) {
      const now = ac.currentTime;
      let v = voices.find((vc) => !vc.busy || vc.freeAt < now);
      if (!v) v = voices[Math.floor(Math.random() * voices.length)];
      v.busy = true;
      // happy -> brighter timbre (saw-ish), gentle -> triangle/sine
      v.osc.type = happy > 0.5 ? "sawtooth" : "triangle";
      v.osc.frequency.setValueAtTime(hz, now);
      v.pan.pan.setValueAtTime(Math.max(-1, Math.min(1, panV)), now);
      const dur = 0.6 + Math.random() * 0.5;
      const peak = Math.min(0.16, vol);
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(0.0001, now);
      v.gain.gain.linearRampToValueAtTime(peak, now + 0.02); // soft attack
      v.gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      v.freeAt = now + dur;
    }

    // ── layout helpers ─────────────────────────────────────────────────────────
    function cellSize() {
      const pad = Math.min(W, H) * 0.04;
      const gw = (W - pad * 2) / COLS;
      const gh = (H - pad * 2) / ROWS;
      return { pad, gw, gh };
    }

    // light up tiles for a normalized face point
    function lightAt(nx: number, ny: number, radius: number, strength: number) {
      const c = nx * COLS;
      const r = ny * ROWS;
      const span = Math.ceil(radius);
      for (let dr = -span; dr <= span; dr++) {
        for (let dc = -span; dc <= span; dc++) {
          const cc = Math.round(c) + dc;
          const rr = Math.round(r) + dr;
          if (cc < 0 || cc >= COLS || rr < 0 || rr >= ROWS) continue;
          const dist = Math.hypot(c - cc, r - rr);
          if (dist > radius) continue;
          const falloff = 1 - dist / radius;
          const idx = rr * COLS + cc;
          tiles[idx].target = Math.max(tiles[idx].target, falloff * strength);
        }
      }
    }

    // ── MediaPipe setup ────────────────────────────────────────────────────────
    async function runCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) throw new Error("no video el");
        video.srcObject = stream;
        await video.play();

        // @ts-expect-error - runtime ESM import, no local types
        const vision: any = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/+esm"); // eslint-disable-line @typescript-eslint/no-explicit-any
        const { FilesetResolver, FaceLandmarker } = vision;
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm"
        );
        landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
      } catch (err) {
        console.warn("camera/mediapipe unavailable", err);
        setStatusMsg("Camera's not on — here's a self-playing demo! Tap to wake the pets.");
        demoMode = true;
      }
    }
    runCamera();

    // ── EMA smoothing ──────────────────────────────────────────────────────────
    function applyEMA(key: keyof typeof drive.current, v: number, a: number) {
      drive.current[key] = drive.current[key] * (1 - a) + v * a;
    }

    function runDetect(ts: number) {
      if (!landmarker) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = landmarker.detectForVideo(video, ts);
        const lms = result?.faceLandmarks?.[0];
        const bs = result?.faceBlendshapes?.[0]?.categories as
          | { categoryName: string; score: number }[]
          | undefined;
        if (lms && lms.length) {
          // bounding region + center (mirror x so it feels like a mirror)
          let minX = 1, maxX = 0, minY = 1, maxY = 0;
          for (const p of lms) {
            const mx = 1 - p.x;
            if (mx < minX) minX = mx;
            if (mx > maxX) maxX = mx;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          applyEMA("cx", cx, 0.4);
          applyEMA("cy", cy, 0.4);
          applyEMA("present", 1, 0.3);

          // head tilt from eye corners (33 = right eye outer, 263 = left eye outer)
          const a = lms[33];
          const b = lms[263];
          if (a && b) {
            const tilt = Math.max(-1, Math.min(1, (a.y - b.y) * 6));
            applyEMA("tilt", -tilt, 0.3); // mirrored
          }

          let jaw = 0, smile = 0;
          if (bs) {
            for (const c of bs) {
              if (c.categoryName === "jawOpen") jaw = c.score;
              if (
                c.categoryName === "mouthSmileLeft" ||
                c.categoryName === "mouthSmileRight"
              )
                smile = Math.max(smile, c.score);
            }
          }
          applyEMA("jaw", jaw, 0.3);
          applyEMA("smile", smile, 0.25);

          // store the lit-tile source as the face outline points (sparse)
          faceLandmarks = lms;
        } else {
          applyEMA("present", 0, 0.08);
        }
      } catch {
        // detection hiccup — ignore this frame
      }
    }

    // ── demo auto-driver ─────────────────────────────────────────────────────
    function runDemoDrive(ts: number) {
      const t = ts * 0.001;
      drive.current.cx = 0.5 + Math.sin(t * 0.6) * 0.22;
      drive.current.cy = 0.5 + Math.cos(t * 0.43) * 0.18;
      drive.current.jaw = 0.5 + 0.5 * Math.sin(t * 1.3);
      drive.current.smile = 0.5 + 0.5 * Math.sin(t * 0.5 + 1);
      drive.current.tilt = Math.sin(t * 0.35) * 0.6;
      drive.current.present = 1;
    }

    // ── musical scheduler ──────────────────────────────────────────────────────
    let nextNoteAt = 0;
    let sweepCol = 0;

    function runMusic(ts: number) {
      const d = drive.current;
      if (d.present < 0.25) return;
      // tempo: faster when mouth open
      const interval = 360 - d.jaw * 230; // ms between sweeps
      if (ts < nextNoteAt) return;
      nextNoteAt = ts + interval;

      // collect lit tiles in the current sweep column (arpeggio across the swarm)
      const lit: { idx: number; row: number; col: number }[] = [];
      for (let r = 0; r < ROWS; r++) {
        const idx = r * COLS + sweepCol;
        if (tiles[idx].bright > 0.35) lit.push({ idx, row: r, col: sweepCol });
      }
      if (lit.length) {
        // pick a few of the lit tiles to ring (more when mouth is open)
        const howMany = Math.max(1, Math.round(1 + d.jaw * 3));
        for (let k = 0; k < howMany && k < lit.length; k++) {
          const pick = lit[Math.floor((lit.length * k) / howMany)];
          // vertical position -> pitch (top = high)
          const rowFromTop = ROWS - 1 - pick.row;
          const scaleIdx = Math.round(
            (rowFromTop / (ROWS - 1)) * (PENTA.length - 1)
          );
          let hz = PENTA[scaleIdx];
          // smile -> lift a major-ish third sometimes for happy harmony
          if (d.smile > 0.5 && Math.random() < d.smile) {
            hz *= 1.25;
          }
          const panV = (pick.col / (COLS - 1)) * 2 - 1 + d.tilt * 0.4;
          const vol = 0.05 + d.jaw * 0.08 + tiles[pick.idx].bright * 0.05;
          makeSing(hz, vol, panV, d.smile);
          sparkle[pick.idx] = 1;
        }
      }
      sweepCol = (sweepCol + 1) % COLS;
    }

    // ── color: warm/happy on smile, cool/calm otherwise ────────────────────────
    function tileColor(bright: number, smile: number, blink: number) {
      // hue from cool violet (270) -> warm gold/pink (40) as smile rises
      const hue = 270 - smile * 230;
      const sat = 70 + smile * 25;
      const light = 30 + bright * 45 + blink * 4;
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }

    // ── draw ───────────────────────────────────────────────────────────────────
    function drawScene(ts: number) {
      const gc = canvas!.getContext("2d");
      if (!gc) return;
      gc.setTransform(dpr, 0, 0, dpr, 0, 0);
      gc.fillStyle = "#06010f";
      gc.fillRect(0, 0, W, H);

      const d = drive.current;

      // reset targets, then light from face
      for (const tl of tiles) tl.target = 0;
      if (faceLandmarks && d.present > 0.25 && !demoMode) {
        // sample a subset of landmarks to paint the portrait
        for (let i = 0; i < faceLandmarks.length; i += 3) {
          const p = faceLandmarks[i];
          lightAt(1 - p.x, p.y, 1.3, 0.85 + d.smile * 0.15);
        }
      } else if (d.present > 0.25) {
        // demo / fallback: a soft moving blob "face"
        const rad = 3.2 + d.jaw * 1.2;
        lightAt(d.cx, d.cy, rad, 0.95);
        lightAt(d.cx - 0.06, d.cy - 0.05, 1.0, 1.0); // eyes
        lightAt(d.cx + 0.06, d.cy - 0.05, 1.0, 1.0);
        lightAt(d.cx, d.cy + 0.07, 1.0 + d.jaw, 0.9); // mouth
      }

      const { pad, gw, gh } = cellSize();
      const lean = d.tilt * 0.06; // whole mosaic leans with head tilt
      gc.save();
      gc.translate(W / 2, H / 2);
      gc.rotate(lean);
      gc.translate(-W / 2, -H / 2);

      const radius = Math.min(gw, gh) * 0.42;

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const idx = r * COLS + c;
          const tl = tiles[idx];
          // ease toward target
          tl.bright += (tl.target - tl.bright) * (tl.target > tl.bright ? 0.35 : 0.08);
          // sparkle decay
          if (sparkle[idx] > 0) sparkle[idx] *= 0.85;
          // blink life: awake pets blink occasionally
          tl.blinkPhase += 0.02 + tl.bright * 0.01;
          const blinkWave = Math.sin(tl.blinkPhase);
          tl.blink = blinkWave > 0.96 ? 1 - (blinkWave - 0.96) / 0.04 : 1;

          const x = pad + c * gw + gw / 2;
          const y = pad + r * gh + gh / 2;
          const b = tl.bright;
          const spk = sparkle[idx];

          // dim "sleeping" pet always faintly visible (never empty/silent feel)
          const baseAlpha = 0.10 + b * 0.9;
          const rr = radius * (0.55 + b * 0.45) + spk * radius * 0.3;

          gc.beginPath();
          gc.arc(x, y, rr, 0, Math.PI * 2);
          gc.fillStyle = tileColor(b, d.smile, tl.blink);
          gc.globalAlpha = baseAlpha;
          gc.shadowColor = tileColor(Math.min(1, b + 0.2), d.smile, 1);
          gc.shadowBlur = b > 0.3 ? 14 + b * 16 + spk * 20 : 3;
          gc.fill();
          gc.shadowBlur = 0;
          gc.globalAlpha = 1;

          // eyes: only on awake pets so they read as little creatures
          if (b > 0.28) {
            const eyeR = rr * 0.16;
            const eyeOff = rr * 0.32;
            const eyeOpen = tl.blink;
            gc.fillStyle = "#0a0212";
            for (const sx of [-1, 1]) {
              gc.beginPath();
              gc.ellipse(
                x + sx * eyeOff,
                y - rr * 0.08,
                eyeR,
                eyeR * eyeOpen,
                0,
                0,
                Math.PI * 2
              );
              gc.fill();
              // sparkle glint
              gc.fillStyle = "rgba(255,255,255,0.85)";
              gc.beginPath();
              gc.arc(
                x + sx * eyeOff + eyeR * 0.3,
                y - rr * 0.08 - eyeR * 0.3,
                eyeR * 0.35 * eyeOpen,
                0,
                Math.PI * 2
              );
              gc.fill();
              gc.fillStyle = "#0a0212";
            }
            // happy smile mouth on the pet when child smiles
            if (d.smile > 0.4 && b > 0.5) {
              gc.strokeStyle = "#0a0212";
              gc.lineWidth = Math.max(1, rr * 0.08);
              gc.lineCap = "round";
              gc.beginPath();
              gc.arc(x, y + rr * 0.12, rr * 0.32, 0.15 * Math.PI, 0.85 * Math.PI);
              gc.stroke();
            }
          }
        }
      }
      gc.restore();
    }

    // ── main loop ──────────────────────────────────────────────────────────────
    const animate = (ts: number) => {
      if (stopped) return;
      rafRef.current = requestAnimationFrame(animate);

      if (demoMode) {
        runDemoDrive(ts);
      } else if (ts - lastDetect > 33) {
        lastDetect = ts;
        runDetect(ts);
      }

      drawScene(ts);
      runMusic(ts);
    };
    rafRef.current = requestAnimationFrame(animate);

    // ── tap-to-play fallback (works with or without camera) ────────────────────
    const onPointer = (e: PointerEvent) => {
      e.preventDefault();
      if (ac.state === "suspended") ac.resume();
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = (e.clientY - rect.top) / rect.height;
      lightAt(nx, ny, 2.2, 1);
      // immediately ring a note for the tapped spot
      const rowFromTop = (1 - ny) * (ROWS - 1);
      const scaleIdx = Math.round((rowFromTop / (ROWS - 1)) * (PENTA.length - 1));
      makeSing(PENTA[scaleIdx], 0.12, nx * 2 - 1, drive.current.smile);
      const idx = Math.min(
        COLS * ROWS - 1,
        Math.round(ny * (ROWS - 1)) * COLS + Math.round(nx * (COLS - 1))
      );
      sparkle[idx] = 1;
      // tapping also keeps a little presence alive so the music box can sweep
      applyEMA("present", 1, 0.6);
    };
    canvas.addEventListener("pointerdown", onPointer);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onPointer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      try {
        ac.close();
      } catch {
        /* already closed */
      }
      acRef.current = null;
    };
  }, [started]);

  return (
    <div className="relative w-full h-screen bg-[#06010f] overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
      />
      {/* hidden video element used as MediaPipe input */}
      <video
        ref={videoRef}
        className="absolute bottom-3 right-3 w-24 h-[72px] rounded-lg opacity-30 scale-x-[-1] pointer-events-none"
        playsInline
        muted
      />

      {/* Start gate (one big button, no reading needed to play) */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#06010f]">
          <h1 className="text-2xl font-bold text-foreground px-4 text-center">
            Mirror Pets
          </h1>
          <p className="text-base text-muted-foreground px-6 text-center max-w-sm">
            Move and make faces — a swarm of little singing pets becomes your
            reflection.
          </p>
          <button
            onClick={() => setStarted(true)}
            className="min-h-[88px] min-w-[88px] px-10 py-6 rounded-full bg-violet-500/30 border-2 border-violet-300 text-foreground text-2xl font-bold shadow-lg hover:bg-violet-500/50 transition-colors"
          >
            ✦ Start ✦
          </button>
        </div>
      )}

      {/* graceful-degradation status message */}
      {statusMsg && started && (
        <div className="absolute top-0 left-0 right-0 p-4 text-center pointer-events-none">
          <p className="text-base text-violet-300">{statusMsg}</p>
        </div>
      )}

      {/* design notes link */}
      <div className="absolute top-4 right-4 flex gap-3">
        <a
          href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/258-kids-mirror-pets/README.md"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground text-sm hover:text-foreground transition-colors"
        >
          design notes
        </a>
        <Link
          href="/dream"
          className="text-muted-foreground text-sm hover:text-foreground transition-colors"
        >
          ← dream lab
        </Link>
      </div>
    </div>
  );
}
