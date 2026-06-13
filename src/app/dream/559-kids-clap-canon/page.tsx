"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  buildAudioEngine,
  makeOnsetDetector,
  checkOnset,
  makePhaseCanon,
  setPattern,
  startCanon,
  stopCanon,
  quantizeOnsets,
  type AudioEngine,
  type OnsetDetector,
  type PhaseCanon,
} from "./audio";

// ─── constants ──────────────────────────────────────────────────────────────
const CHAR_A_COLOR = "#c084fc"; // violet
const CHAR_B_COLOR = "#f97316"; // amber-orange
const BG = "#06060a";
const AUTO_DEMO_RESUME_S = 4.0;

// Default loop duration for visual demo (matches audio.ts DEFAULT_CLAP_PATTERN sum)
const DEFAULT_LOOP_DUR = 2.24; // 0.28+0.28+0.56+0.28+0.28+0.56

// Fraction: voice B completes loops this much faster
const PHASE_DRIFT = 0.018;

// ─── SVG helpers (named make*/build* — not hooks) ──────────────────────────

// Ensure <defs> exists in svg, returning it
function ensureDefs(svg: SVGSVGElement): SVGDefsElement {
  const existing = svg.querySelector("defs");
  if (existing) return existing as SVGDefsElement;
  const ns = "http://www.w3.org/2000/svg";
  const defs = document.createElementNS(ns, "defs") as SVGDefsElement;
  svg.insertBefore(defs, svg.firstChild);
  return defs;
}

