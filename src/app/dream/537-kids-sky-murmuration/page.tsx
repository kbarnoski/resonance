'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { buildScene, stepFlock, driftCamera, BOUNDS, type Attractor } from './flock';
import { makeAudioEngine } from './audio';

// ── Ghost demo path ────────────────────────────────────────────────────────────

// Smooth Lissajous-like path for the ghost attractor
function ghostPos(t: number): { x: number; y: number; z: number } {
  return {
    x: Math.sin(t * 0.22) * BOUNDS.x * 0.32,
    y: Math.cos(t * 0.14) * BOUNDS.y * 0.3,
    z: Math.sin(t * 0.18 + 1.1) * BOUNDS.z * 0.22,
  };
}

// Secondary ghost that orbits around the first (creates splits)
function ghostPos2(t: number): { x: number; y: number; z: number } {
  const base = ghostPos(t);
  return {
    x: base.x + Math.cos(t * 0.41) * BOUNDS.x * 0.22,
    y: base.y + Math.sin(t * 0.33) * BOUNDS.y * 0.15,
    z: base.z + Math.sin(t * 0.28) * BOUNDS.z * 0.12,
  };
}

// Blend between single attractor and split (two attractors) on a cycle
function ghostSplitPhase(t: number): number {
  // Oscillates between 0 (merged) and 1 (split), period ~12s
  return Math.max(0, Math.sin(t * 0.52 - 0.4));
}

// ── Fallback 2D Canvas flock ───────────────────────────────────────────────────

