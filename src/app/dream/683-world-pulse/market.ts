// World Pulse — market firehose + synthetic generator + rolling state.
// Read-only, keyless. The piece always has a live state, even offline.

export interface Trade {
  price: number
  qty: number
  // true = aggressor was a SELLER (down-pressure); false = BUYER (up-pressure)
  sell: boolean
  t: number
}

export interface MarketState {
  price: number
  // normalized price position within the recent rolling window, 0..1
  priceNorm: number
  // signed momentum, roughly -1..1 (down..up), EMA of buy/sell pressure + returns
  momentum: number
  // 0..1, EMA of recent absolute returns / trade variance
  volatility: number
  // 0..1 short-lived spike when a trade lands; decays each frame
  pulse: number
  // last trade size mapped 0..1
  lastSize: number
  // last trade was a sell?
  lastSell: boolean
  // true when fed by a real socket, false when synthetic
  live: boolean
  tradesPerSec: number
}

type TradeListener = (tr: Trade) => void

const PRIMARY_URLS = [
  'wss://stream.binance.com:9443/ws/btcusdt@trade',
  'wss://stream.binance.us:9443/ws/btcusdt@trade',
]

// ---------------------------------------------------------------------------
// Rolling state machine. Trades (real or synthetic) flow into apply().
// ---------------------------------------------------------------------------

export function makeMarketState(seedPrice: number): MarketState {
  return {
    price: seedPrice,
    priceNorm: 0.5,
    momentum: 0,
    volatility: 0.12,
    pulse: 0,
    lastSize: 0,
    lastSell: false,
    live: false,
    tradesPerSec: 0,
  }
}

// rolling window for price normalization
const WINDOW = 240
const priceWindow: number[] = []
let lastPrice = 0
let tradeCount = 0
let lastRateStamp = 0

export function applyTrade(s: MarketState, tr: Trade) {
  // signed pressure: buyer aggressor pushes up, seller pushes down
  const dir = tr.sell ? -1 : 1
  // weight by size, soft-clamped
  const sizeW = Math.min(1, Math.log10(1 + tr.qty * 40) / 2)

  // price return
  const ret = lastPrice > 0 ? (tr.price - lastPrice) / lastPrice : 0
  lastPrice = tr.price
  s.price = tr.price

  // momentum: EMA blend of directional pressure and price return
  const target = Math.max(-1, Math.min(1, dir * (0.35 + 0.65 * sizeW) + ret * 600))
  s.momentum += (target - s.momentum) * 0.04

  // volatility: EMA of absolute return magnitude (scaled up — BTC ticks are tiny)
  const volInst = Math.min(1, Math.abs(ret) * 4000 + sizeW * 0.15)
  s.volatility += (volInst - s.volatility) * 0.03

  // pulse + last trade descriptors
  s.pulse = Math.min(1.4, s.pulse + 0.25 + sizeW * 0.6)
  s.lastSize = sizeW
  s.lastSell = tr.sell

  // rolling price window for normalization
  priceWindow.push(tr.price)
  if (priceWindow.length > WINDOW) priceWindow.shift()
  let lo = Infinity
  let hi = -Infinity
  for (const p of priceWindow) {
    if (p < lo) lo = p
    if (p > hi) hi = p
  }
  s.priceNorm = hi > lo ? (tr.price - lo) / (hi - lo) : 0.5

  // trade rate
  tradeCount++
  const now = tr.t
  if (now - lastRateStamp > 1000) {
    s.tradesPerSec = tradeCount * (1000 / Math.max(1, now - lastRateStamp))
    tradeCount = 0
    lastRateStamp = now
  }
}

// per-frame decay so visuals/audio never get stuck
export function decayState(s: MarketState, dt: number) {
  s.pulse *= Math.pow(0.0008, dt)
  // gentle pull of momentum toward neutral and volatility toward a quiet floor
  s.momentum *= Math.pow(0.55, dt)
  s.volatility += (0.08 - s.volatility) * (1 - Math.pow(0.85, dt)) * 0.4
}