// Build a cute SVG blob character with eyes + hands
function buildCharSVG(
  svg: SVGSVGElement,
  cx: number,
  cy: number,
  baseR: number,
  fillColor: string,
  glowColor: string,
  idSuffix: string
): void {
  const ns = "http://www.w3.org/2000/svg";
  const defs = ensureDefs(svg);

  // Glow filter (soft outer glow via blur+composite)
  const filt = document.createElementNS(ns, "filter") as SVGFilterElement;
  filt.setAttribute("id", `glow-${idSuffix}`);
  filt.setAttribute("x", "-60%");
  filt.setAttribute("y", "-60%");
  filt.setAttribute("width", "220%");
  filt.setAttribute("height", "220%");
  const blur = document.createElementNS(ns, "feGaussianBlur");
  blur.setAttribute("in", "SourceGraphic");
  blur.setAttribute("stdDeviation", "8");
  blur.setAttribute("result", "blurred");
  const merge = document.createElementNS(ns, "feMerge");
  const mergeN1 = document.createElementNS(ns, "feMergeNode");
  mergeN1.setAttribute("in", "blurred");
  const mergeN2 = document.createElementNS(ns, "feMergeNode");
  mergeN2.setAttribute("in", "SourceGraphic");
  merge.appendChild(mergeN1);
  merge.appendChild(mergeN2);
  filt.appendChild(blur);
  filt.appendChild(merge);
  defs.appendChild(filt);

  // Halo blur filter
  const filt2 = document.createElementNS(ns, "filter") as SVGFilterElement;
  filt2.setAttribute("id", `haloF-${idSuffix}`);
  const blur2 = document.createElementNS(ns, "feGaussianBlur");
  blur2.setAttribute("stdDeviation", "16");
  filt2.appendChild(blur2);
  defs.appendChild(filt2);

  // Glow halo behind body
  const halo = document.createElementNS(ns, "ellipse");
  halo.setAttribute("cx", String(cx));
  halo.setAttribute("cy", String(cy + 6));
  halo.setAttribute("rx", String(baseR * 1.15));
  halo.setAttribute("ry", String(baseR * 0.9));
  halo.setAttribute("fill", glowColor);
  halo.setAttribute("opacity", "0.35");
  halo.setAttribute("filter", `url(#haloF-${idSuffix})`);
  halo.setAttribute("id", `halo-${idSuffix}`);
  svg.appendChild(halo);

  // Body blob
  const body = document.createElementNS(ns, "ellipse");
  body.setAttribute("cx", String(cx));
  body.setAttribute("cy", String(cy));
  body.setAttribute("rx", String(baseR));
  body.setAttribute("ry", String(baseR * 0.92));
  body.setAttribute("fill", fillColor);
  body.setAttribute("filter", `url(#glow-${idSuffix})`);
  body.setAttribute("id", `body-${idSuffix}`);
  svg.appendChild(body);

  // Left eye white
  const leye = document.createElementNS(ns, "circle");
  leye.setAttribute("cx", String(cx - baseR * 0.28));
  leye.setAttribute("cy", String(cy - baseR * 0.12));
  leye.setAttribute("r", String(baseR * 0.18));
  leye.setAttribute("fill", "white");
  svg.appendChild(leye);

  // Left pupil
  const lpupil = document.createElementNS(ns, "circle");
  lpupil.setAttribute("cx", String(cx - baseR * 0.28 + 2));
  lpupil.setAttribute("cy", String(cy - baseR * 0.12 + 2));
  lpupil.setAttribute("r", String(baseR * 0.09));
  lpupil.setAttribute("fill", "#1a1a2e");
  svg.appendChild(lpupil);

  // Right eye white
  const reye = document.createElementNS(ns, "circle");
  reye.setAttribute("cx", String(cx + baseR * 0.28));
  reye.setAttribute("cy", String(cy - baseR * 0.12));
  reye.setAttribute("r", String(baseR * 0.18));
  reye.setAttribute("fill", "white");
  svg.appendChild(reye);

  // Right pupil
  const rpupil = document.createElementNS(ns, "circle");
  rpupil.setAttribute("cx", String(cx + baseR * 0.28 + 2));
  rpupil.setAttribute("cy", String(cy - baseR * 0.12 + 2));
  rpupil.setAttribute("r", String(baseR * 0.09));
  rpupil.setAttribute("fill", "#1a1a2e");
  svg.appendChild(rpupil);

  // Smile path
  const smileY = cy + baseR * 0.22;
  const smileW = baseR * 0.38;
  const smile = document.createElementNS(ns, "path");
  smile.setAttribute(
    "d",
    `M ${cx - smileW} ${smileY} Q ${cx} ${smileY + baseR * 0.25} ${cx + smileW} ${smileY}`
  );
  smile.setAttribute("fill", "none");
  smile.setAttribute("stroke", "white");
  smile.setAttribute("stroke-width", "2.5");
  smile.setAttribute("stroke-linecap", "round");
  smile.setAttribute("opacity", "0.85");
  svg.appendChild(smile);

  // Left hand
  const handR = baseR * 0.15;
  const handL = document.createElementNS(ns, "circle");
  handL.setAttribute("cx", String(cx - baseR * 1.05));
  handL.setAttribute("cy", String(cy + baseR * 0.5));
  handL.setAttribute("r", String(handR));
  handL.setAttribute("fill", fillColor);
  handL.setAttribute("opacity", "0.92");
  handL.setAttribute("id", `handL-${idSuffix}`);
  svg.appendChild(handL);

  // Right hand
  const handREl = document.createElementNS(ns, "circle");
  handREl.setAttribute("cx", String(cx + baseR * 1.05));
  handREl.setAttribute("cy", String(cy + baseR * 0.5));
  handREl.setAttribute("r", String(handR));
  handREl.setAttribute("fill", fillColor);
  handREl.setAttribute("opacity", "0.92");
  handREl.setAttribute("id", `handR-${idSuffix}`);
  svg.appendChild(handREl);
}

