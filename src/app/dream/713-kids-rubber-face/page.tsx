"use client";
import { useRef, useEffect, useState } from "react";

/* =========================================================================
   713 — KIDS RUBBER FACE
   Grab a giant googly face with a finger and SCULPT a silly voice.
   Deformations of the face drive a source-filter / formant ("vowel") synth.
   No microphone — the voice is shaped entirely by how you squish the face.

   Mapping:
     NOSE pulled up/down  -> fundamental pitch (slide-whistle, ~120..500 Hz)
     MOUTH wide vs tall   -> morph formants between vowels  ooo<->aaa<->eee
     CHEEKS squished in    -> lowpass "wah" cutoff wobble
     EARS / EYES pulled    -> vibrato depth + goofy warble
   Release -> springs back (boing) and the voice glides to neutral whisper.
   ========================================================================= */

// Vowel formant tables (F1, F2, F3 in Hz). Friendly, child-pitched.
//        ooo            aaa            eee
const VOWEL_OOO = [320, 800, 2400];
const VOWEL_AAA = [760, 1150, 2700];
const VOWEL_EEE = [300, 2300, 3000];

// Feature handle ids
type Feature = "nose" | "mouth" | "leftCheek" | "rightCheek" | "leftEar" | "rightEar";

interface Handle {
  // rest position (fraction of canvas: 0..1)
  rx: number;
  ry: number;
  // current displacement from rest (px)
  dx: number;
  dy: number;
  // spring velocity (px/frame)
  vx: number;
  vy: number;
  feature: Feature;
  grabRadius: number; // px hit radius
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export default function KidsRubberFace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef = useRef<AudioContext | null>(null);

  // audio graph refs
  const masterRef = useRef<GainNode | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const vibOscRef = useRef<OscillatorNode | null>(null);
  const vibGainRef = useRef<GainNode | null>(null);
  const formantsRef = useRef<{ filt: BiquadFilterNode; amp: GainNode }[]>([]);
  const wahRef = useRef<BiquadFilterNode | null>(null);
  const padOscARef = useRef<OscillatorNode | null>(null);
  const padOscBRef = useRef<OscillatorNode | null>(null);

  const handlesRef = useRef<Handle[]>([]);
  // pointerId -> handle index being dragged
  const grabRef = useRef<Map<number, number>>(new Map());
  const lastTouchRef = useRef<number>(performance.now());
  const autoRef = useRef<boolean>(false);

  const [started, setStarted] = useState(false);
  const [audioOk, setAudioOk] = useState(true);

  // ---- start (inside user gesture for iOS unlock) ----
  const handleStart = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const actx = new Ctor();
      actxRef.current = actx;

      // ---- safe output chain: master -> lowpass -> compressor -> dest ----
      const master = actx.createGain();
      master.gain.value = 0.3;
      const safety = actx.createBiquadFilter();
      safety.type = "lowpass";
      safety.frequency.value = 7500;
      const comp = actx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 6;
      comp.ratio.value = 20;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      master.connect(safety);
      safety.connect(comp);
      comp.connect(actx.destination);
      masterRef.current = master;

      // ---- always-on soft ambient pad ----
      const padGain = actx.createGain();
      padGain.gain.value = 0.05;
      const padFilt = actx.createBiquadFilter();
      padFilt.type = "lowpass";
      padFilt.frequency.value = 700;
      padGain.connect(padFilt);
      padFilt.connect(master);
      const padA = actx.createOscillator();
      padA.type = "sine";
      padA.frequency.value = 110;
      const padB = actx.createOscillator();
      padB.type = "sine";
      padB.frequency.value = 165; // a soft fifth-ish
      const padBGain = actx.createGain();
      padBGain.gain.value = 0.6;
      padA.connect(padGain);
      padB.connect(padBGain);
      padBGain.connect(padGain);
      padA.start();
      padB.start();
      padOscARef.current = padA;
      padOscBRef.current = padB;

      // ---- the VOICE: buzzy glottal source -> formant bank -> wah -> voiceGain ----
      const voiceGain = actx.createGain();
      voiceGain.gain.value = 0.0001; // whisper when nothing held
      const wah = actx.createBiquadFilter();
      wah.type = "lowpass";
      wah.frequency.value = 2400;
      wah.Q.value = 2;
      wah.connect(voiceGain);
      voiceGain.connect(master);
      wahRef.current = wah;
      voiceGainRef.current = voiceGain;

