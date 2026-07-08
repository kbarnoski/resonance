"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  makeFaceLandmarker,
  blendScore,
  headPose,
  type FaceLandmarkerLike,
} from "./faceLoader";
import { startDub, STEPS, type DubEngine, type LaneName } from "./audio";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

/*
 * 1305 · FACE DESK
 *
 * What if your FACE were the mixing desk? A steady 124 BPM dub-techno groove runs
 * on a 16-step transport — four-on-the-floor kick, a rolling filtered dub bass,
 * closed hats, and a minor-9th chord stab thrown into a ping-pong delay. You play
 * it with no mouse, no keyboard, only your face, tracked by the webcam through
 * MediaPipe FaceLandmarker v2's 52 ARKit blendshapes:
 *
 *   jawOpen   → opens the global low-pass (the sound blooms open) AND, crossing
 *               ~0.5, throws a dub echo off into the distance.
 *   brow raise→ build/intensity: more layers enter (hats, then the stab); lower
 *               strips back to just kick + bass.
 *   head yaw  → pans the stab left/right and feeds the ping-pong feedback.
 *   blink     → a quantised beat-stutter / retrigger, on the grid.
 *   smile     → harmonic brightness: a high shelf opens and the chord voicing
 *               gains its upper ninth.
 *
 * A browser-native descendant of Zach Lieberman & Kyle McDonald's FaceOSC /
 * ofxFaceTracker (and Lieberman's "Más Que la Cara"). Degrades gracefully: if the
 * camera is denied or the CDN fails, the groove keeps playing and your MOUSE — Y
 * for jaw, X for build — stands in for the face.
 */

const JAW_THROW = 0.5; // jawOpen crossing this fires a dub throw
const BLINK_ON = 0.5; // both eyeBlink scores above this = eyes closed
const BLINK_COOLDOWN = 0.42; // seconds between stutters
const SMOOTH = 0.22; // one-pole smoothing factor

type CamState = "off" | "loading" | "on" | "denied" | "unavailable";

interface Ctrl {
  jaw: number;
  build: number;
  smile: number;
  yaw: number; // -1..1
}

interface FacePt {
  x: number;
  y: number;
}

// Which lanes to show as VU meters, and their console colours.
const METERS: { lane: LaneName; label: string; rgb: [number, number, number] }[] = [
  { lane: "kick", label: "KICK", rgb: [244, 63, 94] }, // rose
  { lane: "bass", label: "BASS", rgb: [167, 139, 250] }, // violet
  { lane: "hat", label: "HAT", rgb: [56, 189, 248] }, // sky
  { lane: "stab", label: "STAB", rgb: [251, 191, 36] }, // amber
];

// The four face faders, drawn as a mixing-desk channel strip.
const FADERS: { key: keyof Ctrl; label: string; sub: string; rgb: [number, number, number]; bipolar?: boolean }[] = [
  { key: "jaw", label: "JAW", sub: "cutoff / throw", rgb: [244, 63, 94] },
  { key: "build", label: "BROW", sub: "build", rgb: [167, 139, 250] },
  { key: "smile", label: "SMILE", sub: "brightness", rgb: [251, 191, 36] },
  { key: "yaw", label: "HEAD", sub: "pan / feedback", rgb: [56, 189, 248], bipolar: true },
];