// Draw the phase wheel (ring + ticks + dots)
function buildPhaseWheelSVG(svg: SVGSVGElement, cx: number, cy: number, r: number): void {
  const ns = "http://www.w3.org/2000/svg";

  // Ring track
  const ring = document.createElementNS(ns, "circle");
  ring.setAttribute("cx", String(cx));
  ring.setAttribute("cy", String(cy));
  ring.setAttribute("r", String(r));
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "rgba(255,255,255,0.10)");
  ring.setAttribute("stroke-width", "2.5");
  svg.appendChild(ring);

  // Tick marks
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const inner = r - 6;
    const outer = r + 6;
    const x1 = cx + Math.cos(angle) * inner;
    const y1 = cy + Math.sin(angle) * inner;
    const x2 = cx + Math.cos(angle) * outer;
    const y2 = cy + Math.sin(angle) * outer;
    const tick = document.createElementNS(ns, "line");
    tick.setAttribute("x1", String(x1.toFixed(1)));
    tick.setAttribute("y1", String(y1.toFixed(1)));
    tick.setAttribute("x2", String(x2.toFixed(1)));
    tick.setAttribute("y2", String(y2.toFixed(1)));
    tick.setAttribute("stroke", i === 0 ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)");
    tick.setAttribute("stroke-width", i === 0 ? "2.5" : "1.5");
    svg.appendChild(tick);
  }

  // Center text
  const label = document.createElementNS(ns, "text");
  label.setAttribute("x", String(cx));
  label.setAttribute("y", String(cy + 5));
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("fill", "rgba(255,255,255,0.38)");
  label.setAttribute("font-size", "12");
  label.setAttribute("font-family", "sans-serif");
  label.textContent = "phase";
  svg.appendChild(label);

  // Overlap glow (behind dots, shown at unison)
  const overlap = document.createElementNS(ns, "circle");
  overlap.setAttribute("cx", String(cx));
  overlap.setAttribute("cy", String(cy - r));
  overlap.setAttribute("r", "22");
  overlap.setAttribute("fill", "white");
  overlap.setAttribute("opacity", "0");
  overlap.setAttribute("id", "wheelOverlap");
  svg.appendChild(overlap);

  // Dot A (violet) — voice reference
  const dotA = document.createElementNS(ns, "circle");
  dotA.setAttribute("cx", String(cx));
  dotA.setAttribute("cy", String(cy - r));
  dotA.setAttribute("r", "10");
  dotA.setAttribute("fill", CHAR_A_COLOR);
  dotA.setAttribute("id", "wheelDotA");
  svg.appendChild(dotA);

  // Dot B (amber) — phasing voice
  const dotB = document.createElementNS(ns, "circle");
  dotB.setAttribute("cx", String(cx));
  dotB.setAttribute("cy", String(cy - r));
  dotB.setAttribute("r", "10");
  dotB.setAttribute("fill", CHAR_B_COLOR);
  dotB.setAttribute("id", "wheelDotB");
  svg.appendChild(dotB);
}

// ─── mutable rAF/visual state ─────────────────────────────────────────────
interface VisState {
  angA: number;      // current angle in radians for voice A dot
  angB: number;      // current angle in radians for voice B dot
  omegaA: number;    // rad/s for A
  omegaB: number;    // rad/s for B
  flashA: number;    // 0..1 flash scale for character A, decays
  flashB: number;    // 0..1 flash scale for character B
  onsetTimesMs: number[];        // detected clap timestamps
  recordingActive: boolean;
  recordingTimeoutId: ReturnType<typeof setTimeout> | null;
  lastInteractionTime: number;
  demoMode: boolean;
}

// ─── component ────────────────────────────────────────────────────────────
type AppPhase = "idle" | "permission" | "recording" | "playing";

