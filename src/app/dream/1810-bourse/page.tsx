"use client";

import { useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { BourseAudio } from "./audio";
import {
  connectBinance,
  Market,
  type MarketSnapshot,
  type Trade,
} from "./market";

// Fixed sim step per frame → fully deterministic, alive with zero network.
const SIM_DT = 1 / 60;
const TAPE_ROWS = 26; // visible rows of the scrolling trade matrix
const TAPE_MAX = 220; // ring-buffer depth
const ROW_H = 20; // px per tape row

type FlashMark = { x: number; y: number; born: number; side: Trade["side"]; strong: boolean };

type Readout = { regime: number; tps: number };

export default function BoursePage() {
  const [started, setStarted] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<Readout>({ regime: 0.35, tps: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const marketRef = useRef<Market | null>(null);
  const audioRef = useRef<BourseAudio | null>(null);
  const snapshotRef = useRef<MarketSnapshot | null>(null);
  const tapeRef = useRef<Trade[]>([]);
  const flashesRef = useRef<FlashMark[]>([]);
  const frameRef = useRef(0);
  const reducedRef = useRef(false);
  const disposeLiveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext("2d") ?? null;
    if (!canvas || !ctx2d) {
      setUnsupported(true);
      return;
    }

    const market = new Market();
    marketRef.current = market;
    snapshotRef.current = market.snapshot();

    // ---- best-effort live feed (never blocks; sim keeps playing) ----
    try {
      disposeLiveRef.current = connectBinance(
        (symbol, price, size, side) => market.pushLiveTrade(symbol, price, size, side),
        (isLive) => setLive(isLive),
      );
    } catch {
      disposeLiveRef.current = null;
    }

    // ---- canvas sizing (DPR aware) ----
    let cssW = 0;
    let cssH = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = canvas.clientWidth;
      cssH = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // ---- palette (canvas art may use raw hex) ----
    const BG = "#07060a";
    const RULE = "rgba(150,140,180,0.10)";
    const RULE_STRONG = "rgba(160,150,190,0.20)";
    const DIM = "rgba(200,196,214,0.42)";
    const TEXT = "rgba(226,224,236,0.9)";
    const VIOLET = "rgba(167,139,250,0.95)";
    const VIOLET_DIM = "rgba(167,139,250,0.45)";
    const BUY = "rgba(196,181,253,0.95)"; // brighter violet
    const SELL = "rgba(148,163,184,0.85)"; // cool grey

    const mono = (px: number) =>
      `${px}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

    // ---- ladder geometry helpers ----
    const laddersFor = (w: number, h: number) => {
      const symbols = ["BTC", "ETH", "SOL", "XRP", "INDEX"];
      const rightW = Math.min(360, Math.max(220, w * 0.34));
      const x0 = w - rightW;
      const top = 96;
      const bottom = h - 130;
      const colW = rightW / symbols.length;
      return { symbols, x0, top, bottom, colW, rightW };
    };

    const priceStr = (sym: string, p: number) => {
      if (sym === "BTC") return p.toFixed(2);
      if (sym === "ETH") return p.toFixed(2);
      if (sym === "SOL") return p.toFixed(3);
      if (sym === "XRP") return p.toFixed(5);
      return p.toFixed(4); // INDEX
    };
    const sizeStr = (s: number) => s.toFixed(3);

    // ---- push a trade into the tape + spawn a flash at its ladder marker ----
    const registerTrade = (tr: Trade, snap: MarketSnapshot, w: number, h: number) => {
      const tape = tapeRef.current;
      tape.push(tr);
      if (tape.length > TAPE_MAX) tape.shift();

      const { symbols, x0, top, bottom, colW } = laddersFor(w, h);
      const ci = symbols.indexOf(tr.asset);
      if (ci >= 0) {
        const a = snap.assets.find((x) => x.symbol === tr.asset);
        if (a) {
          const frac =
            a.hi > a.lo
              ? (Math.log(Math.max(a.lo, tr.price)) - Math.log(a.lo)) /
                (Math.log(a.hi) - Math.log(a.lo))
              : 0.5;
          const cx = x0 + ci * colW + colW * 0.5;
          const cy = bottom - Math.max(0, Math.min(1, frac)) * (bottom - top);
          const norm = Math.log1p(tr.size) / Math.log1p(40);
          flashesRef.current.push({
            x: cx,
            y: cy,
            born: frameRef.current,
            side: tr.side,
            strong: norm > 0.72,
          });
        }
      }
      if (flashesRef.current.length > 80) flashesRef.current.shift();
    };

    // ---- the single rAF loop ----
    let raf = 0;
    let readoutTick = 0;
    const loop = () => {
      frameRef.current++;
      const frame = frameRef.current;

      // advance the deterministic sim by a fixed step; hand trades to audio
      const { trades, snapshot } = market.step(SIM_DT);
      snapshotRef.current = snapshot;
      const audio = audioRef.current;
      if (frame % 6 === 0) audio?.setVolatility(snapshot.regime);

      for (const tr of trades) {
        const a = snapshot.assets.find((x) => x.symbol === tr.asset);
        registerTrade(tr, snapshot, cssW, cssH);
        if (a) audio?.trade(tr, a.lo, a.hi);
      }

      // throttled DOM readout (~6x/sec)
      readoutTick++;
      if (readoutTick % 10 === 0) {
        setReadout({ regime: snapshot.regime, tps: snapshot.tradesPerSec });
      }

      // ---------------- draw ----------------
      const w = cssW;
      const h = cssH;
      ctx2d.fillStyle = BG;
      ctx2d.fillRect(0, 0, w, h);

      const reduced = reducedRef.current;
      const { symbols, x0, top, bottom, colW, rightW } = laddersFor(w, h);

      // registration grid — hairline rules + sparse crosshairs
      ctx2d.strokeStyle = RULE;
      ctx2d.lineWidth = 1;
      const gridStep = 64;
      ctx2d.beginPath();
      for (let gx = 0; gx <= w; gx += gridStep) {
        ctx2d.moveTo(gx + 0.5, 0);
        ctx2d.lineTo(gx + 0.5, h);
      }
      for (let gy = 0; gy <= h; gy += gridStep) {
        ctx2d.moveTo(0, gy + 0.5);
        ctx2d.lineTo(w, gy + 0.5);
      }
      ctx2d.stroke();

      // corner crosshairs / registration marks
      ctx2d.strokeStyle = RULE_STRONG;
      const cross = (cx: number, cy: number) => {
        ctx2d.beginPath();
        ctx2d.moveTo(cx - 6, cy);
        ctx2d.lineTo(cx + 6, cy);
        ctx2d.moveTo(cx, cy - 6);
        ctx2d.lineTo(cx, cy + 6);
        ctx2d.stroke();
      };
      cross(gridStep, gridStep);
      cross(w - gridStep, gridStep);
      cross(gridStep, h - gridStep);

      // ---- scrolling trade matrix (left region) ----
      const tape = tapeRef.current;
      const listX = 28;
      const listTop = 96;
      const scroll = reduced ? 0 : (frame * 0.9) % ROW_H;
      ctx2d.font = mono(13);
      ctx2d.textBaseline = "middle";
      const n = Math.min(TAPE_ROWS + 1, tape.length);
      for (let i = 0; i < n; i++) {
        // newest at top
        const tr = tape[tape.length - 1 - i];
        if (!tr) continue;
        const y = listTop + i * ROW_H + scroll;
        if (y > bottom + ROW_H) continue;
        const fade = Math.max(0, 1 - i / (TAPE_ROWS + 1));
        const isBuy = tr.side === "buy";
        // asset · price · size · side, high precision, mono
        ctx2d.fillStyle = `rgba(200,196,214,${(0.25 + fade * 0.5).toFixed(3)})`;
        ctx2d.fillText(tr.asset.padEnd(6), listX, y);
        ctx2d.fillStyle = i === 0 ? TEXT : DIM;
        ctx2d.fillText(priceStr(tr.asset, tr.price).padStart(12), listX + 62, y);
        ctx2d.fillStyle = DIM;
        ctx2d.fillText(sizeStr(tr.size).padStart(10), listX + 190, y);
        ctx2d.fillStyle = isBuy ? BUY : SELL;
        ctx2d.fillText(isBuy ? "▲ BUY" : "▼ SELL", listX + 300, y);
      }
      // top wash so rows scroll in cleanly under the header band
      const grad = ctx2d.createLinearGradient(0, listTop - 24, 0, listTop + 8);
      grad.addColorStop(0, BG);
      grad.addColorStop(1, "rgba(7,6,10,0)");
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(0, listTop - 28, x0 - 12, 36);

      // ---- per-asset price ladders (right region) ----
      const snap = snapshotRef.current!;
      // frame around the ladder block
      ctx2d.strokeStyle = RULE_STRONG;
      ctx2d.strokeRect(x0 + 0.5, top + 0.5, rightW - 1, bottom - top);

      for (let ci = 0; ci < symbols.length; ci++) {
        const sym = symbols[ci];
        const a = snap.assets.find((x) => x.symbol === sym);
        if (!a) continue;
        const cx = x0 + ci * colW + colW * 0.5;
        const colLeft = x0 + ci * colW;

        // column divider
        if (ci > 0) {
          ctx2d.strokeStyle = RULE;
          ctx2d.beginPath();
          ctx2d.moveTo(colLeft + 0.5, top);
          ctx2d.lineTo(colLeft + 0.5, bottom);
          ctx2d.stroke();
        }

        // ladder tick marks
        ctx2d.strokeStyle = RULE;
        ctx2d.beginPath();
        for (let t = 0; t <= 8; t++) {
          const yy = top + (t / 8) * (bottom - top);
          ctx2d.moveTo(cx - 10, yy + 0.5);
          ctx2d.lineTo(cx + 10, yy + 0.5);
        }
        ctx2d.stroke();

        // current price marker within [lo,hi]
        const frac =
          a.hi > a.lo
            ? (Math.log(Math.max(a.lo, a.price)) - Math.log(a.lo)) /
              (Math.log(a.hi) - Math.log(a.lo))
            : 0.5;
        const my = bottom - Math.max(0, Math.min(1, frac)) * (bottom - top);
        const up = a.lastSide === "buy";
        ctx2d.strokeStyle = up ? VIOLET : SELL;
        ctx2d.lineWidth = 2;
        ctx2d.beginPath();
        ctx2d.moveTo(cx - 16, my + 0.5);
        ctx2d.lineTo(cx + 16, my + 0.5);
        ctx2d.stroke();
        ctx2d.lineWidth = 1;

        // label + numeric price
        ctx2d.font = mono(11);
        ctx2d.textAlign = "center";
        ctx2d.fillStyle = VIOLET;
        ctx2d.fillText(sym, cx, top - 14);
        ctx2d.font = mono(sym === "INDEX" ? 11 : 12);
        ctx2d.fillStyle = TEXT;
        ctx2d.fillText(priceStr(sym, a.price), cx, bottom + 18);
        // vol readout under price
        ctx2d.font = mono(9);
        ctx2d.fillStyle = VIOLET_DIM;
        ctx2d.fillText(`σ ${(a.vol * 1000).toFixed(1)}`, cx, bottom + 34);
        ctx2d.textAlign = "left";
      }

      // ---- flashes: precise marks decaying on the grid ----
      const flashes = flashesRef.current;
      const flashLife = reduced ? 34 : 26;
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        const age = frame - f.born;
        if (age > flashLife) {
          flashes.splice(i, 1);
          continue;
        }
        const p = age / flashLife;
        const alpha = (1 - p) * (f.side === "buy" ? 0.9 : 0.75);
        const r = f.strong ? 5 + p * 10 : 3 + p * 6;
        ctx2d.strokeStyle =
          f.side === "buy"
            ? `rgba(196,181,253,${alpha.toFixed(3)})`
            : `rgba(148,163,184,${alpha.toFixed(3)})`;
        ctx2d.lineWidth = f.strong ? 1.6 : 1;
        ctx2d.beginPath();
        ctx2d.arc(f.x, f.y, r, 0, Math.PI * 2);
        ctx2d.stroke();
        // a precise center tick
        ctx2d.beginPath();
        ctx2d.moveTo(f.x - 3, f.y);
        ctx2d.lineTo(f.x + 3, f.y);
        ctx2d.stroke();
        ctx2d.lineWidth = 1;
      }

      // ---- volatility / regime meter (bottom band) ----
      const meterX = 28;
      const meterY = h - 78;
      const meterW = Math.min(420, x0 - 60);
      ctx2d.font = mono(10);
      ctx2d.fillStyle = VIOLET_DIM;
      ctx2d.fillText("VOLATILITY REGIME", meterX, meterY - 12);
      ctx2d.strokeStyle = RULE_STRONG;
      ctx2d.strokeRect(meterX + 0.5, meterY + 0.5, meterW, 10);
      const rg = Math.max(0, Math.min(1, snap.regime));
      ctx2d.fillStyle = VIOLET;
      ctx2d.fillRect(meterX + 1, meterY + 1, (meterW - 2) * rg, 8);
      // segment ticks
      ctx2d.strokeStyle = BG;
      ctx2d.beginPath();
      for (let s = 1; s < 20; s++) {
        const sx = meterX + (meterW / 20) * s;
        ctx2d.moveTo(sx + 0.5, meterY + 1);
        ctx2d.lineTo(sx + 0.5, meterY + 9);
      }
      ctx2d.stroke();
      ctx2d.fillStyle = DIM;
      ctx2d.font = mono(11);
      ctx2d.fillText(
        `${rg < 0.4 ? "CALM" : rg < 0.7 ? "ACTIVE" : "TURBULENT"}  ${(rg * 100).toFixed(0)}%   ·   ${snap.tradesPerSec} trades/s`,
        meterX,
        meterY + 26,
      );

      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      disposeLiveRef.current?.();
      disposeLiveRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const begin = async () => {
    if (audioRef.current) return;
    try {
      const audio = new BourseAudio(reducedRef.current);
      audioRef.current = audio;
      await audio.start();
      const snap = snapshotRef.current;
      if (snap) audio.setVolatility(snap.regime);
      setStarted(true);
      setError(null);
    } catch {
      audioRef.current = null;
      setError("Audio could not start in this browser. The tape still runs, silent.");
    }
  };

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* the data-matrix canvas (art layer; raw hex allowed inside) */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      {unsupported && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base text-destructive">
            This browser could not provide a 2D canvas, so the data tape cannot render.
          </p>
        </div>
      )}

      {/* chrome: title / controls — semantic tokens only */}
      <div className="pointer-events-none relative z-10 flex flex-col gap-3 p-6 sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Finance sonification · cold data
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Bourse
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
          The live crypto market as a Ryoji Ikeda <em>datamatics</em> composition &mdash;
          every trade a precise sine and click on a scrolling monochrome data-matrix,
          the whole firehose at once a legible monitor and a minimal-techno piece.
        </p>

        <div className="pointer-events-auto mt-1 flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">
              Reading the tape &mdash; the pulse tightens as the market turns turbulent.
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        {/* LIVE / SIM status */}
        <div className="mt-1 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em]">
          <span
            className={
              live
                ? "inline-block h-2 w-2 rounded-full bg-primary"
                : "inline-block h-2 w-2 rounded-full bg-muted-foreground"
            }
          />
          <span className={live ? "text-primary" : "text-muted-foreground"}>
            {live ? "Live · Binance trade stream" : "Sim · seeded synthetic market"}
          </span>
          <span className="text-muted-foreground/70">
            regime {(readout.regime * 100).toFixed(0)}% · {readout.tps} tr/s
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {/* design notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              The market as cold data
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A seeded synthetic market of BTC, ETH, SOL, XRP (plus a weighted INDEX)
                drives the piece with zero network: each asset follows a geometric
                Brownian-motion price path with its own drift and volatility, punctuated
                by occasional calm&harr;turbulent regime shifts, and trades arrive as a
                bursty Poisson process. The aggregate firehose is rate-limited to about
                ten trades per second so the sound never machine-guns.
              </p>
              <p>
                Each trade becomes a short, pure tone: its price is log-mapped into the
                asset&apos;s rolling [low, high] window and snapped to a sparse scale, so
                a rising market literally climbs. Assets sit in different registers and
                timbres; a buy pans slightly right and bright, a sell slightly left and
                dark; size sets amplitude and a 1&nbsp;ms click &ldquo;print&rdquo;, with
                large prints adding a sub thud. Underneath, a quiet minimal-techno kick
                grid and a high sine &ldquo;tape tone&rdquo; both tighten and rise as
                volatility climbs.
              </p>
              <p>
                An optional best-effort Binance public trade WebSocket takes over
                seamlessly when it connects (the status line reads LIVE), and silently
                falls back to the deterministic sim otherwise. This does not claim to be
                Ikeda &mdash; it borrows his <em>datamatics</em> aesthetic. Finance
                sonification is a first for this lab.
              </p>
              <p className="text-muted-foreground/70">
                References: Ryoji Ikeda &mdash; <em>datamatics</em>, <em>data.tron</em>,{" "}
                <em>test pattern</em>. Janata &amp; Childs, MARKETBUZZ (ICAD 2004);
                PriceSquawk. Geometric Brownian motion as the standard price-path model.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1810-bourse"]} />
    </main>
  );
}
