// 1810 · Bourse — market data engine.
//
// A small basket of crypto assets rendered as a COLD DATA tape. The primary
// driver is a fully DETERMINISTIC seeded synthetic market (geometric Brownian
// motion + volatility-regime shifts + Poisson-ish bursty trade arrivals) so the
// piece is ALWAYS alive with zero network — essential for the 06:30 headless
// review. An OPTIONAL best-effort Binance public trade WebSocket may take over
// seamlessly when it connects; it can never block or break the sim.
//
// Nothing on the running value path calls Math.random() or Date.now(): the sim
// advances off a monotonic time delta (seconds) supplied by the caller, and all
// randomness comes from a mulberry32 PRNG seeded with a fixed constant.

// ---- deterministic PRNG -----------------------------------------------------

/** mulberry32 — tiny, fast, fully deterministic 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIXED_SEED = 0x1810;

// ---- types ------------------------------------------------------------------

export type Side = "buy" | "sell";

export interface Trade {
  asset: string; // "BTC" | "ETH" | ...
  price: number;
  size: number; // notional-ish size (arbitrary units)
  side: Side;
  t: number; // sim seconds at emission
}

export interface AssetState {
  symbol: string;
  price: number;
  // rolling recent window
  lo: number;
  hi: number;
  // rolling volatility (stddev of recent log returns), annualised-ish scalar
  vol: number;
  // most recent trade side, for the ticker/flash
  lastSide: Side;
  // per-asset weight in the synthetic INDEX
  weight: number;
}

export interface MarketSnapshot {
  assets: AssetState[]; // BTC, ETH, SOL, XRP, INDEX
  regime: number; // 0 = calm .. 1 = turbulent (global volatility multiplier state)
  tradesPerSec: number; // rolling emitted-trade rate
  live: boolean; // true once the Binance feed has taken over
}

// ---- asset configuration ----------------------------------------------------

interface AssetConfig {
  symbol: string;
  stream: string; // binance combined-stream name
  price0: number; // seed price
  drift: number; // per-sec GBM drift (mu)
  vol0: number; // baseline per-sec GBM volatility (sigma)
  weight: number; // INDEX weight
}

const ASSETS: AssetConfig[] = [
  { symbol: "BTC", stream: "btcusdt@trade", price0: 64000, drift: 0.02, vol0: 0.9, weight: 0.5 },
  { symbol: "ETH", stream: "ethusdt@trade", price0: 3400, drift: 0.01, vol0: 1.1, weight: 0.28 },
  { symbol: "SOL", stream: "solusdt@trade", price0: 145, drift: 0.03, vol0: 1.6, weight: 0.14 },
  { symbol: "XRP", stream: "xrpusdt@trade", price0: 0.58, drift: 0.0, vol0: 1.4, weight: 0.08 },
];

const WINDOW = 64; // rolling price-window length per asset (for lo/hi + vol)

export const ASSET_SYMBOLS = [...ASSETS.map((a) => a.symbol), "INDEX"];
export const BINANCE_STREAMS = ASSETS.map((a) => a.stream).join("/");
export const BINANCE_URL = `wss://stream.binance.com:9443/stream?streams=${BINANCE_STREAMS}`;

// ---- per-asset rolling model ------------------------------------------------

class AssetSim {
  cfg: AssetConfig;
  price: number;
  history: number[]; // recent prices, capped at WINDOW
  lastSide: Side = "buy";
  private nextArrival: number; // sim-seconds until this asset's next trade
  private rng: () => number;

  constructor(cfg: AssetConfig, rng: () => number) {
    this.cfg = cfg;
    this.price = cfg.price0;
    this.history = [cfg.price0];
    this.rng = rng;
    this.nextArrival = this.sampleInterval(1);
  }

  /** Box-Muller standard normal from the shared PRNG (deterministic). */
  private gauss(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.rng();
    while (v === 0) v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Exponential inter-arrival (Poisson process) — bursty when rate high. */
  private sampleInterval(rate: number): number {
    const u = Math.max(1e-6, this.rng());
    return -Math.log(u) / rate;
  }

  /** Rolling stddev of recent log returns → a small volatility scalar. */
  vol(): number {
    const h = this.history;
    if (h.length < 3) return 0;
    const rets: number[] = [];
    for (let i = 1; i < h.length; i++) rets.push(Math.log(h[i] / h[i - 1]));
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    let s = 0;
    for (const r of rets) s += (r - mean) * (r - mean);
    return Math.sqrt(s / rets.length);
  }

  lo(): number {
    return Math.min(...this.history);
  }
  hi(): number {
    return Math.max(...this.history);
  }

  private pushPrice(p: number) {
    this.price = p;
    this.history.push(p);
    if (this.history.length > WINDOW) this.history.shift();
  }

  /** Advance a GBM step for `dt` seconds under a global vol multiplier.
   *  Returns any trades that "arrived" in this slice (usually 0 or 1). */
  step(dt: number, tNow: number, volMul: number): Trade[] {
    const sigma = this.cfg.vol0 * volMul;
    // GBM increment: dS = S * (mu*dt + sigma*sqrt(dt)*Z)
    const z = this.gauss();
    const growth = (this.cfg.drift - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z;
    const next = Math.max(1e-8, this.price * Math.exp(growth));
    this.pushPrice(next);

    // Trade arrivals: Poisson process whose rate rises with turbulence.
    const out: Trade[] = [];
    const arrivalRate = 1.4 + volMul * 2.2; // trades/sec baseline per asset
    this.nextArrival -= dt;
    let guard = 0;
    while (this.nextArrival <= 0 && guard < 8) {
      guard++;
      const side: Side = this.rng() < 0.5 ? "buy" : "sell";
      this.lastSide = side;
      // size: mostly small, occasionally a large "print" (heavy tail)
      const u = this.rng();
      const size = 0.2 + Math.pow(u, 5) * 40; // heavy-tailed
      out.push({ asset: this.cfg.symbol, price: this.price, size, side, t: tNow });
      this.nextArrival += this.sampleInterval(arrivalRate);
    }
    return out;
  }

  /** Fold a real (live) trade into the rolling window. */
  ingestLive(price: number, side: Side) {
    this.lastSide = side;
    this.pushPrice(price);
  }

  state(): AssetState {
    return {
      symbol: this.cfg.symbol,
      price: this.price,
      lo: this.lo(),
      hi: this.hi(),
      vol: this.vol(),
      lastSide: this.lastSide,
      weight: this.cfg.weight,
    };
  }
}

// ---- market: the whole basket + regime + rate limiting ----------------------

export class Market {
  private sims: AssetSim[];
  private rng: () => number;
  private t = 0; // sim seconds elapsed
  private regime = 0.35; // 0 calm .. 1 turbulent
  private nextRegimeShift: number;
  private live = false;

  // emitted-trade rate limiting (aggregate firehose → <= MAX_RATE/sec)
  private emitBudget = 0;
  private static MAX_RATE = 10; // trades/sec handed to the app
  private rateWindow: number[] = []; // recent emit times for the readout

  // live buffer: real trades arrive async, drained on step()
  private liveBuffer: Trade[] = [];

  constructor(seed = FIXED_SEED) {
    this.rng = mulberry32(seed);
    this.sims = ASSETS.map((cfg) => new AssetSim(cfg, this.rng));
    this.nextRegimeShift = 6 + this.rng() * 10;
  }

  get isLive(): boolean {
    return this.live;
  }

  /** Feed a real Binance trade (best-effort). Buffered, drained next step. */
  pushLiveTrade(symbol: string, price: number, size: number, side: Side) {
    if (!this.live) this.live = true;
    const sim = this.sims.find((s) => s.cfg.symbol === symbol);
    if (!sim) return;
    sim.ingestLive(price, side);
    this.liveBuffer.push({ asset: symbol, price, size, side, t: this.t });
    // cap the buffer so a firehose never balloons memory
    if (this.liveBuffer.length > 128) this.liveBuffer.splice(0, this.liveBuffer.length - 128);
  }

  private volMultiplier(): number {
    // regime 0..1 → multiplier ~0.5 (calm) .. ~2.4 (turbulent)
    return 0.5 + this.regime * 1.9;
  }

  /** Advance the market by `dt` seconds (monotonic; NOT wall-clock).
   *  Returns the rate-limited list of trade events for this slice. */
  step(dt: number): { trades: Trade[]; snapshot: MarketSnapshot } {
    const d = Math.max(0, Math.min(0.25, dt)); // clamp big tab-away gaps
    this.t += d;

    // ---- regime evolution: occasional calm<->turbulent shifts + drift ----
    this.nextRegimeShift -= d;
    if (this.nextRegimeShift <= 0) {
      // jump toward a new regime target (volatility clustering)
      const target = this.rng() < 0.5 ? 0.15 + this.rng() * 0.25 : 0.6 + this.rng() * 0.4;
      this.regime = target;
      this.nextRegimeShift = 5 + this.rng() * 12;
    } else {
      // gentle mean-reverting jitter between shifts
      this.regime += (0.35 - this.regime) * 0.02 * d + (this.rng() - 0.5) * 0.01;
      this.regime = Math.max(0, Math.min(1, this.regime));
    }

    const volMul = this.volMultiplier();

    // ---- gather candidate trades: live if present, else synthetic ----
    let candidates: Trade[];
    if (this.live && this.liveBuffer.length > 0) {
      candidates = this.liveBuffer;
      this.liveBuffer = [];
      // keep the sim's rolling stats warm so lo/hi/vol stay meaningful even
      // while live drives the sound (prices already folded via ingestLive)
    } else {
      candidates = [];
      for (const sim of this.sims) {
        const ts = sim.step(d, this.t, volMul);
        for (const tr of ts) candidates.push(tr);
      }
    }

    // ---- aggregate rate limit → <= MAX_RATE trades/sec emitted ----
    this.emitBudget = Math.min(Market.MAX_RATE, this.emitBudget + Market.MAX_RATE * d);
    const emitted: Trade[] = [];
    // prioritise larger prints when we must drop some
    candidates.sort((a, b) => b.size - a.size);
    for (const tr of candidates) {
      if (this.emitBudget >= 1) {
        emitted.push(tr);
        this.emitBudget -= 1;
      }
    }

    // rolling emitted-rate readout (uses sim clock, not wall clock)
    for (let k = 0; k < emitted.length; k++) this.rateWindow.push(this.t);
    while (this.rateWindow.length > 0 && this.t - this.rateWindow[0] > 1) this.rateWindow.shift();

    return { trades: emitted, snapshot: this.snapshot() };
  }

  snapshot(): MarketSnapshot {
    const assets = this.sims.map((s) => s.state());
    // synthetic INDEX = weighted mean of normalised prices vs their seed price
    let idxPrice = 0;
    let idxLo = 0;
    let idxHi = 0;
    let wsum = 0;
    for (let i = 0; i < this.sims.length; i++) {
      const s = this.sims[i];
      const w = s.cfg.weight;
      wsum += w;
      idxPrice += (s.price / s.cfg.price0) * 100 * w;
      idxLo += (s.lo() / s.cfg.price0) * 100 * w;
      idxHi += (s.hi() / s.cfg.price0) * 100 * w;
    }
    const idxVol = this.sims.reduce((a, s) => a + s.vol() * s.cfg.weight, 0) / wsum;
    assets.push({
      symbol: "INDEX",
      price: idxPrice / wsum,
      lo: idxLo / wsum,
      hi: idxHi / wsum,
      vol: idxVol,
      lastSide: "buy",
      weight: 1,
    });
    return {
      assets,
      regime: this.regime,
      tradesPerSec: this.rateWindow.length,
      live: this.live,
    };
  }
}

// ---- optional live feed: best-effort Binance public trade WebSocket ---------
//
// Wrapped so ANY failure (offline, blocked, malformed) leaves the sim running.
// Returns a disposer to close the socket on unmount.

export function connectBinance(
  onTrade: (symbol: string, price: number, size: number, side: Side) => void,
  onStatus?: (live: boolean) => void,
): () => void {
  let socket: WebSocket | null = null;
  let closed = false;

  const streamToSymbol = new Map<string, string>();
  for (const a of ASSETS) streamToSymbol.set(a.stream, a.symbol);

  try {
    if (typeof WebSocket === "undefined") return () => {};
    socket = new WebSocket(BINANCE_URL);

    socket.onopen = () => {
      if (!closed) onStatus?.(true);
    };
    socket.onmessage = (ev: MessageEvent) => {
      if (closed) return;
      try {
        const msg = JSON.parse(ev.data as string);
        const stream: string = msg.stream;
        const d = msg.data;
        if (!d || d.e !== "trade") return;
        const symbol = streamToSymbol.get(stream);
        if (!symbol) return;
        const price = parseFloat(d.p);
        const size = parseFloat(d.q);
        // Binance: m = true → buyer is the maker → the trade was a SELL hit.
        const side: Side = d.m ? "sell" : "buy";
        if (Number.isFinite(price) && Number.isFinite(size)) {
          onTrade(symbol, price, size, side);
        }
      } catch {
        // ignore a single malformed frame
      }
    };
    socket.onerror = () => {
      // stay silent — the sim keeps playing
    };
    socket.onclose = () => {
      if (!closed) onStatus?.(false);
    };
  } catch {
    // constructor threw (blocked scheme, etc.) — sim only
    return () => {};
  }

  return () => {
    closed = true;
    try {
      socket?.close();
    } catch {
      // already gone
    }
  };
}