function runCanvas2DFlock(
  canvas: HTMLCanvasElement,
  getAttractors: () => Attractor[],
) {
  const N = 300;
  const cx = new Float32Array(N);
  const cy = new Float32Array(N);
  const cvx = new Float32Array(N);
  const cvy = new Float32Array(N);

  for (let i = 0; i < N; i++) {
    cx[i] = (Math.random() - 0.5) * canvas.width;
    cy[i] = (Math.random() - 0.5) * canvas.height;
    cvx[i] = (Math.random() - 0.5) * 2;
    cvy[i] = (Math.random() - 0.5) * 2;
  }

  let running = true;
  let rafId = 0;

  function step() {
    if (!running) return;
    const ctx2 = canvas.getContext('2d');
    if (!ctx2) return;

    const W = canvas.width;
    const H = canvas.height;

    ctx2.fillStyle = 'rgba(13,11,42,0.18)';
    ctx2.fillRect(0, 0, W, H);

    const attractors = getAttractors();

    for (let i = 0; i < N; i++) {
      let fx = 0, fy = 0;
      let aliX = 0, aliY = 0, aliN = 0;
      let cohX = 0, cohY = 0, cohN = 0;

      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const dx = cx[i] - cx[j];
        const dy = cy[i] - cy[j];
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        if (d < 18) { fx += dx / d * 2; fy += dy / d * 2; }
        if (d < 55) { aliX += cvx[j]; aliY += cvy[j]; aliN++; }
        if (d < 80) { cohX += cx[j]; cohY += cy[j]; cohN++; }
      }

      if (aliN > 0) {
        fx += (aliX / aliN - cvx[i]) * 0.8;
        fy += (aliY / aliN - cvy[i]) * 0.8;
      }
      if (cohN > 0) {
        fx += (cohX / cohN - cx[i]) * 0.005;
        fy += (cohY / cohN - cy[i]) * 0.005;
      }

      for (const att of attractors) {
        const ax = att.x * W * 0.5 - cx[i];
        const ay = att.y * H * 0.5 - cy[i];
        const ad = Math.sqrt(ax * ax + ay * ay) + 0.01;
        fx += (ax / ad) * 0.6 * att.strength;
        fy += (ay / ad) * 0.6 * att.strength;
      }

      // Boundary
      if (cx[i] > W * 0.5) fx -= 1.5;
      if (cx[i] < -W * 0.5) fx += 1.5;
      if (cy[i] > H * 0.5) fy -= 1.5;
      if (cy[i] < -H * 0.5) fy += 1.5;

      cvx[i] += fx * 0.016;
      cvy[i] += fy * 0.016;
      const sp = Math.sqrt(cvx[i] * cvx[i] + cvy[i] * cvy[i]);
      if (sp > 3.5) { cvx[i] = cvx[i] / sp * 3.5; cvy[i] = cvy[i] / sp * 3.5; }
      if (sp < 1.2 && sp > 0.01) { cvx[i] = cvx[i] / sp * 1.2; cvy[i] = cvy[i] / sp * 1.2; }

      cx[i] += cvx[i];
      cy[i] += cvy[i];

      const screenX = cx[i] + W * 0.5;
      const screenY = cy[i] + H * 0.5;
      const alpha = 0.7 + Math.random() * 0.3;
      ctx2.fillStyle = `rgba(180,150,255,${alpha})`;
      ctx2.beginPath();
      ctx2.arc(screenX, screenY, 1.5, 0, Math.PI * 2);
      ctx2.fill();
    }

    rafId = requestAnimationFrame(step);
  }

  step();
  return () => { running = false; cancelAnimationFrame(rafId); };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SkyMurmurationPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // fallback 2D

  const [started, setStarted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for render loop
  const threeRef = useRef<ReturnType<typeof buildScene> | null>(null);
  const audioRef = useRef<ReturnType<typeof makeAudioEngine> | null>(null);
  const rafRef = useRef<number>(0);
  const clockRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  // Touch/pointer attractors
  const userAttractorsRef = useRef<Attractor[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdleRef = useRef<boolean>(true); // start in demo/ghost mode
  const ghostActiveRef = useRef<boolean>(true);

  // Flock state for audio
  const audioStartedRef = useRef<boolean>(false);

  // ── Ghost resume after idle ──────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    isIdleRef.current = false;
    ghostActiveRef.current = false;
    idleTimerRef.current = setTimeout(() => {
      isIdleRef.current = true;
      ghostActiveRef.current = true;
      userAttractorsRef.current = [];
    }, 4000);
  }, []);

  // ── Pointer handlers ──────────────────────────────────────────
  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!started) return;
    resetIdleTimer();

    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    // Map screen NDC to 3D sky volume
    const attX = nx * BOUNDS.x * 0.45;
    const attY = ny * BOUNDS.y * 0.45;
    const attZ = 0; // project onto mid-depth plane

    userAttractorsRef.current = [{ x: attX, y: attY, z: attZ, strength: 0.85 }];
  }, [started, resetIdleTimer]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!started) return;
    resetIdleTimer();
    // Second touch = second attractor (split trigger)
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }, [started, resetIdleTimer]);

  const handlePointerUp = useCallback(() => {
    // Keep last attractor for a moment, then drift away
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      userAttractorsRef.current = [];
      isIdleRef.current = true;
      ghostActiveRef.current = true;
    }, 4000);
  }, []);

  // Multi-touch: track two fingers
  const activeTouches = useRef<Map<number, { x: number; y: number }>>(new Map());

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!started) return;
    resetIdleTimer();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      activeTouches.current.set(t.identifier, {
        x: ((t.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((t.clientY - rect.top) / rect.height) * 2 - 1),
      });
    }
    const attList: Attractor[] = [];
    activeTouches.current.forEach((pos) => {
      attList.push({
        x: pos.x * BOUNDS.x * 0.45,
        y: pos.y * BOUNDS.y * 0.45,
        z: 0,
        strength: 0.85,
      });
    });
    userAttractorsRef.current = attList.slice(0, 2);
  }, [started, resetIdleTimer]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!started) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      activeTouches.current.set(t.identifier, {
        x: ((t.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((t.clientY - rect.top) / rect.height) * 2 - 1),
      });
    }
    const attList: Attractor[] = [];
    activeTouches.current.forEach((pos) => {
      attList.push({
        x: pos.x * BOUNDS.x * 0.45,
        y: pos.y * BOUNDS.y * 0.45,
        z: 0,
        strength: 0.85,
      });
    });
    userAttractorsRef.current = attList.slice(0, 2);
  }, [started]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      activeTouches.current.delete(e.changedTouches[i].identifier);
    }
    if (activeTouches.current.size === 0) {
      handlePointerUp();
    }
  }, [handlePointerUp]);

  // ── Start handler (audio unlock + scene init) ─────────────────
  const handleStart = useCallback(() => {
    setStarted(true);
  }, []);

  // ── Main effect: init three.js scene and run loop ─────────────
  useEffect(() => {
    if (!started) return;
    if (!containerRef.current) return;

    let sceneData: ReturnType<typeof buildScene> | null = null;
    let audioEngine: ReturnType<typeof makeAudioEngine> | null = null;
    let canvas2DCleanup: (() => void) | null = null;

    // Try three.js
    try {
      sceneData = buildScene();
      threeRef.current = sceneData;

      const { renderer, camera } = sceneData;
      const container = containerRef.current;
      container.appendChild(renderer.domElement);

      // Resize to fill container
      function resize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(container);

      // Start audio
      try {
        audioEngine = makeAudioEngine();
        audioRef.current = audioEngine;
        audioStartedRef.current = true;
      } catch (audioErr) {
        console.warn('Audio failed:', audioErr);
      }

      // Ghost demo starts immediately
      ghostActiveRef.current = true;
      isIdleRef.current = true;

      // Render loop
      let lastTimestamp = 0;
      function renderFrame(ts: number) {
        rafRef.current = requestAnimationFrame(renderFrame);
        const dt = Math.min((ts - lastTimestamp) / 1000, 0.04);
        lastTimestamp = ts;
        clockRef.current += dt;
        lastTsRef.current = ts;

        const t = clockRef.current;

        // Build attractor list: ghost or user
        let attractors: Attractor[];
        if (ghostActiveRef.current) {
          const split = ghostSplitPhase(t);
          const p1 = ghostPos(t);
          attractors = [{ ...p1, strength: 0.7 }];
          if (split > 0.25) {
            const p2 = ghostPos2(t);
            attractors.push({ ...p2, strength: split * 0.65 });
          }
        } else {
          attractors = userAttractorsRef.current;
        }

        // Step boids
        const { pointsMesh, positions, colors } = sceneData!;
        const flockState = stepFlock(dt, attractors, positions, colors);

        // Update GPU buffers
        const posAttr = pointsMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const colAttr = pointsMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        // Camera drift
        driftCamera(camera, t);

        // Update audio
        if (audioEngine && audioStartedRef.current) {
          audioEngine.updateState(flockState);
        }

        renderer.render(sceneData!.scene, camera);
      }

      rafRef.current = requestAnimationFrame(renderFrame);

      return () => {
        cancelAnimationFrame(rafRef.current);
        ro.disconnect();
        if (sceneData) {
          sceneData.cleanup();
          if (sceneData.renderer.domElement.parentNode) {
            sceneData.renderer.domElement.parentNode.removeChild(sceneData.renderer.domElement);
          }
        }
        if (audioEngine) audioEngine.dispose();
        if (canvas2DCleanup) canvas2DCleanup();
      };
    } catch (webglErr) {
      console.warn('WebGL failed, falling back to 2D:', webglErr);
      setWebglFailed(true);
      setError('3D renderer unavailable — showing 2D flock instead.');

      // Fallback 2D canvas
      const canvas = canvasRef.current;
      if (canvas && containerRef.current) {
        canvas.width = containerRef.current.clientWidth;
        canvas.height = containerRef.current.clientHeight;

        try {
          audioEngine = makeAudioEngine();
          audioRef.current = audioEngine;
          audioStartedRef.current = true;
        } catch {
          // audio not available
        }

        canvas2DCleanup = runCanvas2DFlock(canvas, () => {
          if (ghostActiveRef.current) {
            const t = clockRef.current;
            const split = ghostSplitPhase(t);
            const p1 = ghostPos(t);
            const atts: Attractor[] = [{ ...p1, strength: 0.7 }];
            if (split > 0.25) atts.push({ ...ghostPos2(t), strength: split * 0.65 });
            return atts;
          }
          return userAttractorsRef.current;
        });

        // Tick clock for ghost
        let animId = 0;
        let lastTs = 0;
        function tickClock(ts: number) {
          animId = requestAnimationFrame(tickClock);
          clockRef.current += (ts - lastTs) / 1000;
          lastTs = ts;
        }
        animId = requestAnimationFrame(tickClock);

        return () => {
          if (canvas2DCleanup) canvas2DCleanup();
          cancelAnimationFrame(animId);
          if (audioEngine) audioEngine.dispose();
        };
      }
    }

    // Nothing happened
    return () => {};
  }, [started]);

  // ── Unmount cleanup ───────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (threeRef.current) threeRef.current.cleanup();
      if (audioRef.current) audioRef.current.dispose();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#0d0b2a] overflow-hidden select-none">
      {/* Sky scene container */}
      <div
        ref={containerRef}
        className="absolute inset-0"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={() => handlePointerUp()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: 'none' }}
      >
        {/* Fallback 2D canvas */}
        {webglFailed && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />
        )}
      </div>

      {/* Error notice */}
      {error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-violet-300 text-base px-4 py-2 bg-black/40 rounded-lg pointer-events-none">
          {error}
        </div>
      )}

      {/* Start screen overlay */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0b2a]/95 px-6">
          <div className="max-w-sm text-center space-y-6">
            <h1 className="text-3xl font-semibold text-foreground leading-snug">
              Sky Murmuration
            </h1>
            <p className="text-base text-muted-foreground">
              Thousands of starlings swirl in the dusk sky — touch to shepherd them, and hear them sing.
            </p>
            <button
              onClick={handleStart}
              className="
                inline-flex items-center justify-center
                min-h-[64px] min-w-[180px]
                px-8 py-4
                bg-violet-500/20 hover:bg-violet-500/35
                border border-violet-400/40 hover:border-violet-300/60
                text-violet-300 text-xl font-semibold
                rounded-2xl
                transition-all duration-200
                active:scale-95
              "
            >
              Begin
            </button>
            <p className="text-sm text-muted-foreground">
              Touch and guide the flock. Two fingers split it into harmonies.
            </p>
          </div>
        </div>
      )}

      {/* Corner hint — only shown after start */}
      {started && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-muted-foreground text-sm font-mono tracking-wide">
            touch to shepherd · two fingers to split
          </span>
        </div>
      )}

      {/* Design notes link */}
      <div className="absolute top-4 right-4 z-10">
        <Link
          href="/dream/537-kids-sky-murmuration/README.md"
          className="text-muted-foreground hover:text-violet-300 text-sm font-mono transition-colors"
          target="_blank"
        >
          design notes ↗
        </Link>
      </div>

      {/* Title badge — fades after start */}
      <div
        className={`
          absolute top-4 left-4 z-10 transition-opacity duration-1000
          ${started ? 'opacity-0 pointer-events-none' : 'opacity-100'}
        `}
      >
        <span className="text-violet-300 text-sm font-mono">537</span>
      </div>
    </div>
  );
}
