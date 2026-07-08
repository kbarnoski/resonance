"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { makeHandLandmarker, type HandLandmarkerLike, type HandLandmark } from "./handLoader";
import { startRhythm, LANES, STEPS, type Lane, type RhythmEngine } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1297 · HAND LOOM
 *
 * What if you could PLAY a rhythmic groove in the air with your bare hands, tracked
 * by the webcam? A steady 16-step transport runs at 110 BPM — kick / clap / hat /
 * bass interlock into a UV black-light rave groove. Two hands conduct it via
 * MediaPipe HandLandmarker: hand HEIGHT opens the filter (raise a hand → brighter),
 * hand X picks a lane, PINCH (thumb-to-index) quantises to the nearest step and
 * latches a hit ON the beat, finger SPREAD swings it, and the gap between your two
 * hands adds density. Fingertips leave luminous trails; a sweep line crosses the
 * step-lane so you can SEE the groove. A camera-based, glove-free cousin of Imogen
 * Heap's MiMU gloves. Degrades gracefully: an autonomous demo groove plays before
 * (and without) any camera.
 */

const SEC16 = 60 / 110 / 4; // one sixteenth at 110 BPM (visual clock before audio)
const PINCH_ON = 0.055; // normalized thumb-index distance to count as a pinch

// Lane colours — electric black-light rave palette.
const LANE_RGB: Record<Lane, [number, number, number]> = {
  kick: [255, 45, 149], // magenta
  clap: [34, 211, 238], // cyan
  hat: [163, 230, 53], // lime
  bass: [168, 85, 247], // violet
};

// Display copy of the default groove so the grid is alive before audio starts.
const DEMO_PATTERN: Record<Lane, boolean[]> = {
  kick: stepsOn([0, 4, 8, 12]),
  clap: stepsOn([4, 12]),
  hat: stepsOn([2, 6, 10, 14]),
  bass: stepsOn([2, 6, 10, 14]),
};

function stepsOn(idx: number[]): boolean[] {
  const a = new Array<boolean>(STEPS).fill(false);
  for (const i of idx) a[i] = true;
  return a;
}

interface TrailPt {
  x: number;
  y: number;
  life: number;
  hue: number;
  size: number;
}

interface HandView {
  pts: { x: number; y: number }[]; // mirrored, in canvas space 0..1
  lane: number;
  pinch: number;
  hue: number;
}

type CamState = "off" | "loading" | "on" | "denied" | "unavailable";