export default function FaceDeskPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const engineRef = useRef<DubEngine | null>(null);
  const landmarkerRef = useRef<FaceLandmarkerLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const reducedRef = useRef(false);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const camOnRef = useRef(false);
  const lastTsRef = useRef(0);
  const lastFrameRef = useRef(0);

  // control state
  const rawRef = useRef<Ctrl>({ jaw: 0, build: 0.35, smile: 0, yaw: 0 });
  const ctrlRef = useRef<Ctrl>({ jaw: 0, build: 0.35, smile: 0, yaw: 0 });
  const jawOpenRef = useRef(false); // rising-edge latch for the throw
  const blinkClosedRef = useRef(false);
  const lastBlinkRef = useRef(0);
  const blinkFlashRef = useRef(0); // 0..1 visual flash decay
  const throwFlashRef = useRef(0);
  const faceRef = useRef<FacePt[]>([]); // a few landmark dots for the thumbnail
  const faceSeenRef = useRef(false);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  const [phase, setPhase] = useState<"idle" | "playing">("idle");
  const [camState, setCamState] = useState<CamState>("off");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── the render + tracking loop (alive from mount) ─────────────────────────
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

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height))),
      };
    };
    window.addEventListener("pointermove", onMove);

    // Read the face (or the mouse fallback) and set the RAW control targets.
    const detect = () => {
      const eng = engineRef.current;
      const lm = landmarkerRef.current;
      const video = videoRef.current;

      // Fallback: no camera → mouse Y = jaw, mouse X = build.
      if (!lm || !video || !camOnRef.current) {
        faceSeenRef.current = false;
        faceRef.current = [];
        const m = mouseRef.current;
        rawRef.current.jaw = 1 - m.y;
        rawRef.current.build = m.x;
        rawRef.current.smile = 0;
        rawRef.current.yaw = (m.x - 0.5) * 2;
        applyThrowEdge(eng, rawRef.current.jaw);
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

      const hasFace = (res.faceBlendshapes?.[0]?.categories?.length ?? 0) > 0;
      faceSeenRef.current = hasFace;
      if (!hasFace) return;

      const jaw = blendScore(res, "jawOpen");
      const browIn = blendScore(res, "browInnerUp");
      const browL = blendScore(res, "browOuterUpLeft");
      const browR = blendScore(res, "browOuterUpRight");
      const brow = Math.min(1, (browIn + browL + browR) / 2.2);
      const smile = Math.min(
        1,
        (blendScore(res, "mouthSmileLeft") + blendScore(res, "mouthSmileRight")) / 1.4,
      );
      const blinkL = blendScore(res, "eyeBlinkLeft");
      const blinkR = blendScore(res, "eyeBlinkRight");
      const { yaw } = headPose(res);

      rawRef.current.jaw = jaw;
      rawRef.current.build = brow;
      rawRef.current.smile = smile;
      rawRef.current.yaw = Math.max(-1, Math.min(1, yaw / 0.55));

      applyThrowEdge(eng, jaw);

      // deliberate blink → quantised stutter (both eyes, debounced + cooldown)
      const bothClosed = blinkL > BLINK_ON && blinkR > BLINK_ON;
      const nowS = performance.now() / 1000;
      if (bothClosed && !blinkClosedRef.current) {
        if (nowS - lastBlinkRef.current > BLINK_COOLDOWN) {
          lastBlinkRef.current = nowS;
          blinkFlashRef.current = 1;
          eng?.stutter();
        }
      }
      blinkClosedRef.current = bothClosed;

      // a sparse set of landmark dots for the thumbnail (eyes, brows, mouth, nose)
      const idx = [1, 33, 133, 263, 362, 61, 291, 13, 14, 70, 300, 152];
      const pts: FacePt[] = [];
      const lms = res.faceLandmarks?.[0];
      if (lms) {
        for (const i of idx) {
          const p = lms[i];
          if (p) pts.push({ x: 1 - p.x, y: p.y }); // mirror X
        }
      }
      faceRef.current = pts;
    };

    // jawOpen crossing JAW_THROW upward → one dub throw.
    const applyThrowEdge = (eng: DubEngine | null, jaw: number) => {
      const open = jaw > JAW_THROW;
      if (open && !jawOpenRef.current && eng) {
        eng.throwDelay();
        throwFlashRef.current = 1;
      }
      jawOpenRef.current = open;
    };

    // one-pole smoothing of raw → displayed/audible control
    const applySmoothing = (dt: number) => {
      const a = 1 - Math.pow(1 - SMOOTH, dt * 60);
      const c = ctrlRef.current;
      const r = rawRef.current;
      c.jaw += (r.jaw - c.jaw) * a;
      c.build += (r.build - c.build) * a;
      c.smile += (r.smile - c.smile) * a;
      c.yaw += (r.yaw - c.yaw) * a;
      const eng = engineRef.current;
      if (eng) {
        eng.setCutoff(c.jaw);
        eng.setBuild(c.build);
        eng.setBright(c.smile);
        eng.setPan(c.yaw);
      }
      blinkFlashRef.current = Math.max(0, blinkFlashRef.current - dt * 3.2);
      throwFlashRef.current = Math.max(0, throwFlashRef.current - dt * 2.2);
    };

    // ── drawing ──────────────────────────────────────────────────────────
    const drawGrille = (w: number, h: number) => {
      ctx.fillStyle = "#07060d";
      ctx.fillRect(0, 0, w, h);
      // faint vertical rack lines
      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 42) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
    };

    const drawFaders = (x: number, y: number, w: number, h: number) => {
      const c = ctrlRef.current;
      const n = FADERS.length;
      const gap = w / n;
      for (let i = 0; i < n; i++) {
        const f = FADERS[i];
        const cx = x + gap * (i + 0.5);
        const trackTop = y + 34;
        const trackH = h - 74;
        const [r, g, b] = f.rgb;
        // track
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(cx - 4, trackTop, 8, trackH);
        // value 0..1 (bipolar centred)
        const raw = c[f.key];
        const v = f.bipolar ? (raw + 1) / 2 : raw;
        const capY = trackTop + (1 - v) * trackH;
        // fill from bottom (or from centre for bipolar)
        if (f.bipolar) {
          const midY = trackTop + trackH / 2;
          ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
          const top = Math.min(midY, capY);
          const bot = Math.max(midY, capY);
          ctx.fillRect(cx - 4, top, 8, bot - top);
        } else {
          ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
          ctx.fillRect(cx - 4, capY, 8, trackTop + trackH - capY);
        }
        // glowing cap
        const grd = ctx.createRadialGradient(cx, capY, 0, cx, capY, 22);
        grd.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
        grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, capY, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.fillRect(cx - 15, capY - 3, 30, 6);
        // labels
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(${r},${g},${b},0.95)`;
        ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(f.label, cx, y + 20);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "11px ui-monospace, monospace";
        ctx.fillText(f.sub, cx, y + h - 22);
      }
    };

    const drawMeters = (x: number, y: number, w: number, h: number, eng: DubEngine | null) => {
      const n = METERS.length;
      const gap = w / n;
      for (let i = 0; i < n; i++) {
        const m = METERS[i];
        const cx = x + gap * (i + 0.5);
        const level = eng ? eng.laneFlash(m.lane) : 0;
        const [r, g, b] = m.rgb;
        const barH = h - 24;
        const top = y;
        // ghost
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(cx - 12, top, 24, barH);
        // lit
        const litH = barH * level;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.4 + level * 0.6})`;
        ctx.fillRect(cx - 12, top + barH - litH, 24, litH);
        ctx.textAlign = "center";
        ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
        ctx.font = "11px ui-monospace, monospace";
        ctx.fillText(m.label, cx, y + h - 6);
      }
    };

    const drawSteps = (x: number, y: number, w: number, playPos: number, build: number) => {
      const cell = w / STEPS;
      for (let s = 0; s < STEPS; s++) {
        const sx = x + s * cell;
        const beat = s % 4 === 0;
        const active = build > 0.58 && (s === 6 || s === 14 || (build > 0.8 && s === 10));
        ctx.fillStyle = beat
          ? "rgba(244,63,94,0.35)"
          : active
            ? "rgba(251,191,36,0.28)"
            : "rgba(255,255,255,0.08)";
        ctx.fillRect(sx + 2, y, cell - 4, 10);
      }
      // sweep head
      const hx = x + (playPos / STEPS) * w;
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(hx - 1.5, y - 4, 3, 18);
    };

    const drawPanNeedle = (cx: number, cy: number, rad: number, yaw: number) => {
      // arc gauge from -1..1
      ctx.strokeStyle = "rgba(56,189,248,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, Math.PI * 0.85, Math.PI * 0.15, true);
      ctx.stroke();
      const ang = Math.PI * 0.85 + ((yaw + 1) / 2) * (Math.PI * 1.3);
      const nx = cx + Math.cos(ang) * rad;
      const ny = cy + Math.sin(ang) * rad;
      ctx.strokeStyle = "rgba(125,211,252,0.95)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText("PAN", cx, cy + 16);
    };

    const drawThumb = (x: number, y: number, w: number, h: number) => {
      const video = videoRef.current;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      if (camOnRef.current && video && video.videoWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        // mirror the video
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
        // landmark dots (already mirrored in face coords)
        ctx.fillStyle = "rgba(167,139,250,0.95)";
        for (const p of faceRef.current) {
          ctx.beginPath();
          ctx.arc(x + p.x * w, y + p.y * h, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (!faceSeenRef.current) {
          ctx.fillStyle = "rgba(253,164,175,0.95)";
          ctx.font = "11px ui-monospace, monospace";
          ctx.textAlign = "center";
          ctx.fillText("no face", x + w / 2, y + h / 2);
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "11px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("mouse mode", x + w / 2, y + h / 2);
      }
      ctx.restore();
    };

    const draw = (playPos: number) => {
      const { w, h, dpr } = sizeRef.current;
      const eng = engineRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawGrille(w, h);

      // blink flash (soft, reduced-motion aware — a gentle wash, never a strobe)
      const bf = blinkFlashRef.current;
      if (bf > 0.01) {
        ctx.fillStyle = `rgba(167,139,250,${bf * (reducedRef.current ? 0.1 : 0.22)})`;
        ctx.fillRect(0, 0, w, h);
      }

      const pad = Math.max(16, w * 0.04);
      const colW = Math.min(520, w - pad * 2);
      const colX = pad;

      // faders panel (top block)
      const faderH = Math.min(h * 0.5, 320);
      drawFaders(colX, pad + 30, colW, faderH);

      // step sequencer strip
      drawSteps(colX, pad + 40 + faderH, colW, playPos, eng ? eng.getBuild() : ctrlRef.current.build);

      // VU meters (right side or below)
      const meterY = pad + 70 + faderH;
      drawMeters(colX, meterY, Math.min(360, colW), Math.min(140, h - meterY - 40), eng);

      // pan gauge + throw indicator (upper right)
      const gx = w - pad - 70;
      const gy = pad + 70;
      drawPanNeedle(gx, gy, 46, ctrlRef.current.yaw);
      if (throwFlashRef.current > 0.01) {
        ctx.fillStyle = `rgba(244,63,94,${throwFlashRef.current})`;
        ctx.font = "700 13px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("THROW", gx, gy - 62);
      }

      // webcam thumbnail (lower right)
      const tw = Math.min(180, w * 0.28);
      const th = tw * 0.72;
      drawThumb(w - pad - tw, h - pad - th, tw, th);
    };

    const frame = (now: number) => {
      const dt = lastFrameRef.current ? Math.min(0.05, (now - lastFrameRef.current) / 1000) : 0.016;
      lastFrameRef.current = now;

      detect();
      applySmoothing(dt);

      const eng = engineRef.current;
      const playPos = eng ? eng.loopPosition() : (now / 1000 / (60 / 124 / 4)) % STEPS;
      draw(playPos);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
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

  // ── gesture-gated audio + camera ──────────────────────────────────────────
  const begin = useCallback(async () => {
    if (engineRef.current) {
      setPhase("playing");
    } else {
      try {
        const eng = await startDub();
        engineRef.current = eng;
        setPhase("playing");
      } catch {
        setNotice("Audio could not start in this browser. Try tapping again or reloading.");
        return;
      }
    }
    // now try the camera — the groove already plays even if this fails
    if (camOnRef.current || camState === "loading") return;
    const video = videoRef.current;
    if (!video) return;
    setCamState("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      const lm = await makeFaceLandmarker();
      landmarkerRef.current = lm;
      camOnRef.current = true;
      setCamState("on");
      setNotice(null);
    } catch (err) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamState("denied");
        setNotice(
          "Camera unavailable — this instrument wants your webcam. The groove plays on; use your MOUSE (Y = jaw, X = build) as a stand-in.",
        );
      } else {
        setCamState("unavailable");
        setNotice(
          "Face tracking could not load here (camera or CDN). The groove plays on; use your MOUSE (Y = jaw, X = build) as a stand-in.",
        );
      }
    }
  }, [camState]);

  const onCanvasClick = useCallback(() => {
    // in mouse-fallback mode a click = a stutter, so the page is fully playable
    if (phase === "playing" && !camOnRef.current) {
      engineRef.current?.stutter();
      blinkFlashRef.current = 1;
    }
  }, [phase]);

  return (
    <div ref={wrapRef} className="relative h-dvh w-full overflow-hidden bg-[#07060d] text-white">
      <canvas ref={canvasRef} onClick={onCanvasClick} className="absolute inset-0 block" />
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
        <h1 className="text-2xl font-semibold tracking-tight text-white">Face Desk</h1>
        <p className="mt-1 text-base text-white/75">
          Your face is the mixing desk. Play a live dub-techno groove with your jaw, brows,
          head-tilt and blinks — no mouse, no keyboard.
        </p>
      </div>

      {/* primary controls */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-3 px-4">
        {notice && <p className="max-w-md text-center text-base text-rose-300">{notice}</p>}

        {phase === "idle" ? (
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-violet-500/90 px-5 py-2.5 text-base font-semibold text-white shadow-[0_0_30px_rgba(139,92,246,0.55)] hover:bg-violet-400"
          >
            Start — enable camera + sound
          </button>
        ) : camState === "on" ? (
          <p className="max-w-lg text-center text-base text-white/75">
            <span className="text-violet-300">Live.</span> Open your jaw to bloom + throw an echo ·
            raise your brows to build · turn your head to pan · blink to stutter · smile to brighten.
          </p>
        ) : camState === "loading" ? (
          <p className="text-base text-white/75">Starting camera…</p>
        ) : (
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-cyan-500/90 px-4 py-2.5 text-base font-semibold text-white shadow-[0_0_30px_rgba(34,211,238,0.5)] hover:bg-cyan-400"
          >
            Retry camera
          </button>
        )}
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-[#0a0812] p-6 text-base text-white/85">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p className="mt-3">
              A steady 124 BPM dub-techno transport runs a 16-step machine — four-on-the-floor
              kick, a rolling filtered dub bass, closed hats, and a minor-9th chord stab thrown into
              a ping-pong delay, all pure Web Audio through a global low-pass and a limiter. It is a
              played, pulsing groove with real TIME, not a drone.
            </p>
            <p className="mt-3">
              MediaPipe FaceLandmarker v2 reads 52 ARKit blendshapes each frame.{" "}
              <span className="text-white">jawOpen</span> opens the low-pass and, crossing a
              threshold, throws a dub echo; <span className="text-white">brow raise</span> builds
              layers in; <span className="text-white">head yaw</span> pans the stab and drives the
              feedback; a deliberate <span className="text-white">blink</span> fires a quantised
              beat-stutter; a <span className="text-white">smile</span> lifts a high shelf and the
              brighter voicing. Every control is one-pole smoothed; the blink is debounced with a
              cooldown so a natural blink doesn&apos;t fire.
            </p>
            <p className="mt-3 text-white/70">
              Lineage: Zach Lieberman &amp; Kyle McDonald&apos;s{" "}
              <span className="text-violet-300">FaceOSC / ofxFaceTracker</span> and Lieberman&apos;s
              <em> Más Que la Cara</em> — face-driven AV performance, now browser-native via
              blendshapes. If the camera is denied or the CDN fails, the groove keeps playing and
              your mouse (Y = jaw, X = build, click = stutter) stands in.
            </p>
            <p className="mt-3 text-white/70">
              What worked: jawOpen→cutoff+throw is instantly legible — the sound blooms with your
              mouth. What&apos;s next: per-user blendshape calibration (rest-pose subtraction) and a
              second face for duets.
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