      const osc = actx.createOscillator();
      osc.type = "sawtooth"; // buzzy glottal-ish source
      osc.frequency.value = 220;

      // vibrato LFO on the source pitch
      const vibOsc = actx.createOscillator();
      vibOsc.type = "sine";
      vibOsc.frequency.value = 5.5;
      const vibGain = actx.createGain();
      vibGain.gain.value = 0; // depth in Hz, driven by ears/eyes
      vibOsc.connect(vibGain);
      vibGain.connect(osc.frequency);
      vibOsc.start();
      vibOscRef.current = vibOsc;
      vibGainRef.current = vibGain;

      // 3 parallel bandpass formants
      const formants: { filt: BiquadFilterNode; amp: GainNode }[] = [];
      const baseVowel = VOWEL_AAA;
      const gains = [1.0, 0.7, 0.4];
      for (let i = 0; i < 3; i++) {
        const filt = actx.createBiquadFilter();
        filt.type = "bandpass";
        filt.frequency.value = baseVowel[i];
        filt.Q.value = 8 - i * 1.5;
        const amp = actx.createGain();
        amp.gain.value = gains[i];
        osc.connect(filt);
        filt.connect(amp);
        amp.connect(wah);
        formants.push({ filt, amp });
      }
      formantsRef.current = formants;
      osc.start();
      oscRef.current = osc;