export default function HandLoomPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const engineRef = useRef<RhythmEngine | null>(null);
  const landmarkerRef = useRef<HandLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const reducedRef = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const trailsRef = useRef<TrailPt[]>([]);
  const handsRef = useRef<HandView[]>([]);
  const pinchedRef = useRef<boolean[]>([false, false]);
  const lastTsRef = useRef(0);
  const lastFrameRef = useRef(0);
  const camOnRef = useRef(false);

  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── the render + tracking loop (runs from mount, alive before audio) ──────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const videoEl = videoRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    const dist = (a: HandLandmark, b: HandLandmark) => Math.hypot(a.x - b.x, a.y - b.y);

    const detect = () => {
      const lm = landmarkerRef.current;
      const video = videoRef.current;
      if (!lm || !video || !camOnRef.current) {
        handsRef.current = [];
        return;
      }
      if (video.readyState < 2 || video.videoWidth === 0) return;
      let ts = performance.now();
      if (ts <= lastTsRef.current) ts = lastTsRef.current + 1;
      lastTsRef.current = ts;
      let res;
      try {
        res = lm.detectForVideo(video, ts);
      } catch {
        return;
      }
      const eng = engineRef.current;
      const views: HandView[] = [];
      const hands = res.landmarks ?? [];
      let topBrightness = 0; // raise a hand → brighter
      let maxSpread = 0;

      for (let i = 0; i < hands.length; i++) {
        const h = hands[i];
        if (!h || h.length < 21) continue;
        const wrist = h[0];
        const thumb = h[4];
        const index = h[8];
        const pinky = h[20];
        const pinchDist = dist(thumb, index);
        const spread = dist(index, pinky);
        // mirror X so it reads like a mirror
        const pts = h.map((p) => ({ x: 1 - p.x, y: p.y }));
        const idxTip = pts[8];
        const lane = Math.max(0, Math.min(3, Math.floor(idxTip.x * 4)));
        const hue = i === 0 ? 315 : 96;
        views.push({ pts, lane, pinch: pinchDist, hue });

        topBrightness = Math.max(topBrightness, 1 - wrist.y);
        maxSpread = Math.max(maxSpread, spread);

        // pinch rising-edge → toggle the nearest step in this hand's lane
        const isPinch = pinchDist < PINCH_ON;
        const was = pinchedRef.current[i] ?? false;
        if (isPinch && !was && eng) {
          const laneName = LANES[lane];
          const step = eng.nearestStep();
          eng.armStep(laneName, step, !eng.patterns[laneName][step]);
        }
        pinchedRef.current[i] = isPinch;
      }
      // clear stale pinch latches for absent hands
      for (let i = hands.length; i < pinchedRef.current.length; i++) {
        pinchedRef.current[i] = false;
      }

      handsRef.current = views;

      if (eng && hands.length > 0) {
        eng.setCutoff(topBrightness);
        eng.setSwing(Math.max(0, Math.min(1, (maxSpread - 0.12) / 0.28)) * 0.5);
        if (hands.length >= 2) {
          const w0 = views[0].pts[0];
          const w1 = views[1].pts[0];
          const between = Math.hypot(w0.x - w1.x, w0.y - w1.y);
          eng.setDensity(Math.max(0, Math.min(1, (between - 0.2) / 0.5)));
        } else {
          eng.setDensity(0);
        }
      }
    };

    const spawnTrails = (dt: number) => {
      const reduced = reducedRef.current;
      const tips = reduced ? [8] : [4, 8, 12, 16, 20];
      const cap = reduced ? 220 : 640;
      const { w, h } = sizeRef.current;
      for (const hv of handsRef.current) {
        const near = hv.pinch < PINCH_ON;
        for (const t of tips) {
          const p = hv.pts[t];
          if (!p) continue;
          trailsRef.current.push({
            x: p.x * w,
            y: p.y * h,
            life: 1,
            hue: hv.hue + (t === 8 ? 0 : t * 2),
            size: near && t === 8 ? 26 : 12,
          });
        }
      }
      // age + prune
      const decay = (reduced ? 2.6 : 1.7) * dt;
      const arr = trailsRef.current;
      for (const tp of arr) tp.life -= decay;
      trailsRef.current = arr.filter((tp) => tp.life > 0);
      if (trailsRef.current.length > cap) {
        trailsRef.current.splice(0, trailsRef.current.length - cap);
      }
    };

    // circular proximity of the sweep to an armed step (for the cell flash)
    const flashFor = (pattern: boolean[], playPos: number) => {
      let best = 0;
      for (let s = 0; s < STEPS; s++) {
        if (!pattern[s]) continue;
        let d = Math.abs(playPos - s);
        d = Math.min(d, STEPS - d);
        if (d < 0.6) best = Math.max(best, 1 - d / 0.6);
      }
      return best;
    };

    const draw = (playPos: number, patterns: Record<Lane, boolean[]>) => {
      const { w, h, dpr } = sizeRef.current;
      const reduced = reducedRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // motion-blur wash (denser wash = shorter trails; more for reduced motion)
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = reduced ? "rgba(5,2,12,0.55)" : "rgba(5,2,12,0.30)";
      ctx.fillRect(0, 0, w, h);

      const laneW = w / 4;
      const top = h * 0.16;
      const bot = h * 0.9;
      const span = bot - top;
      const stepY = (s: number) => top + (s / STEPS) * span;
      const sweepY = top + (playPos / STEPS) * span;

      // which lane the (first) hand is over
      const selLane = handsRef.current.length > 0 ? handsRef.current[0].lane : -1;

      ctx.globalCompositeOperation = "lighter";
      for (let l = 0; l < 4; l++) {
        const lane = LANES[l];
        const [r, g, b] = LANE_RGB[lane];
        const cx = laneW * (l + 0.5);
        const selected = l === selLane;

        // column tint
        ctx.fillStyle = `rgba(${r},${g},${b},${selected ? 0.1 : 0.035})`;
        ctx.fillRect(laneW * l, top - 18, laneW, span + 36);

        const flash = flashFor(patterns[lane], playPos);

        for (let s = 0; s < STEPS; s++) {
          const y = stepY(s);
          const on = patterns[lane][s];
          if (on) {
            const near = Math.min(1, flash + 0.25);
            const rad = 7 + near * 10;
            const grd = ctx.createRadialGradient(cx, y, 0, cx, y, rad * 2.4);
            grd.addColorStop(0, `rgba(${r},${g},${b},${0.55 + near * 0.4})`);
            grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(cx, y, rad * 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = `rgba(255,255,255,${0.25 + near * 0.55})`;
            ctx.beginPath();
            ctx.arc(cx, y, 2.6 + near * 2.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = `rgba(${r},${g},${b},0.14)`;
            ctx.fillRect(cx - 9, y - 1, 18, 2);
          }
        }
      }

      // sweep line across all lanes
      ctx.globalCompositeOperation = "lighter";
      const sg = ctx.createLinearGradient(0, sweepY - 14, 0, sweepY + 14);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(0.5, "rgba(255,255,255,0.5)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(0, sweepY - 14, w, 28);
      ctx.strokeStyle = "rgba(220,240,255,0.75)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, sweepY);
      ctx.lineTo(w, sweepY);
      ctx.stroke();

      // fingertip trails
      for (const tp of trailsRef.current) {
        const a = Math.max(0, tp.life);
        const rad = tp.size * (0.4 + a * 0.6);
        const grd = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, rad);
        grd.addColorStop(0, `hsla(${tp.hue},95%,65%,${0.5 * a})`);
        grd.addColorStop(1, `hsla(${tp.hue},95%,60%,0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // hand skeleton sparks (light joints)
      for (const hv of handsRef.current) {
        for (const p of hv.pts) {
          ctx.fillStyle = `hsla(${hv.hue},90%,70%,0.5)`;
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // lane labels
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "600 13px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      for (let l = 0; l < 4; l++) {
        const [r, g, b] = LANE_RGB[LANES[l]];
        const cx = laneW * (l + 0.5);
        ctx.fillStyle = `rgba(${r},${g},${b},${l === selLane ? 1 : 0.7})`;
        ctx.fillText(LANES[l].toUpperCase(), cx, top - 26);
      }
    };

    const frame = (now: number) => {
      const dt = lastFrameRef.current ? Math.min(0.05, (now - lastFrameRef.current) / 1000) : 0.016;
      lastFrameRef.current = now;

      detect();
      spawnTrails(dt);

      const eng = engineRef.current;
      const playPos = eng ? eng.loopPosition() : ((now / 1000 / SEC16) % STEPS);
      const patterns = eng ? eng.patterns : DEMO_PATTERN;
      draw(playPos, patterns);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      engineRef.current?.stop();
      engineRef.current = null;
      try {
        landmarkerRef.current?.close();
      } catch {
        /* ignore */
      }
      landmarkerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
    };
  }, []);

  // ── gesture-gated audio ───────────────────────────────────────────────────
  const begin = useCallback(async () => {
    if (engineRef.current) return;
    try {
      const eng = await startRhythm();
      engineRef.current = eng;
      setPhase("playing");
    } catch {
      setNotice("Audio could not start in this browser. Try tapping again or reloading.");
    }
  }, []);

  const enableCamera = useCallback(async () => {
    if (camOnRef.current || camState === "loading") return;
    const video = videoRef.current;
    if (!video) return;
    setNotice(null);
    setCamState("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      const lm = await makeHandLandmarker();
      landmarkerRef.current = lm;
      camOnRef.current = true;
      setCamState("on");
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamState("denied");
        setNotice("Camera denied — the demo groove keeps playing. Allow the camera to conduct with your hands.");
      } else {
        setCamState("unavailable");
        setNotice("Camera or hand-tracking unavailable here — the demo groove keeps playing on its own.");
      }
    }
  }, [camState]);

  return (
    <div ref={wrapRef} className="relative h-dvh w-full overflow-hidden bg-[#05020c] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 block" />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* corner design-notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-3 top-3 z-20 min-h-[44px] rounded-lg px-4 py-2.5 text-base text-white/75 underline decoration-white/30 underline-offset-4 hover:text-white"
      >
        Read the design notes
      </button>

      {/* header */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xl">
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Hand Loom</h1>
        <p className="mt-1 text-base text-white/75">
          Play a groove in the air — two hands conduct a 16-step machine tracked by your webcam.
        </p>
      </div>

      {/* primary controls */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-3 px-4">
        {notice && (
          <p className="max-w-md text-center text-base text-rose-300">{notice}</p>
        )}

        {phase === "idle" ? (
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-fuchsia-500/90 px-4 py-2.5 text-base font-semibold text-white shadow-[0_0_30px_rgba(217,70,239,0.5)] hover:bg-fuchsia-400"
          >
            Begin the groove
          </button>
        ) : camState === "on" ? (
          <p className="text-base text-white/75">
            Hands live — raise to brighten, move across to pick a lane, pinch to drop a hit.
          </p>
        ) : (
          <button
            onClick={enableCamera}
            disabled={camState === "loading"}
            className="min-h-[44px] rounded-full bg-cyan-500/90 px-4 py-2.5 text-base font-semibold text-white shadow-[0_0_30px_rgba(34,211,238,0.5)] hover:bg-cyan-400 disabled:opacity-60"
          >
            {camState === "loading" ? "Starting camera…" : "Enable camera to play with your hands"}
          </button>
        )}
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a0518] p-6 text-base text-white/85">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p className="mt-3">
              A steady 16-step transport at 110 BPM runs a UV black-light rave groove — kick,
              clap, hat and an offbeat rolling bass, all pure Web Audio (oscillators, noise,
              filters, envelopes) through a limiter. It is a played, pulsing instrument, not a
              drone.
            </p>
            <p className="mt-3">
              MediaPipe HandLandmarker tracks up to two hands from the webcam. Hand HEIGHT opens
              the filter (raise a hand → brighter), hand X selects a lane, a PINCH (thumb to
              index) quantises to the nearest step and toggles a hit ON the beat, finger SPREAD
              swings it, and the distance between your two hands adds density.
            </p>
            <p className="mt-3 text-white/70">
              A glove-free cousin of Imogen Heap&apos;s MiMU gloves — gestural music control,
              but through a camera instead of sensors. Before or without a camera, an autonomous
              demo groove keeps playing. No strobe; motion is smooth and reduced-motion aware.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-white/10 px-4 py-2.5 text-base text-white hover:bg-white/20"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
