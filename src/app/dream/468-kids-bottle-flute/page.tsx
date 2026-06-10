"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  WORKLET_NAME,
  buildWorkletSource,
  BOTTLE_NOTES,
  touchEnvelope,
  AUTO_DEMO_MELODY,
  type DemoNote,
} from "./flute";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BottleState {
  breathLevel: number;  // 0–1 visual breath shimmer
  glowing: boolean;     // true while note is playing
  wobble: number;       // SVG wobble phase offset
}

interface ActiveVoice {
  workletNode: AudioWorkletNode | ScriptProcessorNode | null;
  gainNode: GainNode;
  breathParam: AudioParam | null;
  startTime: number;
  bottleIdx: number;
}

// ── Audio setup helpers ───────────────────────────────────────────────────────

async function loadWorklet(ctx: AudioContext): Promise<boolean> {
  try {
    const src = buildWorkletSource();
    const blob = new Blob([src], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

function createReverbChain(ctx: AudioContext): GainNode {
  // Simple Schroeder reverb: 4 comb filters + 2 allpass
  const wet = ctx.createGain();
  wet.gain.value = 0.22;
  const dry = ctx.createGain();
  dry.gain.value = 1.0;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 1;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  const combDelays = [0.0297, 0.0371, 0.0411, 0.0437];
  const combFeedbacks = [0.773, 0.802, 0.753, 0.733];

  combDelays.forEach((d, i) => {
    const delay = ctx.createDelay(0.1);
    delay.delayTime.value = d;
    const fb = ctx.createGain();
    fb.gain.value = combFeedbacks[i];
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    wet.connect(delay);
    delay.connect(limiter);
  });

  // Allpass
  [0.005, 0.0017].forEach((d) => {
    const ap = ctx.createBiquadFilter();
    ap.type = "allpass";
    ap.frequency.value = 1 / (2 * Math.PI * d);
    wet.connect(ap);
    ap.connect(limiter);
  });

  dry.connect(limiter);
  limiter.connect(ctx.destination);

  // Return a master gain that routes to both dry and wet
  const master = ctx.createGain();
  master.gain.value = 0.88;
  master.connect(dry);
  master.connect(wet);
  return master;
}

function startAmbientPad(ctx: AudioContext, masterGain: GainNode): () => void {
  // Gentle pad: C3 E3 G3 triangle oscillators with slow LFO
  const padFreqs = [130.81, 164.81, 196.0];
  const nodes: OscillatorNode[] = [];
  padFreqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    g.gain.value = 0.008;
    lfo.frequency.value = 0.05 + i * 0.015;
    lg.gain.value = 0.004;
    lfo.connect(lg);
    lg.connect(g.gain);
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    lfo.start();
    nodes.push(osc, lfo);
  });
  return () => nodes.forEach((n) => { try { n.stop(); } catch { /* ignore */ } });
}

// ── ScriptProcessor fallback flute (same algorithm, runs on audio thread) ───

function createScriptFluteNode(
  ctx: AudioContext,
  freq: number
): { node: ScriptProcessorNode; setBreath: (v: number) => void; setFreq: (f: number) => void } {
  const bufSize = 512;
  const node = ctx.createScriptProcessor(bufSize, 0, 1);
  let breathVal = 0;
  let freqVal = freq;

  // Bore state
  const sr = ctx.sampleRate;
  let boreLen = Math.max(8, Math.round(sr / freq));
  let bore = new Float32Array(boreLen + 4);
  let borePtr = 0;
  let rfilt = 0;
  let nx = 0;
  let nbp = 0;
  let envState = 0;
  let vPhase = 0;

  function resizeBore(f: number) {
    const newLen = Math.max(8, Math.round(sr / Math.max(50, f)));
    if (newLen !== boreLen) {
      const old = bore;
      const oldLen = boreLen;
      bore = new Float32Array(newLen + 4);
      const copy = Math.min(newLen, oldLen);
      for (let i = 0; i < copy; i++) {
        bore[i] = old[(borePtr - copy + i + oldLen * 2) % oldLen] ?? 0;
      }
      borePtr = copy % newLen;
      boreLen = newLen;
    }
    freqVal = f;
  }

  node.onaudioprocess = (e: AudioProcessingEvent) => {
    const out = e.outputBuffer.getChannelData(0);
    if (Math.abs(freqVal - sr / boreLen) > 1) resizeBore(freqVal);
    const N = boreLen;
    const reflCoeff = 0.945 + 0.03 * Math.min(1, Math.max(0, (freqVal - 200) / 800));

    for (let i = 0; i < out.length; i++) {
      const eTarget = breathVal > 0.01 ? breathVal : 0;
      envState += (eTarget - envState) * (eTarget > envState ? 0.003 : 0.001);
      const env = envState;

      vPhase += (2 * Math.PI * 5.4) / sr;
      const vibDepth = Math.min(1, Math.max(0, (env - 0.1) * 5)) * 0.0025;
      const vib = Math.sin(vPhase) * vibDepth;

      nx  += ((Math.random() * 2 - 1) - nx)  * 0.12;
      nbp += (nx - nbp) * 0.20;

      const boreOut = bore[borePtr] ?? 0;
      const pressure = env * (0.52 + vib) + nbp * env * 0.30;
      const jetIn = pressure + boreOut * 0.40;

      let jet = jetIn - (jetIn * jetIn * jetIn) / 3.0;
      if (jet > 1.15) jet = 1.15;
      else if (jet < -1.15) jet = -1.15;
      if (jet !== jet) jet = 0;

      const reflected = reflCoeff * rfilt + (1.0 - reflCoeff) * boreOut;
      rfilt = reflected;
      if (rfilt !== rfilt) rfilt = 0;

      bore[borePtr] = jet - reflected;
      borePtr = (borePtr + 1) % N;
      out[i] = reflected * 0.62;
    }
  };

  return {
    node,
    setBreath: (v: number) => { breathVal = v; },
    setFreq: (f: number) => { freqVal = f; },
  };
}

// ── SVG Bottle Component ──────────────────────────────────────────────────────

function BottleSVG({
  note,
  allStates,
  bottleIdx,
  isActive,
  onPress,
  onRelease,
}: {
  note: typeof BOTTLE_NOTES[0];
  allStates: React.RefObject<BottleState[]>;
  bottleIdx: number;
  isActive: boolean;
  onPress: (idx: number) => void;
  onRelease: (idx: number) => void;
}) {
  const bottleGroupRef = useRef<SVGGElement>(null);
  const shimmerRef = useRef<SVGEllipseElement>(null);
  const glowCircRef = useRef<SVGCircleElement>(null);
  const bubbleGroupRef = useRef<SVGGElement>(null);

  // Natural bottle proportions (all units within a 80×220 viewBox)
  const W = 80;
  const H = 220;

  // Scale bottle height by relHeight
  const bH = Math.round(H * note.relHeight);
  const bodyH = Math.round(bH * 0.72);
  const neckH = Math.round(bH * 0.22);
  const baseY = H - 8;
  const bodyTop = baseY - bodyH;
  const neckTop = bodyTop - neckH;
  const bodyW = W * 0.62;
  const neckW = W * 0.20;
  const mouthW = W * 0.18;
  const cx = W / 2;

  const filterId = `glow-${bottleIdx}`;
  const gradId = `grad-${bottleIdx}`;

  // Animate — updates SVG attrs directly via refs, bypassing React diffing
  useEffect(() => {
    let rafId: number;

    function frame() {
      const states = allStates.current;
      const st = states ? states[bottleIdx] : null;
      if (!st) { rafId = requestAnimationFrame(frame); return; }

      const wobX = Math.sin(st.wobble * 0.7 + performance.now() * 0.0008) * (isActive ? 2 : 0.4);
      const wobY = Math.cos(st.wobble * 0.5 + performance.now() * 0.0012) * (isActive ? 1.5 : 0.3);

      if (bottleGroupRef.current) {
        bottleGroupRef.current.setAttribute(
          "transform",
          `translate(${wobX.toFixed(2)}, ${wobY.toFixed(2)})`,
        );
      }

      // Shimmer intensity
      const shimmerOpacity = Math.min(0.85, st.breathLevel * 1.1);
      if (shimmerRef.current) {
        shimmerRef.current.setAttribute("opacity", shimmerOpacity.toFixed(3));
        const shimmerRy = 4 + st.breathLevel * 18;
        shimmerRef.current.setAttribute("ry", shimmerRy.toFixed(1));
        // Float shimmer upward with breath
        const shimY = neckTop - 10 - st.breathLevel * 28;
        shimmerRef.current.setAttribute("cy", shimY.toFixed(1));
      }

      // Glow pulse
      if (glowCircRef.current) {
        const glowR = isActive ? 32 + st.breathLevel * 22 + Math.sin(performance.now() * 0.003) * 5 : 0;
        glowCircRef.current.setAttribute("r", glowR.toFixed(1));
        glowCircRef.current.setAttribute("opacity", (isActive ? 0.18 + st.breathLevel * 0.18 : 0).toFixed(3));
      }

      // Breath bubbles rising from mouth
      if (bubbleGroupRef.current && st.breathLevel > 0.05) {
        const children = bubbleGroupRef.current.children;
        for (let b = 0; b < children.length; b++) {
          const bub = children[b] as SVGCircleElement;
          const cy = parseFloat(bub.getAttribute("cy") ?? "0");
          const newCy = cy - (0.3 + st.breathLevel * 0.6);
          if (newCy < neckTop - 50) {
            // Reset bubble
            bub.setAttribute("cy", String(neckTop - 5));
            bub.setAttribute("cx", String(cx + (Math.random() - 0.5) * mouthW));
            bub.setAttribute("r", String(1.5 + Math.random() * 2.5));
          } else {
            bub.setAttribute("cy", newCy.toFixed(1));
          }
          bub.setAttribute("opacity", (Math.min(0.7, st.breathLevel * 0.9)).toFixed(2));
        }
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, allStates, bottleIdx, neckTop, cx, mouthW]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    onPress(bottleIdx);
  }, [onPress, bottleIdx]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    onRelease(bottleIdx);
  }, [onRelease, bottleIdx]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: 90, touchAction: "none", cursor: "pointer", overflow: "visible" }}
      aria-label={`Bottle ${note.name} — tap to play`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <defs>
        <filter id={filterId} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={note.glow}  stopOpacity="0.55" />
          <stop offset="40%"  stopColor={note.color} stopOpacity="0.95" />
          <stop offset="75%"  stopColor={note.color} stopOpacity="0.80" />
          <stop offset="100%" stopColor="#1a1008"    stopOpacity="0.90" />
        </linearGradient>
      </defs>

      {/* Glow halo behind bottle */}
      <circle
        ref={glowCircRef}
        cx={cx}
        cy={baseY - bodyH / 2}
        r={0}
        fill={note.glow}
        opacity={0}
        filter={`url(#${filterId})`}
      />

      {/* Bottle group (wobbles) */}
      <g ref={bottleGroupRef}>
        {/* Body */}
        <rect
          x={cx - bodyW / 2}
          y={bodyTop}
          width={bodyW}
          height={bodyH}
          rx={bodyW * 0.2}
          ry={bodyW * 0.2}
          fill={`url(#${gradId})`}
          stroke={note.glow}
          strokeWidth={isActive ? "2" : "1"}
          strokeOpacity={isActive ? "0.9" : "0.4"}
          filter={isActive ? `url(#${filterId})` : undefined}
        />

        {/* Glass highlight (vertical stripe) */}
        <rect
          x={cx - bodyW * 0.28}
          y={bodyTop + bodyH * 0.08}
          width={bodyW * 0.1}
          height={bodyH * 0.75}
          rx={bodyW * 0.05}
          fill="white"
          opacity="0.14"
        />

        {/* Neck */}
        <rect
          x={cx - neckW / 2}
          y={neckTop}
          width={neckW}
          height={neckH}
          rx={neckW * 0.25}
          fill={note.color}
          fillOpacity="0.88"
          stroke={note.glow}
          strokeWidth={isActive ? "1.5" : "0.8"}
          strokeOpacity={isActive ? "0.85" : "0.3"}
        />

        {/* Mouth opening */}
        <rect
          x={cx - mouthW / 2}
          y={neckTop - 6}
          width={mouthW}
          height={8}
          rx={mouthW * 0.3}
          fill={isActive ? note.glow : "#000"}
          fillOpacity={isActive ? "0.8" : "0.7"}
        />

        {/* Base reflection */}
        <ellipse
          cx={cx}
          cy={baseY}
          rx={bodyW * 0.48}
          ry={4}
          fill={note.color}
          fillOpacity="0.25"
        />

        {/* Note name label */}
        <text
          x={cx}
          y={baseY + 16}
          textAnchor="middle"
          fontSize="11"
          fill="white"
          fillOpacity="0.6"
          fontFamily="sans-serif"
          fontWeight="600"
          letterSpacing="0.5"
        >
          {note.name}
        </text>
      </g>

      {/* Breath shimmer (rises from mouth) */}
      <ellipse
        ref={shimmerRef}
        cx={cx}
        cy={neckTop - 10}
        rx={mouthW * 0.6}
        ry={0}
        fill={note.glow}
        opacity={0}
        filter={`url(#${filterId})`}
      />

      {/* Tiny breath bubbles rising from mouth */}
      <g ref={bubbleGroupRef}>
        {[0, 1, 2, 3].map((b) => (
          <circle
            key={b}
            cx={cx + (b % 2 === 0 ? -3 : 3)}
            cy={neckTop - 5 - b * 8}
            r={1.5 + b * 0.5}
            fill={note.glow}
            opacity={0}
          />
        ))}
      </g>
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function KidsBottleFlute() {
  const [phase, setPhase] = useState<"idle" | "active">("idle");
  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [activeBottle, setActiveBottle] = useState<number | null>(null);
  const [isAutoDemo, setIsAutoDemo] = useState(false);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const workletSupportRef = useRef(false);
  const voiceRef = useRef<ActiveVoice | null>(null);
  const scriptNodeRef = useRef<{ setBreath: (v: number) => void; setFreq: (f: number) => void } | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const padStopRef = useRef<(() => void) | null>(null);

  // Visual state refs (one per bottle)
  const bottleStatesRef = useRef<BottleState[]>(
    BOTTLE_NOTES.map(() => ({ breathLevel: 0, glowing: false, wobble: Math.random() * Math.PI * 2 })),
  );

  // RAF and demo refs
  const rafRef = useRef(0);
  const demoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoRef = useRef(false);
  const touchActiveRef = useRef(false);
  const touchBottleRef = useRef<number | null>(null);
  const touchEnvTRef = useRef(0);
  const touchEnvTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Start audio system ──────────────────────────────────────────────────────

  const startAudio = useCallback(async (withMic: boolean) => {
    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const masterGain = createReverbChain(ctx);
    masterGainRef.current = masterGain;

    const padStop = startAmbientPad(ctx, masterGain);
    padStopRef.current = padStop;

    // Try AudioWorklet
    const workletOk = await loadWorklet(ctx);
    workletSupportRef.current = workletOk;

    if (withMic) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = stream;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.78;
        const src = ctx.createMediaStreamSource(stream);
        src.connect(analyser);
        analyserRef.current = analyser;
        timeBufRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
        setMicActive(true);
        setMicError(null);
      } catch {
        setMicError("Mic not available — tap bottles to play");
      }
    }

    setPhase("active");

    // Schedule auto-demo if no interaction after 3s
    demoTimeoutRef.current = setTimeout(() => {
      if (!touchActiveRef.current) {
        runAutoDemo();
      }
    }, 3000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Play a note ─────────────────────────────────────────────────────────────

  const playNote = useCallback((bottleIdx: number) => {
    const ctx = ctxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return;

    // Stop current voice if any
    stopCurrentVoice();

    const note = BOTTLE_NOTES[bottleIdx];
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;
    gainNode.connect(master);

    let voice: ActiveVoice;

    if (workletSupportRef.current) {
      try {
        const wNode = new AudioWorkletNode(ctx, WORKLET_NAME, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        wNode.parameters.get("freq")!.value = note.freq;
        wNode.parameters.get("breath")!.value = 0;
        wNode.connect(gainNode);
        voice = {
          workletNode: wNode,
          gainNode,
          breathParam: wNode.parameters.get("breath") ?? null,
          startTime: performance.now(),
          bottleIdx,
        };
      } catch {
        // Worklet failed at runtime — fall back
        workletSupportRef.current = false;
        return playNote(bottleIdx);
      }
    } else {
      // ScriptProcessor fallback
      const sp = createScriptFluteNode(ctx, note.freq);
      scriptNodeRef.current = sp;
      sp.node.connect(gainNode);
      voice = {
        workletNode: sp.node,
        gainNode,
        breathParam: null,
        startTime: performance.now(),
        bottleIdx,
      };
    }

    voiceRef.current = voice;
    bottleStatesRef.current[bottleIdx].glowing = true;
    // stopCurrentVoice is a stable ref-only callback; intentionally omitted to avoid a definition-order cycle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopCurrentVoice = useCallback(() => {
    const v = voiceRef.current;
    if (!v) return;
    try {
      v.gainNode.gain.setValueAtTime(v.gainNode.gain.value, ctxRef.current?.currentTime ?? 0);
      v.gainNode.gain.linearRampToValueAtTime(0, (ctxRef.current?.currentTime ?? 0) + 0.08);
      setTimeout(() => {
        try { v.gainNode.disconnect(); } catch { /* ignore */ }
        try { v.workletNode?.disconnect(); } catch { /* ignore */ }
      }, 100);
    } catch { /* ignore */ }
    if (v.bottleIdx !== null) {
      bottleStatesRef.current[v.bottleIdx].glowing = false;
      bottleStatesRef.current[v.bottleIdx].breathLevel = 0;
    }
    voiceRef.current = null;
    scriptNodeRef.current = null;
  }, []);

  // ── Set breath level on current voice ──────────────────────────────────────

  const setBreath = useCallback((level: number) => {
    const v = voiceRef.current;
    if (!v) return;
    const clampedLevel = Math.max(0, Math.min(1, level));

    if (v.breathParam) {
      v.breathParam.setValueAtTime(clampedLevel, ctxRef.current?.currentTime ?? 0);
    } else if (scriptNodeRef.current) {
      scriptNodeRef.current.setBreath(clampedLevel);
    }

    // Update visual
    if (v.bottleIdx !== null) {
      bottleStatesRef.current[v.bottleIdx].breathLevel = clampedLevel;
    }
  }, []);

  // ── Touch (tap) handlers ────────────────────────────────────────────────────

  const handleBottlePress = useCallback((idx: number) => {
    if (phase !== "active") return;
    // Cancel auto-demo
    demoRef.current = false;
    touchActiveRef.current = true;
    touchBottleRef.current = idx;
    touchEnvTRef.current = 0;
    setActiveBottle(idx);
    setIsAutoDemo(false);
    playNote(idx);

    // If no mic: use preset envelope
    if (!analyserRef.current) {
      if (touchEnvTimerRef.current) clearInterval(touchEnvTimerRef.current);
      touchEnvTimerRef.current = setInterval(() => {
        touchEnvTRef.current += 0.016;
        const level = touchEnvelope(touchEnvTRef.current, 1.5);
        setBreath(level);
        if (touchEnvTRef.current >= 1.5) {
          if (touchEnvTimerRef.current) clearInterval(touchEnvTimerRef.current);
          stopCurrentVoice();
          setActiveBottle(null);
          touchActiveRef.current = false;
        }
      }, 16);
    }
  }, [phase, playNote, setBreath, stopCurrentVoice]);

  const handleBottleRelease = useCallback((idx: number) => {
    if (touchBottleRef.current !== idx) return;
    touchActiveRef.current = false;
    touchBottleRef.current = null;
    if (touchEnvTimerRef.current) {
      clearInterval(touchEnvTimerRef.current);
      touchEnvTimerRef.current = null;
    }
    stopCurrentVoice();
    setActiveBottle(null);
  }, [stopCurrentVoice]);

  // ── Auto-demo ───────────────────────────────────────────────────────────────

  const runAutoDemo = useCallback(() => {
    if (demoRef.current) return;
    demoRef.current = true;
    setIsAutoDemo(true);
    let step = 0;

    function playDemoStep() {
      if (!demoRef.current) {
        setIsAutoDemo(false);
        return;
      }

      const note: DemoNote = AUTO_DEMO_MELODY[step % AUTO_DEMO_MELODY.length];
      const idx = note.bottleIdx;
      setActiveBottle(idx);
      playNote(idx);

      // Animate breath level with touch envelope
      let t = 0;
      const envInterval = setInterval(() => {
        if (!demoRef.current) { clearInterval(envInterval); return; }
        t += 0.016;
        const level = touchEnvelope(t, note.duration);
        setBreath(level);
        bottleStatesRef.current[idx].breathLevel = level;
      }, 16);

      setTimeout(() => {
        clearInterval(envInterval);
        setBreath(0);
        bottleStatesRef.current[idx].breathLevel = 0;
        stopCurrentVoice();
        setActiveBottle(null);

        step++;
        setTimeout(() => {
          if (demoRef.current) playDemoStep();
          else setIsAutoDemo(false);
        }, note.gap * 1000);
      }, note.duration * 1000);
    }

    playDemoStep();
  }, [playNote, setBreath, stopCurrentVoice]);

  // ── Main animation / mic loop ───────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "active") return;

    let lastMicRms = 0;

    function loop() {
      // Read mic RMS if available
      if (analyserRef.current && timeBufRef.current && touchActiveRef.current) {
        const buf = timeBufRef.current;
        analyserRef.current.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // Smooth
        lastMicRms = lastMicRms * 0.75 + rms * 0.25;
        // Map to breath: ~0.005 RMS = silent, 0.05+ = strong blow
        const breathLevel = Math.min(1, Math.max(0, (lastMicRms - 0.004) / 0.055));
        setBreath(breathLevel);
        if (voiceRef.current) {
          bottleStatesRef.current[voiceRef.current.bottleIdx].breathLevel = breathLevel;
        }
      } else if (!touchActiveRef.current) {
        // Decay breath visuals when not touching
        if (voiceRef.current) {
          const idx = voiceRef.current.bottleIdx;
          const st = bottleStatesRef.current[idx];
          st.breathLevel = Math.max(0, st.breathLevel * 0.93);
        }
      }

      // Decay wobble angles over time
      bottleStatesRef.current.forEach((st) => {
        st.wobble += 0.015;
      });

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, setBreath]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      demoRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
      if (touchEnvTimerRef.current) clearInterval(touchEnvTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      padStopRef.current?.();
      try { ctxRef.current?.close(); } catch { /* ignore */ }
    };
  }, []);

  // ── Start button handler ────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    startAudio(true);
  }, [startAudio]);

  const handleStartNoMic = useCallback(() => {
    startAudio(false);
  }, [startAudio]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen bg-[#0d0905] text-white flex flex-col items-center">
      {/* Background warm gradient */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 110%, rgba(160,90,20,0.15) 0%, transparent 70%), " +
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(80,50,120,0.08) 0%, transparent 60%)",
        }}
      />

      {/* Header */}
      <header className="relative z-10 w-full px-5 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-white/95">
          Bottle Flute
        </h1>
        <Link
          href="/dream"
          className="text-xs tracking-widest text-white/50 hover:text-white/80 transition-colors"
        >
          RESONANCE / DREAM
        </Link>
      </header>

      {/* Idle screen */}
      {phase === "idle" && (
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 gap-8 px-6 text-center mt-8">
          {/* Visual teaser: static bottles */}
          <div className="flex items-end gap-3 justify-center opacity-60 mb-2">
            {BOTTLE_NOTES.map((note, i) => (
              <div
                key={i}
                className="rounded-lg"
                style={{
                  width: 14 + (BOTTLE_NOTES.length - i) * 3,
                  height: 40 + note.relHeight * 80,
                  background: note.color,
                  boxShadow: `0 0 12px ${note.glow}55`,
                  opacity: 0.7,
                }}
              />
            ))}
          </div>

          <p className="text-white/75 text-base max-w-xs leading-relaxed">
            Blow into the mic and tap a glowing bottle — it breathes like a real flute.
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={handleStart}
              className="min-h-[52px] px-6 py-3 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white text-base font-semibold shadow-lg shadow-amber-900/40 transition-colors"
            >
              Start with mic
            </button>
            <button
              onClick={handleStartNoMic}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-base transition-colors"
            >
              Tap-only (no mic)
            </button>
          </div>

          <p className="text-white/40 text-sm max-w-xs">
            Mic is used only for live breath — never recorded or stored.
          </p>
        </div>
      )}

      {/* Active screen */}
      {phase === "active" && (
        <div className="relative z-10 flex flex-col items-center flex-1 w-full px-4 pt-4 pb-8">
          {/* Status bar */}
          <div className="flex items-center gap-3 mb-6 h-7">
            {micActive && (
              <span className="text-sm text-emerald-400/80 flex items-center gap-1.5">
                <span
                  className="inline-block w-2 h-2 rounded-full bg-emerald-400"
                  style={{ animation: "pulse 1.5s ease-in-out infinite" }}
                />
                mic on — blow gently
              </span>
            )}
            {micError && (
              <span className="text-sm text-rose-300">{micError}</span>
            )}
            {isAutoDemo && (
              <span className="text-sm text-amber-400/80 italic">auto-demo — tap any bottle</span>
            )}
          </div>

          {/* Bottles row */}
          <div
            className="flex items-end justify-center gap-4 w-full"
            style={{ maxWidth: 560 }}
          >
            {BOTTLE_NOTES.map((note, i) => (
              <div key={i} className="flex-1 flex flex-col items-center" style={{ maxWidth: 100 }}>
                <BottleSVG
                  note={note}
                  allStates={bottleStatesRef}
                  bottleIdx={i}
                  isActive={activeBottle === i}
                  onPress={handleBottlePress}
                  onRelease={handleBottleRelease}
                />
              </div>
            ))}
          </div>

          {/* Instructions */}
          <p className="mt-8 text-white/50 text-sm text-center max-w-xs">
            {micActive
              ? "Tap a bottle, then blow — soft breath for pure tone, hard blow for high note"
              : "Tap and hold a bottle to play"}
          </p>

          {/* Overblow hint */}
          <p className="mt-2 text-amber-400/50 text-xs text-center max-w-xs">
            Blow hard to jump the octave
          </p>
        </div>
      )}

      {/* Corner note */}
      <div className="fixed bottom-16 right-4 z-20">
        <span className="text-[11px] text-white/25 select-none">
          waveguide flute — see README
        </span>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
