"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 618 · Solar Organ — the real solar wind hitting Earth right now plays an
// inharmonic magnetospheric organ while you watch the aurora it is driving.
//
// Live NOAA SWPC feeds (Kp / IMF Bz / plasma) are parsed into a 24h series; a
// playhead sweeps them, sonifying speed→pitch, southward-Bz→opening/brightness,
// Kp→dissonance, density→texture, over a WGSL curl-noise aurora (Canvas2D
// fallback). Falls back to a synthetic geomagnetic storm if any feed fails.
//
// Refs (see README): Andrea Polli · Sonic Antarctica · atmospheric sonification;
// auroral substorm physics — the Dungey cycle & southward-Bz reconnection;
// Robert Bridson — curl noise.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadSpaceWeather,
  makeSyntheticStorm,
  type StormFrame,
} from "./space-weather";
import { SolarOrgan } from "./audio";
import { makeAurora, type AuroraRenderer, type Backend } from "./aurora";

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// sample the 24h series at a fractional playhead position with interpolation.
function sampleFrame(frames: StormFrame[], pos: number): StormFrame {
  if (frames.length === 0) {
    return { t: Date.now(), kp: 1, bz: 0, bt: 3, speed: 400, density: 3 };
  }
  const x = clamp(pos, 0, 1) * (frames.length - 1);
  const i = Math.floor(x);
  const j = Math.min(frames.length - 1, i + 1);
  const f = x - i;
  const a = frames[i];
  const b = frames[j];
  return {
    t: lerp(a.t, b.t, f),
    kp: lerp(a.kp, b.kp, f),
    bz: lerp(a.bz, b.bz, f),
    bt: lerp(a.bt, b.bt, f),
    speed: lerp(a.speed, b.speed, f),
    density: lerp(a.density, b.density, f),
  };
}

const fmtUTC = (ms: number) =>
  new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z";