      setAudioOk(actx.state !== "suspended");
      if (actx.state === "suspended") {
        actx.resume().then(
          () => setAudioOk(true),
          () => setAudioOk(false)
        );
      }
      setStarted(true);
    } catch {
      setAudioOk(false);
      setStarted(true); // still show the animating face
    }
  };

  // ---- one tap to retry audio if it didn't unlock ----
  const handleRetryAudio = () => {
    const actx = actxRef.current;
    if (!actx) return;
    actx.resume().then(
      () => setAudioOk(true),
      () => setAudioOk(false)
    );
  };

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let rafId = 0;

    // build the handle set (rest positions as fractions of the face area)
    handlesRef.current = [
      { rx: 0.5, ry: 0.55, dx: 0, dy: 0, vx: 0, vy: 0, feature: "nose", grabRadius: 90 },
      { rx: 0.5, ry: 0.74, dx: 0, dy: 0, vx: 0, vy: 0, feature: "mouth", grabRadius: 120 },
      { rx: 0.26, ry: 0.62, dx: 0, dy: 0, vx: 0, vy: 0, feature: "leftCheek", grabRadius: 80 },
      { rx: 0.74, ry: 0.62, dx: 0, dy: 0, vx: 0, vy: 0, feature: "rightCheek", grabRadius: 80 },
      { rx: 0.12, ry: 0.42, dx: 0, dy: 0, vx: 0, vy: 0, feature: "leftEar", grabRadius: 80 },
      { rx: 0.88, ry: 0.42, dx: 0, dy: 0, vx: 0, vy: 0, feature: "rightEar", grabRadius: 80 },
    ];

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // map handle rest fraction -> pixel position (centered, scaled to fit)
    const faceMetrics = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.42; // head radius
      return { w, h, cx, cy, R };
    };

    const handlePixel = (hd: Handle) => {
      const { cx, cy, R } = faceMetrics();
      // map fraction (0..1 across a 2R box centered on face) to px
      const px = cx + (hd.rx - 0.5) * 2 * R;
      const py = cy + (hd.ry - 0.65) * 2 * R;
      return { px: px + hd.dx, py: py + hd.dy };
    };

    // ---- pointer handling ----
    const findHandle = (px: number, py: number): number => {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < handlesRef.current.length; i++) {
        const { px: hx, py: hy } = handlePixel(handlesRef.current[i]);
        const d = Math.hypot(px - hx, py - hy);
        if (d < handlesRef.current[i].grabRadius && d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      lastTouchRef.current = performance.now();
      autoRef.current = false; // real finger takes over instantly
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const idx = findHandle(px, py);
      if (idx >= 0) {
        grabRef.current.set(e.pointerId, idx);
        canvas.setPointerCapture(e.pointerId);
      }
    };

    const onMove = (e: PointerEvent) => {
      const idx = grabRef.current.get(e.pointerId);
      if (idx === undefined) return;
      lastTouchRef.current = performance.now();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const hd = handlesRef.current[idx];
      const { px: restPx, py: restPy } = (() => {
        const { cx, cy, R } = faceMetrics();
        return {
          px: cx + (hd.rx - 0.5) * 2 * R,
          py: cy + (hd.ry - 0.65) * 2 * R,
        };
      })();
      // limit drag so it stays comically rubbery but bounded
      const maxStretch = faceMetrics().R * 0.9;
      let ndx = px - restPx;
      let ndy = py - restPy;
      const m = Math.hypot(ndx, ndy);
      if (m > maxStretch) {
        ndx = (ndx / m) * maxStretch;
        ndy = (ndy / m) * maxStretch;
      }
      hd.dx = ndx;
      hd.dy = ndy;
      hd.vx = 0;
      hd.vy = 0;
    };

    const onUp = (e: PointerEvent) => {
      if (grabRef.current.has(e.pointerId)) {
        grabRef.current.delete(e.pointerId);
        lastTouchRef.current = performance.now();
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ---- audio param smoothing helpers ----
    const setVoiceParams = (held: boolean, nowt: number) => {
      const actx = actxRef.current;
      if (!actx) return;
      const osc = oscRef.current;
      const voiceGain = voiceGainRef.current;
      const wah = wahRef.current;
      const vibGain = vibGainRef.current;
      const formants = formantsRef.current;
      if (!osc || !voiceGain || !wah || !vibGain || formants.length < 3) return;

      const { R } = faceMetrics();
      const nose = handlesRef.current[0];
      const mouth = handlesRef.current[1];
      const lCheek = handlesRef.current[2];
      const rCheek = handlesRef.current[3];
      const lEar = handlesRef.current[4];
      const rEar = handlesRef.current[5];

      // NOSE vertical -> pitch (up = higher). dy<0 is up.
      const noseN = clamp(-nose.dy / (R * 0.9), -1, 1); // -1..1
      let freq = lerp(120, 500, (noseN + 1) / 2);
      // loose friendly snap toward a pentatonic-ish set so it never sounds harsh
      const friendly = [131, 165, 196, 262, 330, 392, 523];
      let nearest = friendly[0];
      let nd = Infinity;
      for (const f of friendly) {
        const d = Math.abs(f - freq);
        if (d < nd) {
          nd = d;
          nearest = f;
        }
      }
      freq = lerp(freq, nearest, 0.4); // loose snap
      osc.frequency.setTargetAtTime(freq, nowt, 0.04);

      // MOUTH wide-vs-tall -> vowel morph.
      // mouth dragged sideways (|dx| big) -> eee ; dragged down (dy big) -> aaa ; neutral -> ooo
      const wide = clamp(Math.abs(mouth.dx) / (R * 0.7), 0, 1);
      const tall = clamp(mouth.dy / (R * 0.7), 0, 1); // pulling down opens "aaa"
      // blend: start ooo, add aaa with tall, add eee with wide
      const wOoo = clamp(1 - wide - tall, 0, 1);
      const total = wOoo + tall + wide + 0.0001;
      for (let i = 0; i < 3; i++) {
        const f =
          (VOWEL_OOO[i] * wOoo + VOWEL_AAA[i] * tall + VOWEL_EEE[i] * wide) / total;
        formants[i].filt.frequency.setTargetAtTime(f, nowt, 0.05);
      }

      // CHEEKS squished IN -> wah cutoff wobble. squish = dragged toward center.
      const lIn = clamp(lCheek.dx / (R * 0.6), 0, 1); // right-drag = inward for left cheek
      const rIn = clamp(-rCheek.dx / (R * 0.6), 0, 1); // left-drag = inward for right cheek
      const squish = clamp(lIn + rIn, 0, 1);
      const wob = Math.sin(nowt * 9) * squish * 900;
      const cutoff = clamp(2400 - squish * 1600 + wob, 350, 3200);
      wah.frequency.setTargetAtTime(cutoff, nowt, 0.02);
      wah.Q.setTargetAtTime(2 + squish * 6, nowt, 0.05);

      // EARS / EYES pulled -> vibrato depth + warble
      const earPull =
        clamp(Math.hypot(lEar.dx, lEar.dy) / (R * 0.8), 0, 1) +
        clamp(Math.hypot(rEar.dx, rEar.dy) / (R * 0.8), 0, 1);
      const vibDepth = clamp(earPull, 0, 2) * 18; // Hz of pitch wobble
      vibGain.gain.setTargetAtTime(vibDepth, nowt, 0.05);

      // VOICE level: loud while held, whisper when idle
      voiceGain.gain.setTargetAtTime(held ? 0.42 : 0.0008, nowt, held ? 0.03 : 0.25);
    };

    // ---- auto-demo: a ghost finger drives handles when idle ----
    const runAutoDemo = (t: number) => {
      const ghostT = t / 1000;
      const { R } = faceMetrics();
      // gently swirl nose (pitch) and mouth (vowel) and one cheek
      const nose = handlesRef.current[0];
      const mouth = handlesRef.current[1];
      const lEar = handlesRef.current[4];
      nose.dx = 0;
      nose.dy = Math.sin(ghostT * 0.8) * R * 0.45;
      mouth.dx = Math.sin(ghostT * 0.5 + 1) * R * 0.4;
      mouth.dy = Math.max(0, Math.sin(ghostT * 0.4)) * R * 0.4;
      lEar.dx = Math.sin(ghostT * 1.3) * R * 0.2;
      lEar.dy = Math.cos(ghostT * 1.3) * R * 0.2;
      nose.vx = nose.vy = 0;
      mouth.vx = mouth.vy = 0;
      lEar.vx = lEar.vy = 0;
    };

    // ---- spring back released handles (verlet-ish) ----
    const springHandles = (grabbed: Set<number>) => {
      const k = 0.18; // stiffness
      const damp = 0.74; // damping -> slight boing
      for (let i = 0; i < handlesRef.current.length; i++) {
        if (grabbed.has(i)) continue;
        if (autoRef.current) continue; // auto-demo writes positions directly
        const hd = handlesRef.current[i];
        hd.vx += -hd.dx * k;
        hd.vy += -hd.dy * k;
        hd.vx *= damp;
        hd.vy *= damp;
        hd.dx += hd.vx;
        hd.dy += hd.vy;
      }
    };

    // ===================== DRAW =====================
    const drawEye = (
      cx: number,
      cy: number,
      r: number,
      lookX: number,
      lookY: number
    ) => {
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#1a1030";
      ctx.stroke();
      // pupil follows the wobble a bit
      const pr = r * 0.45;
      ctx.beginPath();
      ctx.fillStyle = "#1a1030";
      ctx.arc(cx + lookX * r * 0.4, cy + lookY * r * 0.4, pr, 0, Math.PI * 2);
      ctx.fill();
      // sparkle
      ctx.beginPath();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.arc(cx + lookX * r * 0.4 - pr * 0.3, cy + lookY * r * 0.4 - pr * 0.3, pr * 0.3, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawFace = (t: number) => {
      const { w, h, cx, cy, R } = faceMetrics();
      // background
      ctx.fillStyle = "#0b0420";
      ctx.fillRect(0, 0, w, h);
      // soft radial glow
      const bg = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.8);
      bg.addColorStop(0, "rgba(80,30,120,0.45)");
      bg.addColorStop(1, "rgba(11,4,32,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const breathe = 1 + Math.sin(t / 700) * 0.012;

      const nose = handlePixel(handlesRef.current[0]);
      const mouth = handlePixel(handlesRef.current[1]);
      const lCheek = handlePixel(handlesRef.current[2]);
      const rCheek = handlePixel(handlesRef.current[3]);
      const lEar = handlePixel(handlesRef.current[4]);
      const rEar = handlePixel(handlesRef.current[5]);

      // ---- EARS (behind head) ----
      for (const ear of [lEar, rEar]) {
        ctx.beginPath();
        ctx.fillStyle = "#ff9f1c";
        ctx.ellipse(ear.px, ear.py, R * 0.22, R * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- HEAD ----
      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = "#ffd23f";
      ctx.ellipse(cx, cy, R * breathe, R * 1.06 * breathe, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#e08a00";
      ctx.stroke();
      ctx.restore();

      // ---- CHEEKS (rosy circles, move with handles) ----
      for (const ck of [lCheek, rCheek]) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,90,120,0.75)";
        ctx.ellipse(ck.px, ck.py, R * 0.18, R * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- EYES ----
      const lookX = clamp(nose.px - cx, -R, R) / R;
      const lookY = clamp(nose.py - cy, -R, R) / R;
      drawEye(cx - R * 0.34, cy - R * 0.18, R * 0.2, lookX, lookY);
      drawEye(cx + R * 0.34, cy - R * 0.18, R * 0.2, lookX, lookY);

      // ---- NOSE (a big squishy ball; stretches a rubber band from rest) ----
      const noseRest = { px: cx, py: cy + (handlesRef.current[0].ry - 0.65) * 2 * R };
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 6;
      ctx.moveTo(noseRest.px, noseRest.py);
      ctx.lineTo(nose.px, nose.py);
      ctx.stroke();
      ctx.beginPath();
      const ng = ctx.createRadialGradient(
        nose.px - 8,
        nose.py - 8,
        4,
        nose.px,
        nose.py,
        R * 0.2
      );
      ng.addColorStop(0, "#ff8a5c");
      ng.addColorStop(1, "#e0392b");
      ctx.fillStyle = ng;
      ctx.ellipse(nose.px, nose.py, R * 0.16, R * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      // ---- MOUTH (deforms wide vs tall) ----
      const mw = R * 0.4 + Math.abs(handlesRef.current[1].dx) * 0.9;
      const mh = R * 0.12 + Math.max(0, handlesRef.current[1].dy) * 1.0;
      ctx.beginPath();
      ctx.fillStyle = "#7a1030";
      ctx.ellipse(mouth.px, mouth.py, mw, mh, 0, 0, Math.PI * 2);
      ctx.fill();
      // tongue
      ctx.beginPath();
      ctx.fillStyle = "#ff5a78";
      ctx.ellipse(mouth.px, mouth.py + mh * 0.4, mw * 0.6, mh * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // ---- grab hint rings on handles (subtle) ----
      const handles = handlesRef.current;
      const pts = [nose, mouth, lCheek, rCheek, lEar, rEar];
      for (let i = 0; i < handles.length; i++) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.arc(pts[i].px, pts[i].py, handles[i].grabRadius * 0.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ---- ghost finger during auto-demo ----
      if (autoRef.current) {
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.arc(nose.px, nose.py, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 3;
        ctx.arc(nose.px, nose.py, 28 + Math.sin(t / 200) * 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    // ===================== LOOP =====================
    const loop = (t: number) => {
      const actx = actxRef.current;
      const grabbedIdx = new Set<number>(grabRef.current.values());
      const anyHeld = grabbedIdx.size > 0;

      // idle -> enter auto-demo after 2.5s
      if (!anyHeld && performance.now() - lastTouchRef.current > 2500) {
        autoRef.current = true;
      }
      if (autoRef.current && !anyHeld) {
        runAutoDemo(t);
      }

      springHandles(grabbedIdx);
      drawFace(t);

      if (actx) {
        const held = anyHeld || autoRef.current;
        setVoiceParams(held, actx.currentTime);
      }

      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    // ===================== TEARDOWN =====================
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      try {
        oscRef.current?.stop();
        vibOscRef.current?.stop();
        padOscARef.current?.stop();
        padOscBRef.current?.stop();
      } catch {
        /* already stopped */
      }
      oscRef.current?.disconnect();
      vibOscRef.current?.disconnect();
      vibGainRef.current?.disconnect();
      wahRef.current?.disconnect();
      voiceGainRef.current?.disconnect();
      padOscARef.current?.disconnect();
      padOscBRef.current?.disconnect();
      formantsRef.current.forEach((f: { filt: BiquadFilterNode; amp: GainNode }) => {
        f.filt.disconnect();
        f.amp.disconnect();
      });
      masterRef.current?.disconnect();
      const actx = actxRef.current;
      if (actx && actx.state !== "closed") {
        actx.close().catch(() => {});
      }
      actxRef.current = null;
    };
  }, [started]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#0b0420] text-white select-none touch-none">
      {!started ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            Rubber Face Sing-Along
          </h1>
          <p className="max-w-md text-base text-white/95">
            Grab the silly face and pull its nose, stretch its mouth, and squish
            its cheeks. The face sings whatever shape you make!
          </p>
          <button
            onPointerDown={handleStart}
            className="min-h-[64px] rounded-3xl bg-gradient-to-b from-amber-300 to-orange-500 px-10 py-5 text-xl font-extrabold text-[#3a1500] shadow-lg active:scale-95"
          >
            Wake the face!
          </button>
          <p className="text-base text-white/75">No reading needed — just touch and play.</p>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {!audioOk && (
            <button
              onPointerDown={handleRetryAudio}
              className="absolute left-1/2 top-6 -translate-x-1/2 rounded-2xl bg-black/60 px-5 py-3 text-base text-rose-300"
            >
              Tap once more to turn on the sound
            </button>
          )}
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-base text-white/75">
            Pull the nose to sing high or low — stretch the mouth for silly vowels
          </div>
          <span className="pointer-events-none absolute bottom-3 right-4 font-mono text-base text-white/55">
            713
          </span>
        </>
      )}
    </main>
  );
}