// ---------------------------------------------------------------------------
// Synthetic market: geometric random walk + occasional volatility bursts.
// Realistic-enough buy/sell trade stream so the piece plays instantly.
// ---------------------------------------------------------------------------

export class SyntheticMarket {
  private price: number
  private drift = 0
  private burst = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  private listener: TradeListener

  constructor(seedPrice: number, listener: TradeListener) {
    this.price = seedPrice
    this.listener = listener
  }

  start() {
    this.stopped = false
    this.schedule()
  }

  stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private schedule() {
    if (this.stopped) return
    // bursts arrive in clusters; otherwise calm
    const base = this.burst > 0 ? 35 : 140
    const jitter = Math.random() * base
    this.timer = setTimeout(() => this.tick(), 30 + jitter)
  }

  private tick() {
    if (this.stopped) return
    // occasionally enter a volatility burst
    if (this.burst <= 0 && Math.random() < 0.004) {
      this.burst = 40 + Math.floor(Math.random() * 120)
      this.drift = (Math.random() - 0.5) * 0.0009
    }
    if (this.burst > 0) this.burst--

    const sigma = this.burst > 0 ? 0.0016 : 0.0004
    // geometric random walk with slow mean-reverting drift
    const shock = gaussian() * sigma + this.drift
    this.drift *= 0.985
    this.price *= 1 + shock
    if (this.price < 1000) this.price = 1000

    // direction biased by the shock sign — buyers chase up moves
    const upBias = 0.5 + Math.max(-0.4, Math.min(0.4, shock * 250))
    const sell = Math.random() > upBias

    // trade size: mostly small, occasionally a whale
    let qty = Math.abs(gaussian()) * 0.12
    if (Math.random() < 0.02) qty += Math.random() * 6

    this.listener({ price: this.price, qty, sell, t: Date.now() })
    this.schedule()
  }
}

function gaussian(): number {
  // Box-Muller
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ---------------------------------------------------------------------------
// Live feed: open a Binance public trade socket. Hands trades to listener.
// Calls onLive(true) when real data flows, onLive(false) when it drops.
// Never throws to the caller; failures are silent + reported via onLive.
// ---------------------------------------------------------------------------

export class LiveFeed {
  private ws: WebSocket | null = null
  private urlIndex = 0
  private closed = false
  private listener: TradeListener
  private onLive: (live: boolean) => void

  constructor(listener: TradeListener, onLive: (live: boolean) => void) {
    this.listener = listener
    this.onLive = onLive
  }

  connect() {
    if (this.closed) return
    if (this.urlIndex >= PRIMARY_URLS.length) {
      this.onLive(false)
      return
    }
    const url = PRIMARY_URLS[this.urlIndex]
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      this.urlIndex++
      this.connect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      if (this.closed) {
        ws.close()
        return
      }
      this.onLive(true)
    }

    ws.onmessage = (ev) => {
      if (this.closed) return
      try {
        const d = JSON.parse(ev.data as string)
        if (d && d.e === 'trade') {
          const price = parseFloat(d.p)
          const qty = parseFloat(d.q)
          if (Number.isFinite(price) && Number.isFinite(qty)) {
            this.listener({ price, qty, sell: d.m === true, t: d.T || Date.now() })
          }
        }
      } catch {
        // ignore malformed frame
      }
    }

    ws.onerror = () => {
      // let onclose handle the fallback
    }

    ws.onclose = () => {
      if (this.closed) return
      this.onLive(false)
      this.urlIndex++
      // brief delay then try the next endpoint
      setTimeout(() => this.connect(), 400)
    }
  }

  close() {
    this.closed = true
    if (this.ws) {
      try {
        this.ws.onopen = null
        this.ws.onmessage = null
        this.ws.onerror = null
        this.ws.onclose = null
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }
  }
}