export default function SolarOrganPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const organRef = useRef<SolarOrgan | null>(null);
  const auroraRef = useRef<AuroraRenderer | null>(null);
  const framesRef = useRef<StormFrame[]>(makeSyntheticStorm());
  const rafRef = useRef<number>(0);
  const startWallRef = useRef<number>(0);
  const playingRef = useRef(false);
  const volRef = useRef(0.8);
  const mutedRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [backend, setBackend] = useState<Backend | null>(null);
  const [synthetic, setSynthetic] = useState(true);
  const [note, setNote] = useState("loading live space weather…");
  const [vol, setVol] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [hud, setHud] = useState({
    t: Date.now(),
    kp: 1,
    bz: 0,
    speed: 400,
    pos: 0,
  });

  // ── fetch live data once on mount (non-blocking; synthetic plays meanwhile) ──
  useEffect(() => {
    let alive = true;
    loadSpaceWeather().then((s) => {
      if (!alive) return;
      framesRef.current = s.frames;
      setSynthetic(s.synthetic);
      setNote(s.note);
    });
    return () => {
      alive = false;
    };
  }, []);

  // ── set up the aurora renderer (alive from frame one, even before audio) ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let ren: AuroraRenderer | null = null;

    makeAurora(canvas).then((r) => {
      if (disposed) {
        r.dispose();
        return;
      }
      ren = r;
      auroraRef.current = r;
      setBackend(r.backend);
    });

    const onResize = () => auroraRef.current?.resize();
    window.addEventListener("resize", onResize);

    // The 24h sweep takes ~75s, then loops. Visual runs even while paused.
    const SWEEP_SEC = 75;
    const loop = () => {
      const now = performance.now() / 1000;
      const r = auroraRef.current;
      if (r) {
        const elapsed = playingRef.current
          ? now - startWallRef.current
          : now; // idle drift so the curtain breathes before start
        const pos = (elapsed % SWEEP_SEC) / SWEEP_SEC;
        const fr = sampleFrame(framesRef.current, pos);
        const south = clamp(-fr.bz / 16, 0, 1);
        const kpN = clamp(fr.kp / 9, 0, 1);
        const speedN = clamp((fr.speed - 300) / 500, 0, 1);
        const densN = clamp(fr.density / 18, 0, 1);
        r.render(now, { south, kp: kpN, speed: speedN, density: densN });

        if (playingRef.current) {
          organRef.current?.update({
            speed: fr.speed,
            bz: fr.bz,
            kp: fr.kp,
            density: fr.density,
          });
          setHud({ t: fr.t, kp: fr.kp, bz: fr.bz, speed: fr.speed, pos });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      ren?.dispose();
      auroraRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    if (playingRef.current) return;
    if (!organRef.current) organRef.current = new SolarOrgan();
    await organRef.current.start();
    organRef.current.setVolume(mutedRef.current ? 0 : volRef.current);
    startWallRef.current = performance.now() / 1000;
    playingRef.current = true;
    setPlaying(true);
  }, []);

  // ── autostart after ~2.5s idle so a silent glance hears + sees the piece ─────
  useEffect(() => {
    const id = setTimeout(() => {
      if (!playingRef.current) void start();
    }, 2500);
    return () => clearTimeout(id);
  }, [start]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      organRef.current?.close();
      organRef.current = null;
    };
  }, []);

  const applyVolume = useCallback((v: number, m: boolean) => {
    volRef.current = v;
    mutedRef.current = m;
    organRef.current?.setVolume(m ? 0 : v);
  }, []);

  const kpColor = (kp: number) =>
    kp >= 6 ? "text-violet-300" : kp >= 4 ? "text-violet-200" : "text-foreground";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* top HUD */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-start justify-between p-4 sm:p-6">
        <div className="max-w-[60%]">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Solar Organ
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            The solar wind hitting Earth right now, played as an inharmonic
            organ over the aurora it drives.
          </p>
          {synthetic ? (
            <p className="mt-2 text-base text-violet-300">
              Using sample data — {note}
            </p>
          ) : (
            <p className="mt-2 text-base text-muted-foreground">{note}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 font-mono text-base text-muted-foreground">
          <span className="rounded bg-muted px-2 py-1 text-foreground">
            {backend ? backend.toUpperCase() : "INIT…"}
          </span>
        </div>
      </div>

      {/* bottom HUD: live numbers + playhead + controls */}
      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-base">
          <span className="text-muted-foreground">
            UTC{" "}
            <span className="text-foreground">{fmtUTC(hud.t)}</span>
          </span>
          <span className="text-muted-foreground">
            Kp{" "}
            <span className={kpColor(hud.kp)}>{hud.kp.toFixed(1)}</span>
          </span>
          <span className="text-muted-foreground">
            Bz{" "}
            <span
              className={
                hud.bz < -6 ? "text-violet-300" : "text-foreground"
              }
            >
              {hud.bz >= 0 ? "+" : ""}
              {hud.bz.toFixed(1)} nT
            </span>
          </span>
          <span className="text-muted-foreground">
            wind{" "}
            <span className="text-foreground">{Math.round(hud.speed)} km/s</span>
          </span>
        </div>

        {/* playhead over the 24h sweep */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-300 via-violet-300 to-violet-300 transition-[width] duration-75"
            style={{ width: `${(playing ? hud.pos : 0) * 100}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!playing ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base font-semibold text-black transition hover:bg-card"
            >
              ▶ Play the storm
            </button>
          ) : (
            <button
              onClick={() => {
                const m = !muted;
                setMuted(m);
                applyVolume(vol, m);
              }}
              className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base font-semibold text-foreground transition hover:bg-accent"
            >
              {muted ? "🔇 Muted" : "🔊 Sounding"}
            </button>
          )}

          <label className="flex min-h-[44px] items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-base text-muted-foreground">
            <span>VOL</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={vol}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVol(v);
                applyVolume(v, muted);
              }}
              className="w-28 accent-violet-300"
            />
          </label>
        </div>
      </div>

      {/* design-notes link */}
      <Link
        href="/dream/618-solar-organ/README.md"
        className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 font-mono text-base text-muted-foreground hover:text-foreground"
      >
        Read the design notes →
      </Link>
    </main>
  );
}
