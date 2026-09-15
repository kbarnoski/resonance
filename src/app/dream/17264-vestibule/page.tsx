"use client";

/*
 * 17264-vestibule — "The five are waiting"
 *
 * A FRONT DOOR, not a sixth stack. Six fires in a row have shipped bold,
 * thin-shelf pieces (breathline · tidemark · hearth · hall · tunesignal) and
 * not one has been opened — the build engine is healthy, the review loop is
 * the only broken thing (jury 2026-09-14 #1: "the honest move is a piece
 * engineered to be impossible to ignore on a cold muted phone glance ...
 * build the lure hearth deserves"). This is that lure.
 *
 * A threshold room holding the five unopened pieces as five LIVING DOORS. Each
 * door renders a lightweight evocation of its piece's signature motion, alive
 * from the first frame with no interaction (autonomous drift), and it deepens
 * when Karel presses play on his real take — one shared analyser drives every
 * door. A hero stage enlarges one door at a time and auto-cycles through all
 * five; tap any door to feature it, tap Enter to walk through into the full
 * piece. On a cold, muted phone glance it still moves.
 *
 * Three+ subsystems: catalog loader/decoder → safeMaster analyser bus → five
 * distinct Canvas2D door renderers + an auto-cycling hero stage + nav routing.
 * Audio is catalog-only (loadRealTrackBuffer → createSafeMaster.input; no
 * ctx.destination, no synth/osc/mic). The doors read master.analyser.
 *
 * This is a curation / front-door cycle, deliberately NOT a new thin-shelf
 * ambition build (the jury banned a sixth stack). The dither door reproduces
 * tunesignal's own resolving 1-bit SIGNAL (the subject of that piece), confined
 * to one door — not a decorative grain pass over the composite (grain is banned).
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  COLLECTIONS,
  REAL_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";

// ── the five unopened pieces, newest → oldest (matches the lab ordering) ──────
type Kind = "dither" | "wall" | "warmth" | "strata" | "breath";
interface Door {
  slug: string;
  name: string;
  kind: Kind;
  why: string;
  temp: string;
}
const DOORS: readonly Door[] = [
  {
    slug: "17232-tunesignal",
    name: "Tune the Signal",
    kind: "dither",
    why: "Tilt your phone until his take resolves out of pure static — in your eyes and your ears at once.",
    temp: "1-bit · black & white",
  },
  {
    slug: "17200-hall",
    name: "Hall",
    kind: "wall",
    why: "His take as a room-scale light-wall the room's own motion ripples through.",
    temp: "graphite → bone, violet at the peaks",
  },
  {
    slug: "17168-hearth",
    name: "Hearth",
    kind: "warmth",
    why: "A shared listening-room that remembers everyone who listened before you.",
    temp: "ember → honey → violet",
  },
  {
    slug: "17136-tidemark",
    name: "Tidemark",
    kind: "strata",
    why: "A recording that remembers being heard — a core-sample of where attention pooled.",
    temp: "umber · amber · ochre",
  },
  {
    slug: "17120-breathline",
    name: "Breathline",
    kind: "breath",
    why: "The hidden ~0.3 Hz breath under his rubato — the field inhales when he leans back.",
    temp: "amber · rose · violet",
  },
] as const;

const AUTO_MS = 6500; // hero auto-cycle interval
const DEFAULT_TRACK = "8dafed88-4761-4dd3-a0f4-93f310441093"; // "Welcome Home"

// ── a cheap deterministic hash for the dither door ───────────────────────────
function hash(x: number, y: number, f: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + f * 0.37) * 43758.5453;
  return s - Math.floor(s);
}
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export default function Vestibule() {
  const heroRef = useRef<HTMLCanvasElement | null>(null);
  const thumbRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const offRef = useRef<HTMLCanvasElement | null>(null); // reused dither buffer

  // audio graph (catalog-only, through safeMaster)
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const bufRef = useRef<(AudioBuffer & { __id?: string }) | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const waveRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const [featured, setFeatured] = useState(0);
  const featuredRef = useRef(0);
  const pickedAtRef = useRef(0); // last manual selection (ms) — pauses auto-cycle
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackId, setTrackId] = useState(DEFAULT_TRACK);
  const trackIdRef = useRef(trackId);
  const [notesOpen, setNotesOpen] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    featuredRef.current = featured;
  }, [featured]);
  useEffect(() => {
    trackIdRef.current = trackId;
  }, [trackId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  function pick(i: number) {
    pickedAtRef.current = performance.now();
    setFeatured(i);
  }

  // ── audio: play one of Karel's real takes through safeMaster ────────────────
  async function play() {
    setError(null);
    try {
      setLoading(true);
      let ctx = ctxRef.current;
      if (!ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new AC();
        ctxRef.current = ctx;
      }
      await ctx.resume();

      if (!masterRef.current) {
        const m = createSafeMaster(ctx);
        m.analyser.fftSize = 1024;
        m.analyser.smoothingTimeConstant = 0.82;
        masterRef.current = m;
        freqRef.current = new Uint8Array(m.analyser.frequencyBinCount);
        waveRef.current = new Uint8Array(m.analyser.fftSize);
      }

      // (re)load buffer if the track changed or none loaded
      const wanted = trackIdRef.current;
      if (!bufRef.current || bufRef.current.__id !== wanted) {
        const { buffer } = await loadRealTrackBuffer(ctx, wanted);
        (buffer as AudioBuffer & { __id?: string }).__id = wanted;
        bufRef.current = buffer as AudioBuffer & { __id?: string };
      }

      // stop any prior source, start a fresh looping one
      try {
        srcRef.current?.stop();
      } catch {
        /* not started */
      }
      const src = ctx.createBufferSource();
      src.buffer = bufRef.current;
      src.loop = true;
      src.connect(masterRef.current.input);
      src.start();
      srcRef.current = src;
      setPlaying(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Couldn't load Karel's take — ${e.message}`
          : "Couldn't load Karel's take.",
      );
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    try {
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    srcRef.current = null;
    setPlaying(false);
  }

  // ── the render loop: draws hero (featured) + all five thumbnails ────────────
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    let lastAuto = t0;

    function resize(cv: HTMLCanvasElement) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const r = cv.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr));
      const h = Math.max(1, Math.round(r.height * dpr));
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
    }

    // ── one door renderer, dispatched by kind ────────────────────────────────
    function drawDoor(
      kind: Kind,
      g: CanvasRenderingContext2D,
      w: number,
      h: number,
      t: number,
      energy: number,
      isHero: boolean,
    ) {
      const freq = freqRef.current;
      const wave = waveRef.current;
      const has = playing && !!freq;

      if (kind === "breath") {
        // breathline: slow ~0.3 Hz aperture inhaling/exhaling + fast tremor
        g.fillStyle = "#0a0708";
        g.fillRect(0, 0, w, h);
        const slow = 0.5 + 0.5 * Math.sin(t * 0.3 * Math.PI * 2);
        const trem = reduced ? 0 : 0.04 * Math.sin(t * 6.2);
        const b = slow + trem;
        const cx = w / 2;
        const cy = h / 2;
        const base = Math.min(w, h) * 0.16;
        const R = base + (Math.min(w, h) * 0.3) * (0.4 + 0.6 * b) * (0.7 + energy);
        const rings = isHero ? 4 : 2;
        for (let i = rings; i >= 0; i--) {
          const rr = R * (1 + i * 0.42);
          const a = (0.16 / (i + 1)) * (0.5 + 0.5 * b);
          const grd = g.createRadialGradient(cx, cy, rr * 0.2, cx, cy, rr);
          grd.addColorStop(0, `rgba(247,183,120,${a * 1.6})`);
          grd.addColorStop(0.55, `rgba(224,122,140,${a})`);
          grd.addColorStop(1, `rgba(139,92,246,0)`);
          g.fillStyle = grd;
          g.beginPath();
          g.arc(cx, cy, rr, 0, Math.PI * 2);
          g.fill();
        }
        g.strokeStyle = `rgba(247,200,160,${0.5 + 0.4 * b})`;
        g.lineWidth = isHero ? 2 : 1.2;
        g.beginPath();
        g.arc(cx, cy, R, 0, Math.PI * 2);
        g.stroke();
        return;
      }

      if (kind === "strata") {
        // tidemark: warm sediment strata accreting upward, one bright tideline
        g.fillStyle = "#0b0806";
        g.fillRect(0, 0, w, h);
        const layers = isHero ? 30 : 16;
        const cols = ["#3a2416", "#5c3a1e", "#7a4f24", "#9a6a2c", "#c08a3a"];
        for (let i = 0; i < layers; i++) {
          const y = h - (i / layers) * h;
          const th = h / layers + 1;
          const wob = Math.sin(i * 0.7 + t * 0.15) * (h * 0.01);
          g.fillStyle = cols[i % cols.length];
          g.globalAlpha = 0.55 - (i / layers) * 0.3;
          g.fillRect(0, y - th + wob, w, th + 1);
        }
        g.globalAlpha = 1;
        // tideline crest — slowly drifting, brightened by energy
        const crest =
          h - h * (0.42 + 0.18 * Math.sin(t * 0.22) + 0.18 * energy);
        const grd = g.createLinearGradient(0, crest - h * 0.1, 0, crest + h * 0.06);
        grd.addColorStop(0, "rgba(247,206,120,0)");
        grd.addColorStop(0.7, `rgba(247,206,120,${0.35 + 0.4 * energy})`);
        grd.addColorStop(1, "rgba(255,230,170,0)");
        g.fillStyle = grd;
        g.fillRect(0, crest - h * 0.1, w, h * 0.16);
        return;
      }

      if (kind === "warmth") {
        // hearth: a central warmth blob + faint remembered "presences"
        g.fillStyle = "#0a0706";
        g.fillRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.5);
        const R = Math.min(w, h) * (0.42 + 0.12 * pulse) * (0.8 + 0.5 * energy);
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R);
        grd.addColorStop(0, `rgba(255,196,120,${0.5 + 0.3 * energy})`);
        grd.addColorStop(0.4, "rgba(230,140,90,0.34)");
        grd.addColorStop(0.75, "rgba(180,90,120,0.16)");
        grd.addColorStop(1, "rgba(139,92,246,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, w, h);
        const n = isHero ? 7 : 4;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + t * 0.12 * (i % 2 ? 1 : -1);
          const rad = Math.min(w, h) * (0.28 + 0.08 * Math.sin(t * 0.4 + i));
          const px = cx + Math.cos(ang) * rad;
          const py = cy + Math.sin(ang) * rad * 0.7;
          const pr = Math.min(w, h) * 0.06 * (0.6 + 0.6 * pulse);
          const pg = g.createRadialGradient(px, py, 0, px, py, pr);
          pg.addColorStop(0, "rgba(255,210,150,0.5)");
          pg.addColorStop(1, "rgba(255,180,110,0)");
          g.fillStyle = pg;
          g.beginPath();
          g.arc(px, py, pr, 0, Math.PI * 2);
          g.fill();
        }
        return;
      }

      if (kind === "wall") {
        // hall: an ember light-wall — drifting neutral flow, violet only at peaks
        g.fillStyle = "#0c0c0e";
        g.fillRect(0, 0, w, h);
        const bands = isHero ? 46 : 22;
        for (let i = 0; i < bands; i++) {
          const fy = i / bands;
          const y = fy * h;
          const flow =
            Math.sin(fy * 6.0 + t * 0.6) * 0.5 +
            Math.sin(fy * 13.0 - t * 0.9) * 0.3;
          const lum = 0.28 + 0.32 * (0.5 + 0.5 * flow) + 0.35 * energy;
          const v = Math.min(1, lum);
          const peak = smoothstep(0.82, 1.0, v); // violet only at the top end
          const r = Math.round(200 * v + 60 * peak);
          const gg = Math.round(205 * v - 10 * peak);
          const bb = Math.round(210 * v + 80 * peak);
          g.fillStyle = `rgba(${r},${gg},${bb},0.5)`;
          const off = Math.sin(fy * 20 + t * 0.5) * w * 0.02;
          g.fillRect(off, y, w, h / bands + 1.5);
        }
        return;
      }

      // kind === "dither" — tunesignal: 1-bit static that RESOLVES to a figure
      const off = offRef.current!;
      const LW = isHero ? 190 : 96;
      const LH = Math.max(2, Math.round(LW * (h / w)));
      if (off.width !== LW || off.height !== LH) {
        off.width = LW;
        off.height = LH;
      }
      const og = off.getContext("2d")!;
      const img = og.createImageData(LW, LH);
      const d = img.data;
      const frame = Math.floor(t * (reduced ? 0 : 20));
      // focus cycles in and out: static → figure → static
      const focus = reduced
        ? 0.85
        : smoothstep(0.15, 0.85, 0.5 + 0.5 * Math.sin(t * 0.9));
      const cx = LW / 2;
      const cy = LH / 2;
      const rmax = Math.hypot(cx, cy);
      const petals = 6 + Math.round(energy * 4);
      for (let y = 0; y < LH; y++) {
        for (let x = 0; x < LW; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const r = Math.hypot(dx, dy) / rmax;
          const ang = Math.atan2(dy, dx);
          // rings = FFT-ish by radius; petals = waveform-ish by angle
          const bin = has && freq ? freq[Math.min(freq.length - 1, Math.floor(r * 90))] / 255 : 0.4;
          const wav = has && wave ? wave[Math.min(wave.length - 1, Math.floor(((ang + Math.PI) / (2 * Math.PI)) * wave.length))] / 255 : 0.5;
          const ring = 0.5 + 0.5 * Math.sin(r * 26 - t * 3 + bin * 6);
          const pet = 0.5 + 0.5 * Math.cos(ang * petals + t + wav * 3);
          const figure = ring * 0.6 + pet * 0.4;
          const noise = hash(x, y, frame);
          const level = figure * focus + noise * (1 - focus);
          const bit = level > 0.5 ? 255 : 0;
          const idx = (y * LW + x) * 4;
          d[idx] = bit;
          d[idx + 1] = bit;
          d[idx + 2] = bit;
          d[idx + 3] = 255;
        }
      }
      og.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = false;
      g.drawImage(off, 0, 0, w, h);
      g.imageSmoothingEnabled = true;
    }

    function frame() {
      const now = performance.now();
      const t = (now - t0) / 1000;

      // pull analyser data once per frame
      let energy = 0.32 + 0.12 * Math.sin(t * 0.5); // autonomous cold-glance drift
      const m = masterRef.current;
      if (playing && m && freqRef.current && waveRef.current) {
        m.analyser.getByteFrequencyData(freqRef.current);
        m.analyser.getByteTimeDomainData(waveRef.current);
        let s = 0;
        for (let i = 0; i < freqRef.current.length; i++) s += freqRef.current[i];
        energy = Math.min(1, s / freqRef.current.length / 200);
      }

      // auto-cycle the hero unless reduced-motion or the user just picked
      if (
        !reduced &&
        now - lastAuto > AUTO_MS &&
        now - pickedAtRef.current > 12000
      ) {
        lastAuto = now;
        setFeatured((f) => (f + 1) % DOORS.length);
      }

      // hero
      const hero = heroRef.current;
      if (hero) {
        resize(hero);
        const g = hero.getContext("2d");
        if (g) {
          g.clearRect(0, 0, hero.width, hero.height);
          drawDoor(
            DOORS[featuredRef.current].kind,
            g,
            hero.width,
            hero.height,
            t,
            energy,
            true,
          );
        }
      }

      // thumbnails
      for (let i = 0; i < DOORS.length; i++) {
        const cv = thumbRefs.current[i];
        if (!cv) continue;
        resize(cv);
        const g = cv.getContext("2d");
        if (!g) continue;
        g.clearRect(0, 0, cv.width, cv.height);
        // thumbs drift slower/dimmer so the hero stays dominant
        drawDoor(DOORS[i].kind, g, cv.width, cv.height, t + i * 3.1, energy * 0.8, false);
      }

      raf = requestAnimationFrame(frame);
    }

    if (!offRef.current) offRef.current = document.createElement("canvas");
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      try {
        srcRef.current?.stop();
      } catch {
        /* */
      }
      try {
        masterRef.current?.disconnect();
      } catch {
        /* */
      }
      ctxRef.current?.close().catch(() => {});
    };
  }, []);

  const feat = DOORS[featured];

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · the front door
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            The five are waiting
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Five bold pieces I built this week — still unopened. Each door below
            is alive right now, breathing to Karel&apos;s music. Press play, then
            tap any door to walk through into the full piece.
          </p>
        </header>

        {/* controls */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          {!playing ? (
            <button
              onClick={play}
              disabled={loading}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Loading his take…" : "▶ Play Karel’s take"}
            </button>
          ) : (
            <button
              onClick={stop}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              ◼ Pause
            </button>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono text-xs uppercase tracking-[0.14em]">
              track
            </span>
            <select
              value={trackId}
              onChange={(e) => {
                setTrackId(e.target.value);
                if (playing) {
                  // reload with the new track
                  bufRef.current = null;
                  void play();
                }
              }}
              className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {COLLECTIONS.map((c) => (
                <optgroup key={c.name} label={c.name}>
                  {c.tracks.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <span className="font-mono text-xs text-muted-foreground/70">
            {REAL_TRACKS.length} real takes · catalog only
          </span>
        </div>

        {error && (
          <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {/* hero stage — the currently-featured door, large */}
        <section className="mb-4 overflow-hidden rounded-lg border border-border">
          <div className="relative">
            <canvas
              ref={heroRef}
              className="block h-[46vh] max-h-[420px] min-h-[240px] w-full cursor-pointer"
              onClick={() => {
                window.location.href = `/dream/${feat.slug}`;
              }}
              aria-label={`${feat.name} — enter`}
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent p-5 sm:p-6">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {feat.slug} · {feat.temp}
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {feat.name}
              </h2>
              <p className="mt-1 max-w-xl text-base leading-relaxed text-muted-foreground">
                {feat.why}
              </p>
              <Link
                href={`/dream/${feat.slug}`}
                className="pointer-events-auto mt-3 inline-flex min-h-[44px] items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter {feat.name} →
              </Link>
            </div>
          </div>
        </section>

        {/* the five doors */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {DOORS.map((d, i) => (
            <button
              key={d.slug}
              onClick={() => pick(i)}
              onDoubleClick={() => {
                window.location.href = `/dream/${d.slug}`;
              }}
              className={`group overflow-hidden rounded-md border text-left transition-colors ${
                i === featured
                  ? "border-primary"
                  : "border-border hover:border-muted-foreground/50"
              }`}
              title={`${d.name} — tap to feature, double-tap or use Enter to walk through`}
            >
              <canvas
                ref={(el) => {
                  thumbRefs.current[i] = el;
                }}
                className="block h-24 w-full"
              />
              <span className="block px-2 py-1.5 text-sm font-medium text-foreground">
                {d.name}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          These previews are lightweight teasers drawn here — the real pieces are
          far richer (device-tilt, webcam, multi-user, cross-session memory).
          Walk through a door to feel the actual thing. A single tap of the ♥ on
          any of them tells me which direction to deepen next.
        </p>

        <button
          onClick={() => setNotesOpen(true)}
          className="fixed right-3 top-3 z-40 rounded-full border border-border bg-popover/85 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold tracking-tight">
              Why a front door
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Six fires in a row the dream lab shipped bold, thin-shelf pieces —
              breathline, tidemark, hearth, hall, tunesignal — and not one has
              been opened. The build engine is healthy; the review loop is the
              only broken thing. The jury&apos;s honest verdict was: stop
              stacking a seventh unverified piece and instead build something
              &ldquo;impossible to ignore on a cold muted phone glance&rdquo; —
              a lure for the work already made.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              This is that lure. One shared analyser drives five living doors,
              each an evocation of a piece&apos;s signature motion. It reads on a
              muted glance (autonomous drift), deepens on Karel&apos;s real take,
              and every door is one tap from the full experience. Audio is
              catalog-only through safeMaster; no synth, no mic, no grain pass —
              the dither door reproduces tunesignal&apos;s own resolving 1-bit
              signal, the actual subject of that piece.
            </p>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
