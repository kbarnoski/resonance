"use client";

// ════════════════════════════════════════════════════════════════════════════
// Signal (2494) — "What does humanity talking to its robots across the solar
// system, right now, actually sound like?"
//
// A LIVE sonification + visualization of NASA's Deep Space Network. Three giant
// antenna complexes (Goldstone, Madrid, Canberra) are, at this moment, trading
// radio with spacecraft scattered across the solar system. Each active link is
// a sustained musical voice; the network's real configuration is the score.
// The visitor doesn't play it — the solar system does. You shape the listening.
//
// Data: eyes.nasa.gov/dsn (public), proxied server-side via ./api to dodge CORS.
// If the feed is unreachable, a deterministic synthetic DSN keeps it alive.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DsnSignal,
  DsnSnapshot,
  craftLabel,
  formatDataRate,
  formatLightTime,
  signalStrength,
  spaceDepth,
  stationPan,
  syntheticSnapshot,
} from "./model";
import { SignalEngine } from "./engine";
import { VIOLET, INDIGO, MAGENTA } from "../_shared/palette";

const REFRESH_MS = 10_000;

// Deterministic hash → angle for placing a spacecraft in the sky.
function hashAngle(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

interface CraftNode {
  spacecraft: string;
  label: string;
  x: number;
  y: number;
  lightSeconds: number;
  bands: Set<string>;
  hasDown: boolean;
  hasUp: boolean;
  strength: number;
}

export default function SignalPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SignalEngine | null>(null);
  const snapRef = useRef<DsnSnapshot>(syntheticSnapshot());
  const rafRef = useRef<number>(0);
  const dashRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [snap, setSnap] = useState<DsnSnapshot>(snapRef.current);
  const [showNotes, setShowNotes] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Fetch the live DSN, fall back to synthetic on any failure ──────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/dream/2494-signal/api", { method: "POST" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as {
        stations: DsnSnapshot["stations"];
        signals: DsnSignal[];
        fetchedAt: number;
      };
      if (!data.signals || data.signals.length === 0) {
        throw new Error("no active signals");
      }
      const next: DsnSnapshot = {
        stations: data.stations,
        signals: data.signals,
        fetchedAt: data.fetchedAt,
        synthetic: false,
      };
      snapRef.current = next;
      setSnap(next);
      engineRef.current?.update(next.signals);
    } catch {
      const fallback = syntheticSnapshot();
      snapRef.current = fallback;
      setSnap(fallback);
      engineRef.current?.update(fallback.signals);
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll on an interval once running.
  useEffect(() => {
    if (!started) return;
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [started, refresh]);

  const begin = useCallback(async () => {
    const engine = new SignalEngine();
    engineRef.current = engine;
    await engine.start();
    engine.update(snapRef.current.signals);
    setStarted(true);
  }, []);

  // Tear the audio down on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  // ── Canvas render loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const runResize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    runResize();
    window.addEventListener("resize", runResize);

    const starSeed = Array.from({ length: 140 }, (_, i) => ({
      x: hashAngle(`sx${i}`),
      y: hashAngle(`sy${i}`),
      a: 0.15 + hashAngle(`sa${i}`) * 0.5,
    }));

    const drawFrame = (now: number) => {
      const snapshot = snapRef.current;
      dashRef.current += 0.6;
      const dash = dashRef.current;

      // Background wash.
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, VIOLET[950]);
      bg.addColorStop(1, "#050308");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Starfield.
      for (const s of starSeed) {
        const tw = 0.6 + 0.4 * Math.sin(now * 0.001 + s.x * 40);
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = "#c4b5fd";
        ctx.fillRect(s.x * W, s.y * H * 0.82, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;

      // Earth arc + station nodes near the bottom.
      const earthCx = W * 0.5;
      const earthCy = H * 1.06;
      const earthR = Math.min(W, H) * 0.62;
      ctx.beginPath();
      ctx.arc(earthCx, earthCy, earthR, Math.PI, 2 * Math.PI);
      const eg = ctx.createLinearGradient(0, H - earthR * 0.2, 0, H);
      eg.addColorStop(0, "rgba(99,102,241,0.18)");
      eg.addColorStop(1, "rgba(10,7,20,0.9)");
      ctx.fillStyle = eg;
      ctx.fill();
      ctx.strokeStyle = "rgba(167,139,250,0.35)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Station screen positions.
      const stationX: Record<string, number> = {
        gdscc: W * 0.22,
        mdscc: W * 0.5,
        cdscc: W * 0.78,
      };
      const stationY = H * 0.9;
      const stationLabel: Record<string, string> = {
        gdscc: "GOLDSTONE",
        mdscc: "MADRID",
        cdscc: "CANBERRA",
      };

      // Build craft nodes (one per spacecraft), placed by light-time (radius)
      // and a stable hashed angle (azimuth in the upper sky).
      const nodes = new Map<string, CraftNode>();
      const reach = Math.min(W, H) * 0.86;
      for (const sig of snapshot.signals) {
        let node = nodes.get(sig.spacecraft);
        if (!node) {
          const t = hashAngle(sig.spacecraft);
          const ang = -Math.PI / 2 + (t - 0.5) * (Math.PI * 0.92);
          const rNorm = Math.min(
            1,
            Math.log10(sig.lightSeconds + 2) / Math.log10(90000),
          );
          const r = reach * (0.16 + rNorm * 0.84);
          node = {
            spacecraft: sig.spacecraft,
            label: craftLabel(sig),
            x: earthCx + Math.cos(ang) * r * 1.05,
            y: stationY + Math.sin(ang) * r,
            lightSeconds: sig.lightSeconds,
            bands: new Set(),
            hasDown: false,
            hasUp: false,
            strength: 0,
          };
          nodes.set(sig.spacecraft, node);
        }
        node.bands.add(sig.band);
        if (sig.direction === "down") node.hasDown = true;
        else node.hasUp = true;
        node.strength = Math.max(node.strength, signalStrength(sig));
      }

      // Keep craft on-screen.
      for (const n of nodes.values()) {
        n.x = Math.max(60, Math.min(W - 60, n.x));
        n.y = Math.max(52, Math.min(H * 0.82, n.y));
      }

      // Beams: one per active signal, station node → craft node.
      for (const sig of snapshot.signals) {
        const node = nodes.get(sig.spacecraft);
        if (!node) continue;
        const sx = stationX[sig.stationCode] ?? W * 0.5;
        const sy = stationY;
        const isDown = sig.direction === "down";
        const str = signalStrength(sig);
        const col = isDown ? INDIGO : MAGENTA;

        // Beam glow.
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.1 + str * 0.28;
        ctx.lineWidth = 0.8 + str * 3.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();

        // Flowing dashes in the data direction (down = toward Earth).
        const dir = isDown ? -1 : 1; // toward Earth vs away
        ctx.globalAlpha = 0.35 + str * 0.5;
        ctx.lineWidth = 1 + str * 1.6;
        ctx.setLineDash([3, 14]);
        ctx.lineDashOffset = dir * dash * (0.8 + str);
        ctx.strokeStyle = isDown ? VIOLET[200] : VIOLET[100];
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;

      // Craft nodes + labels.
      for (const n of nodes.values()) {
        const depth = spaceDepth(n.lightSeconds);
        const rad = 4 + n.strength * 5;
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rad * 4);
        glow.addColorStop(0, "rgba(196,181,253,0.9)");
        glow.addColorStop(1, "rgba(196,181,253,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, rad * 4, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = n.hasDown ? "#ede9fe" : MAGENTA;
        ctx.beginPath();
        ctx.arc(n.x, n.y, rad, 0, 2 * Math.PI);
        ctx.fill();

        ctx.font =
          "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "rgba(237,233,254,0.92)";
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y - rad - 8);
        ctx.font = "10px ui-monospace, monospace";
        ctx.fillStyle = "rgba(167,139,250,0.7)";
        ctx.fillText(
          `${[...n.bands].join("/")} · ${formatLightTime(n.lightSeconds)}${
            depth > 0.7 ? " ✦" : ""
          }`,
          n.x,
          n.y + rad + 16,
        );
      }

      // Station nodes drawn on top.
      for (const code of ["gdscc", "mdscc", "cdscc"]) {
        const sx = stationX[code];
        const pan = stationPan(code);
        ctx.fillStyle = "rgba(139,92,246,0.9)";
        ctx.beginPath();
        ctx.moveTo(sx, stationY - 9);
        ctx.lineTo(sx - 8, stationY + 6);
        ctx.lineTo(sx + 8, stationY + 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(221,214,254,0.8)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font =
          "600 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "rgba(221,214,254,0.85)";
        ctx.textAlign = "center";
        ctx.fillText(stationLabel[code], sx, stationY + 24);
        ctx.font = "9px ui-monospace, monospace";
        ctx.fillStyle = "rgba(139,138,147,0.7)";
        ctx.fillText(
          pan < 0 ? "◄ left" : pan > 0 ? "right ►" : "center",
          sx,
          stationY + 36,
        );
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", runResize);
    };
  }, []);

  // Sorted readout rows (strongest first), deduped per craft+dir+band.
  const rows = [...snap.signals]
    .sort((a, b) => signalStrength(b) - signalStrength(a))
    .slice(0, 8);

  return (
    <main className="relative h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ── Hero / start overlay ── */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-6 backdrop-blur-sm">
          <div className="max-w-lg text-center">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              NASA Deep Space Network · live
            </p>
            <h1 className="mb-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Signal
            </h1>
            <p className="mb-8 text-base leading-relaxed text-muted-foreground">
              Right now, three giant antennas — in California, Spain, and
              Australia — are trading radio with spacecraft scattered across the
              solar system. Every active link becomes one sustained voice.
              Nearby craft sound dry and present; Voyager arrives drenched in
              echo from a full light-day away. You don&apos;t play it. The solar
              system does.
            </p>
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin listening
            </button>
          </div>
        </div>
      )}

      {/* ── Live readout panel ── */}
      {started && (
        <div className="pointer-events-none absolute left-4 top-4 z-10 w-[min(90vw,340px)]">
          <div className="rounded-lg border border-border bg-background/70 p-4 backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Active links
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {snap.signals.length}
              </span>
            </div>
            <ul className="space-y-1.5">
              {rows.map((s) => (
                <li
                  key={s.id}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="truncate text-foreground">
                    {craftLabel(s)}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {s.direction === "down" ? "↓" : "↑"} {s.band} ·{" "}
                    {formatDataRate(s.dataRate)} · {formatLightTime(s.lightSeconds)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-border pt-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-muted-foreground/80">
              {snap.synthetic ? (
                <span className="text-destructive">
                  ◆ feed offline — synthetic DSN
                </span>
              ) : (
                <span>◆ live from eyes.nasa.gov/dsn</span>
              )}
              {loading ? " · refreshing…" : ""}
            </p>
          </div>
        </div>
      )}

      {/* ── Design notes affordance ── */}
      {started && (
        <button
          onClick={() => setShowNotes(true)}
          className="absolute bottom-16 right-4 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      )}

      {/* ── Design notes modal ── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Signal — design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question:</span> what does
                humanity talking to its robots across the solar system, right
                now, actually sound like?
              </p>
              <p>
                A live sonification of NASA&apos;s{" "}
                <span className="text-foreground">Deep Space Network</span> —
                the three antenna complexes (Goldstone, Madrid, Canberra) that
                keep contact with craft like Voyager, Perseverance, JWST and
                Parker Solar Probe. Their status is a public feed; each active
                radio link becomes one sustained voice.
              </p>
              <div>
                <p className="mb-1 text-foreground">Link → sound:</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li>band (L/S/X/Ka) → register, snapped to one warm scale</li>
                  <li>
                    downlink → pure breathing pad · uplink → brighter Earth tone
                  </li>
                  <li>data rate → tremolo / shimmer + brightness</li>
                  <li>
                    light-time → reverb &amp; echo depth (Voyager drenched)
                  </li>
                  <li>station → stereo pan across the field</li>
                </ul>
              </div>
              <p>
                Voices fade in as links go active and release as they drop, so
                the chord breathes when the network reconfigures. Polyphony is
                capped to the strongest ~11 links.
              </p>
              <p>
                <span className="text-foreground">No network?</span> A
                deterministic synthetic DSN (Moon relay, Mars orbiter, Parker,
                Voyager 1) keeps it alive and demoable, flagged in the readout.
              </p>
              <p className="text-sm">
                Data &amp; imagery concept courtesy{" "}
                <span className="text-foreground">NASA / JPL-Caltech</span>{" "}
                (eyes.nasa.gov/dsn). This is an independent art piece, not a NASA
                product.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