export default function KidsClapCanon() {
  const [appPhase, setAppPhase] = useState<AppPhase>("idle");
  const [micDenied, setMicDenied] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Watch the phase wheel dance!");
  const [clapCount, setClapCount] = useState(0);

  // Mutable engine refs — never trigger React re-render
  const engineRef = useRef<AudioEngine | null>(null);
  const canonRef = useRef<PhaseCanon | null>(null);
  const onsetRef = useRef<OnsetDetector | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lastFrameRef = useRef<number>(0);
  const appPhaseRef = useRef<AppPhase>("idle");

  // Initial angular velocities for demo mode (no audio context yet)
  const visRef = useRef<VisState>({
    angA: 0,
    angB: 0,
    omegaA: (2 * Math.PI) / DEFAULT_LOOP_DUR,
    omegaB: (2 * Math.PI) / (DEFAULT_LOOP_DUR * (1 - PHASE_DRIFT)),
    flashA: 0,
    flashB: 0,
    onsetTimesMs: [],
    recordingActive: false,
    recordingTimeoutId: null,
    lastInteractionTime: 0,
    demoMode: true,
  });

  // Keep appPhaseRef in sync with state
  useEffect(() => {
    appPhaseRef.current = appPhase;
  }, [appPhase]);

  // ── Canon clap callback (called from setInterval scheduler) ────────────
  const handleCanonClap = useCallback((voice: 0 | 1) => {
    const vs = visRef.current;
    if (voice === 0) vs.flashA = 1;
    else vs.flashB = 1;
  }, []);

  // ── Finish recording: quantize onsets → start canon ───────────────────
  const finishRecording = useCallback(() => {
    const vs = visRef.current;
    if (!vs.recordingActive) return;
    vs.recordingActive = false;

    const engine = engineRef.current;
    const canon = canonRef.current;
    if (!engine || !canon) return;

    const intervals = quantizeOnsets(vs.onsetTimesMs);
    setPattern(canon, intervals);
    startCanon(canon, engine, handleCanonClap);

    // Sync visual angular velocity to actual pattern
    const loopDur = intervals.reduce((s, v) => s + v, 0);
    vs.omegaA = (2 * Math.PI) / loopDur;
    vs.omegaB = (2 * Math.PI) / (loopDur * (1 - PHASE_DRIFT));

    setAppPhase("playing");
    const claps = vs.onsetTimesMs.length;
    const loopS = loopDur.toFixed(1);
    setStatusMsg(
      claps >= 2
        ? `Looping your ${claps}-clap rhythm! Loop = ${loopS}s — watch the dots drift…`
        : `Using default rhythm (${loopS}s) — watch the dots drift!`
    );
  }, [handleCanonClap]);

  // ── rAF draw loop — pure SVG attribute mutation ────────────────────────
  const drawFrame = useCallback(
    (now: number) => {
      const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      const vs = visRef.current;
      const svg = svgRef.current;
      if (!svg) {
        rafRef.current = requestAnimationFrame(drawFrame);
        return;
      }

      // Advance phase angles
      vs.angA = (vs.angA + vs.omegaA * dt) % (2 * Math.PI);
      vs.angB = (vs.angB + vs.omegaB * dt) % (2 * Math.PI);

      // Phase wheel dot positions
      const WCX = 200, WCY = 195, WR = 76;
      const dotA = svg.getElementById("wheelDotA") as SVGCircleElement | null;
      const dotB = svg.getElementById("wheelDotB") as SVGCircleElement | null;
      const overlap = svg.getElementById("wheelOverlap") as SVGCircleElement | null;

      if (dotA) {
        const ax = WCX + Math.cos(vs.angA - Math.PI / 2) * WR;
        const ay = WCY + Math.sin(vs.angA - Math.PI / 2) * WR;
        dotA.setAttribute("cx", ax.toFixed(1));
        dotA.setAttribute("cy", ay.toFixed(1));
      }
      if (dotB) {
        const bx = WCX + Math.cos(vs.angB - Math.PI / 2) * WR;
        const by = WCY + Math.sin(vs.angB - Math.PI / 2) * WR;
        dotB.setAttribute("cx", bx.toFixed(1));
        dotB.setAttribute("cy", by.toFixed(1));
      }

      // Overlap glow when dots are near unison
      if (overlap) {
        const angDiff = Math.abs(
          ((vs.angA - vs.angB + Math.PI) % (2 * Math.PI)) - Math.PI
        );
        const proximity = Math.max(0, 1 - angDiff / (Math.PI * 0.3));
        overlap.setAttribute("opacity", (proximity * 0.6).toFixed(3));
        // Position at approximate midpoint
        const midAng =
          vs.angA +
          (((vs.angB - vs.angA) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / 2;
        const mx = WCX + Math.cos(midAng - Math.PI / 2) * WR;
        const my = WCY + Math.sin(midAng - Math.PI / 2) * WR;
        overlap.setAttribute("cx", mx.toFixed(1));
        overlap.setAttribute("cy", my.toFixed(1));
      }

      // Decay flash values
      vs.flashA = Math.max(0, vs.flashA - dt * 6);
      vs.flashB = Math.max(0, vs.flashB - dt * 6);

      // Character A transform (center at 110, 310)
      const ACX = 110, ACY = 310;
      const BCX = 290, BCY = 310;
      const scaleA = 1 + vs.flashA * 0.3;
      const scaleB = 1 + vs.flashB * 0.3;

      const bodyA = svg.getElementById("body-A") as SVGEllipseElement | null;
      const haloA = svg.getElementById("halo-A") as SVGEllipseElement | null;
      const bodyB = svg.getElementById("body-B") as SVGEllipseElement | null;
      const haloB = svg.getElementById("halo-B") as SVGEllipseElement | null;
      const handLA = svg.getElementById("handL-A") as SVGCircleElement | null;
      const handRA = svg.getElementById("handR-A") as SVGCircleElement | null;
      const handLB = svg.getElementById("handL-B") as SVGCircleElement | null;
      const handRB = svg.getElementById("handR-B") as SVGCircleElement | null;

      if (bodyA) {
        bodyA.setAttribute(
          "transform",
          `translate(${ACX} ${ACY}) scale(${scaleA.toFixed(3)}) translate(${-ACX} ${-ACY})`
        );
        bodyA.setAttribute("opacity", Math.min(1, 0.85 + vs.flashA * 0.3).toFixed(3));
      }
      if (haloA) {
        haloA.setAttribute("opacity", (0.3 + vs.flashA * 0.55).toFixed(3));
      }
      if (bodyB) {
        bodyB.setAttribute(
          "transform",
          `translate(${BCX} ${BCY}) scale(${scaleB.toFixed(3)}) translate(${-BCX} ${-BCY})`
        );
        bodyB.setAttribute("opacity", Math.min(1, 0.85 + vs.flashB * 0.3).toFixed(3));
      }
      if (haloB) {
        haloB.setAttribute("opacity", (0.3 + vs.flashB * 0.55).toFixed(3));
      }

      // Hands clap inward on flash
      if (handLA && handRA) {
        const off = vs.flashA * 8;
        handLA.setAttribute("cx", String(ACX - 47 + off));
        handRA.setAttribute("cx", String(ACX + 47 - off));
      }
      if (handLB && handRB) {
        const off = vs.flashB * 8;
        handLB.setAttribute("cx", String(BCX - 47 + off));
        handRB.setAttribute("cx", String(BCX + 47 - off));
      }

      // Demo auto-trigger character flashes so page is visually alive
      if (vs.demoMode && appPhaseRef.current === "idle") {
        const t = now / 1000;
        // Simulate beat pulses at loopDur rate for A, slightly faster for B
        const beatA = Math.abs(Math.sin(Math.PI * t / (DEFAULT_LOOP_DUR / 2)));
        const beatB = Math.abs(Math.sin(Math.PI * t / (DEFAULT_LOOP_DUR * (1 - PHASE_DRIFT) / 2)));
        if (beatA > 0.97 && vs.flashA < 0.1) vs.flashA = 0.8;
        if (beatB > 0.97 && vs.flashB < 0.1) vs.flashB = 0.8;
      }

      // Onset detection when recording
      if (
        appPhaseRef.current === "recording" &&
        engineRef.current &&
        onsetRef.current
      ) {
        const detected = checkOnset(
          onsetRef.current,
          engineRef.current.analyser,
          engineRef.current.timeDomainBuf
        );
        if (detected) {
          vs.onsetTimesMs.push(performance.now());
          vs.flashA = 1;
          setClapCount(vs.onsetTimesMs.length);
          // Reset recording timeout so we capture more claps
          if (vs.recordingTimeoutId !== null) clearTimeout(vs.recordingTimeoutId);
          const tid = setTimeout(() => finishRecording(), 2000);
          vs.recordingTimeoutId = tid;
        }
      }

      // Resume demo after idle
      if (
        !vs.demoMode &&
        appPhaseRef.current === "idle" &&
        performance.now() - vs.lastInteractionTime > AUTO_DEMO_RESUME_S * 1000
      ) {
        vs.demoMode = true;
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    },
    [finishRecording]
  );

  // ── Build SVG scene on mount ──────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // Wipe and rebuild
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const ns = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(ns, "defs");
    svg.appendChild(defs);

    // Background
    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", "400");
    bg.setAttribute("height", "420");
    bg.setAttribute("fill", BG);
    svg.appendChild(bg);

    // Phase wheel
    buildPhaseWheelSVG(svg, 200, 195, 76);

    // Characters
    buildCharSVG(svg, 110, 310, 44, CHAR_A_COLOR, "#a855f7", "A");
    buildCharSVG(svg, 290, 310, 44, CHAR_B_COLOR, "#f59e0b", "B");

    // Character name labels
    const labelA = document.createElementNS(ns, "text");
    labelA.setAttribute("x", "110");
    labelA.setAttribute("y", "372");
    labelA.setAttribute("text-anchor", "middle");
    labelA.setAttribute("fill", CHAR_A_COLOR);
    labelA.setAttribute("font-size", "12");
    labelA.setAttribute("font-family", "sans-serif");
    labelA.textContent = "Clapper A";
    svg.appendChild(labelA);

    const labelB = document.createElementNS(ns, "text");
    labelB.setAttribute("x", "290");
    labelB.setAttribute("y", "372");
    labelB.setAttribute("text-anchor", "middle");
    labelB.setAttribute("fill", CHAR_B_COLOR);
    labelB.setAttribute("font-size", "12");
    labelB.setAttribute("font-family", "sans-serif");
    labelB.textContent = "Clapper B";
    svg.appendChild(labelB);

    // Subtitle below wheel
    const sub = document.createElementNS(ns, "text");
    sub.setAttribute("x", "200");
    sub.setAttribute("y", "290");
    sub.setAttribute("text-anchor", "middle");
    sub.setAttribute("fill", "rgba(255,255,255,0.30)");
    sub.setAttribute("font-size", "11");
    sub.setAttribute("font-family", "sans-serif");
    sub.textContent = "dots meet = unison · apart = phasing";
    svg.appendChild(sub);

    // Start rAF
    lastFrameRef.current = performance.now();
    rafRef.current = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  // ── Start: request mic + build audio engine ───────────────────────────
  const handleStart = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const vs = visRef.current;
      vs.demoMode = false;
      vs.lastInteractionTime = performance.now();

      try {
        const engine = buildAudioEngine();
        engineRef.current = engine;
        await engine.ctx.resume();

        const canon = makePhaseCanon();
        canonRef.current = canon;

        setAppPhase("permission");

        // Request microphone
        let gotMic = false;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false },
            video: false,
          });
          micStreamRef.current = stream;
          const micSrc = engine.ctx.createMediaStreamSource(stream);
          micSrc.connect(engine.analyser);
          onsetRef.current = makeOnsetDetector();
          gotMic = true;
        } catch {
          setMicDenied(true);
        }

        // Start recording phase
        vs.onsetTimesMs = [];
        vs.recordingActive = true;
        setClapCount(0);
        setAppPhase("recording");

        if (gotMic) {
          setStatusMsg("👏 Clap 2–6 times into the mic — I'm listening!");
        } else {
          setStatusMsg("Mic not available. Tap the screen to clap!");
        }

        // Fallback: if no claps after 4 seconds, use default pattern
        if (vs.recordingTimeoutId !== null) clearTimeout(vs.recordingTimeoutId);
        const tid = setTimeout(() => finishRecording(), 4000);
        vs.recordingTimeoutId = tid;
      } catch (err) {
        console.error("start error", err);
        setStatusMsg("Could not start audio. Try a different browser.");
      }
    },
    [finishRecording]
  );

  // ── Screen tap: add manual onset when mic denied ──────────────────────
  const handleScreenTap = useCallback(() => {
    const vs = visRef.current;
    vs.lastInteractionTime = performance.now();

    if (appPhaseRef.current === "recording" && micDenied) {
      vs.onsetTimesMs.push(performance.now());
      vs.flashA = 1;
      const n = vs.onsetTimesMs.length;
      setClapCount(n);
      setStatusMsg(`Clap ${n} — ${n < 3 ? "keep going!" : "great, finishing soon…"}`);
      // Reset finish timeout
      if (vs.recordingTimeoutId !== null) clearTimeout(vs.recordingTimeoutId);
      const tid = setTimeout(() => finishRecording(), 2000);
      vs.recordingTimeoutId = tid;
    }
  }, [micDenied, finishRecording]);

  // ── Re-clap: reset and record a new rhythm ────────────────────────────
  const handleReclap = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const vs = visRef.current;
      const canon = canonRef.current;
      if (canon) stopCanon(canon);

      vs.onsetTimesMs = [];
      vs.recordingActive = true;
      vs.lastInteractionTime = performance.now();
      vs.demoMode = false;
      setClapCount(0);
      setAppPhase("recording");
      setStatusMsg(
        micDenied
          ? "Tap the screen to clap a new rhythm!"
          : "👏 Clap a new rhythm into the mic!"
      );

      if (vs.recordingTimeoutId !== null) clearTimeout(vs.recordingTimeoutId);
      const tid = setTimeout(() => finishRecording(), 4000);
      vs.recordingTimeoutId = tid;
    },
    [finishRecording, micDenied]
  );

  // ── Cleanup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const capturedVisRef = visRef;
    return () => {
      cancelAnimationFrame(rafRef.current);
      const canon = canonRef.current;
      if (canon) stopCanon(canon);
      const stream = micStreamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const engine = engineRef.current;
      if (engine) {
        try { engine.ctx.close(); } catch { /* ignore */ }
      }
      const tid = capturedVisRef.current.recordingTimeoutId;
      if (tid !== null) clearTimeout(tid);
    };
  }, []);

  // ── render ────────────────────────────────────────────────────────────
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-start pt-8 pb-16 px-4"
      style={{ backgroundColor: BG }}
      onClick={handleScreenTap}
    >
      {/* Hero title + description */}
      <div className="w-full max-w-lg text-center mb-5">
        <h1 className="text-3xl font-bold text-white/95 mb-2 tracking-tight leading-tight">
          Clap Canon
        </h1>
        <p className="text-base text-white/75 leading-relaxed">
          Clap a rhythm — two friends loop it back, but one drifts faster.
          Watch them slide in &amp; out of sync: Steve Reich&apos;s phasing, for kids!
        </p>
      </div>

      {/* Mic denied warning */}
      {micDenied && (
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 max-w-sm w-full">
          <p className="text-rose-300 text-base font-medium text-center">
            No mic access — tap anywhere to add your claps!
          </p>
        </div>
      )}

      {/* Main SVG canvas */}
      <div className="w-full max-w-[420px] mx-auto mb-5">
        <svg
          ref={svgRef}
          viewBox="0 0 400 420"
          className="w-full rounded-2xl overflow-hidden"
          style={{ background: BG, display: "block" }}
          aria-label="Two friendly characters and a phase wheel"
        />
      </div>

      {/* Status message */}
      <p className="text-base text-white/80 mb-5 text-center min-h-[1.5rem] px-2">
        {statusMsg}
      </p>

      {/* Controls */}
      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        {appPhase === "idle" && (
          <button
            onClick={handleStart}
            className="w-full min-h-[52px] px-6 py-3 rounded-2xl text-xl font-bold
              text-white bg-gradient-to-r from-violet-600 to-fuchsia-500
              hover:from-violet-500 hover:to-fuchsia-400
              active:scale-95 transition-transform shadow-xl shadow-violet-900/40"
          >
            Start Clapping!
          </button>
        )}

        {appPhase === "permission" && (
          <p className="text-white/70 text-base animate-pulse text-center">
            Setting up mic…
          </p>
        )}

        {appPhase === "recording" && (
          <div className="flex flex-col items-center gap-3">
            {/* Clap counter dots */}
            <div className="flex gap-2 items-center">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className="w-5 h-5 rounded-full border-2 transition-all duration-150"
                  style={{
                    borderColor: CHAR_A_COLOR,
                    background: clapCount > i ? CHAR_A_COLOR : "transparent",
                  }}
                />
              ))}
            </div>
            {!micDenied && (
              <p className="text-white/60 text-sm text-center">
                Listening for claps via microphone…
              </p>
            )}
          </div>
        )}

        {appPhase === "playing" && (
          <>
            <button
              onClick={handleReclap}
              className="w-full min-h-[48px] px-5 py-2.5 rounded-xl text-base font-semibold
                text-white/90 bg-white/10 border border-white/20
                hover:bg-white/15 active:scale-95 transition-all"
            >
              👏 Clap a New Rhythm
            </button>
            {/* Phase legend */}
            <div className="text-center mt-1">
              <p className="text-sm text-white/55">
                <span style={{ color: CHAR_A_COLOR }}>●</span> A: steady loop
                &nbsp;·&nbsp;
                <span style={{ color: CHAR_B_COLOR }}>●</span> B: drifts faster
              </p>
            </div>
          </>
        )}
      </div>

      {/* Design notes link */}
      <div className="fixed bottom-4 right-4 z-10">
        <Link
          href="./README.md"
          className="text-xs text-white/30 hover:text-white/55 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          Design notes
        </Link>
      </div>
    </main>
  );
}
