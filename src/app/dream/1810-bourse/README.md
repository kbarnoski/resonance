# Bourse (1810)

**Route:** `/dream/1810-bourse`

## The one question

> What if the live crypto market were a Ryoji Ikeda _datamatics_ composition —
> every trade a precise sine/click on a scrolling monochrome data-matrix, the
> whole flow at once a legible monitor and a hypnotic minimal-techno piece?

**Vibe: COLD DATA.** Ikeda clinical-precision — monochrome, gridded, numeric,
high-contrast, rhythmic. Explicitly **not** cosmic-ambient, not altered-states,
not warm. Think `data.tron`, `test pattern`, `supersymmetry`.

Finance sonification is **0× in this lab** — a genuinely fresh subject here. This
piece does **not** claim to be Ikeda; it borrows his _datamatics_ aesthetic.

## How it works

### Data engine (`market.ts`) — the load-bearing part

- A basket of assets: **BTC, ETH, SOL, XRP**, plus a synthetic **INDEX** =
  weighted mean of each asset's price normalised against its seed price. Each
  asset keeps a rolling 64-sample price window → rolling **[lo, hi]** and a
  rolling **volatility** (stddev of log returns).
- **Primary driver = a fully DETERMINISTIC seeded synthetic market**, so the
  piece is always alive with zero network (essential for the 06:30 headless
  review). A `mulberry32` PRNG seeded with the fixed constant **`0x1810`** drives
  everything:
  - **Geometric Brownian motion** price paths, per-asset drift + volatility
    (`dS = S·(µ·dt + σ·√dt·Z)`, `Z` a Box–Muller normal from the PRNG).
  - **Volatility clustering / regime shifts:** a global regime scalar (0 = calm,
    1 = turbulent) mean-reverts between occasional jumps to a new calm or
    turbulent target; the regime scales every asset's σ and the trade-arrival
    rate.
  - **Trade arrivals as a Poisson-ish process:** exponential inter-arrival times
    whose rate rises with turbulence — bursty, not metronomic. Each trade is
    `{ asset, price, size, side, t }`, with heavy-tailed sizes (mostly small,
    rare large "prints").
- The sim advances off a **fixed step (`SIM_DT = 1/60`) per animation frame** —
  no wall clock. No `Math.random()` and no `Date.now()` anywhere on the running
  loop; all randomness is the seeded PRNG.
- **Optional live feed (best-effort, never blocks or breaks):** `connectBinance`
  opens the Binance public combined trade WebSocket
  (`wss://stream.binance.com:9443/stream?streams=btcusdt@trade/…`, no auth). It
  parses `data.p`/`data.q`/`data.m` (buyer-maker → sell), folds real prices into
  the rolling windows, and its trades **replace** the synthetic ones seamlessly.
  Everything is wrapped in try/catch; any error or non-browser context silently
  stays on the sim. The socket is closed on unmount. A **LIVE / SIM** status line
  tells the reviewer which is playing.
- **Rate-limiting:** emitted trade events are aggregated to **≤ ~10/sec** (a
  token-budget that prioritises larger prints when it must drop some) so the
  audio never machine-guns.

### Audio → sound mapping (`audio.ts`) — Ikeda cold synthesis

| Signal              | Sound                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| a trade's **price** | log-mapped into the asset's rolling **[lo, hi]**, snapped to a sparse scale over 2 octaves → a **pure tone** (sine for BTC/ETH/INDEX, triangle for SOL/XRP; different base registers per asset) |
| **buy vs sell**     | buy pans slightly right + brighter lowpass; sell slightly left + darker, one semitone down              |
| trade **size**      | amplitude + a **1 ms noise click "print"** (high-passed); large prints add a short **sub-bass thud**    |
| **volatility**      | a quiet high sine **"tape tone"** whose pitch/level track turbulence, plus the **tempo of a minimal-techno kick grid** (≈108 bpm calm → ≈142 bpm turbulent) that the trades decorate |

Master chain: everything → `DynamicsCompressor` → master gain **0.16** (≤ 0.18),
with a 1.2 s fade-in on start and a clean fade-out + `ctx.close()` on teardown.
Starts only on the **Start** gesture (autoplay policy).

### Visual (`page.tsx`) — Canvas2D data-matrix

- Full-viewport near-black canvas, one `requestAnimationFrame` loop, canvas set
  up once, all animation state in refs (React state only for chrome + a throttled
  status readout).
- A **scrolling trade matrix** (asset · price · size · side, high-precision
  monospace numerals, newest on top, buys bright violet / sells cool grey), a
  thin **price-ladder per asset** (BTC/ETH/SOL/XRP/INDEX) with a marker showing
  the live price within its [lo, hi] window and a σ readout, a hairline
  **registration grid** with sparse crosshairs, a **volatility-regime meter**,
  and precise **trade flashes** that bloom and decay on each ladder marker.
- Chrome (title, buttons, labels, status) uses Resonance semantic tokens only;
  raw hex lives strictly inside the canvas art.
- **Degrades gracefully:** no 2D canvas → a `text-destructive` notice; audio
  failure → a `text-destructive` note but the tape keeps running silent. The sim
  autoplays with zero interaction beyond Start.

## Safety

No strobe, no flicker. Peak brightness stays sub-white (violet/grey at ≤ ~0.95
alpha); flashes bloom and fade over ~26 frames, all luminance/motion changes are
gradual and data-paced. `prefers-reduced-motion` freezes the tape scroll (rows
update in place, fully legible) and lengthens/softens flash decay.

## Named references

- **Ryoji Ikeda** — _datamatics_, _data.tron_, _test pattern_ (data-as-signal
  aesthetic: pure sines, clicks, sub, monochrome numeric fields).
- **MARKETBUZZ: Sonification of Real-Time Financial Data** — Janata & Childs,
  ICAD 2004; **PriceSquawk** (market-sonification tool) — prior art in turning
  the tape into sound.
- **arXiv 2605.21874** (May 2026), "Real-time, EDM-inspired sonification of the
  activity of a supercomputer" — the thesis that continuous real-time data
  becomes a good _monitor + long-listen_ only when the musical language's
  temporal structure fits the data process. Here: a minimal-techno/Ikeda pulse
  for the bursty trade firehose.
- **Geometric Brownian motion** — the standard price-path model for the synthetic
  market.

## Ambition criteria

- **≥ 3 subsystems (6 here):** (1) seeded GBM market engine with regime shifts +
  Poisson arrivals, (2) live/sim Binance-WebSocket failover with seamless
  handover, (3) aggregate rate-limiter, (4) price→scale Ikeda tone synth with
  buy/sell timbre + click/sub, (5) volatility-driven tape tone + minimal-techno
  kick grid, (6) Canvas2D data-matrix (scrolling tape + price ladders + regime
  meter + flashes).
- **Named reference:** Ikeda _datamatics_; MARKETBUZZ / PriceSquawk; GBM.
- **Fresh subject:** finance sonification — 0× in the lab.

## Honest self-assessment

The data engine is the strongest part: it self-demos with zero network, is fully
deterministic (fixed seed, fixed per-frame step), and the regime shifts give the
piece a real long-form arc (calm stretches, then bursts). The Ikeda mapping is
faithful in spirit — pure sines, precise clicks, sub, a gridded pulse — though a
truly clinical Ikeda mix would want tighter sample-accurate kick scheduling
(currently a `setTimeout` grid) and more extreme high/low registers. The live
Binance path is best-effort and, on handover, currently uses each live tick as a
trade event; it stays legible but the sim's regime meter keeps running underneath
rather than being derived from live volatility.

## Next-cycle deepening

- Derive the regime/volatility meter from **live** rolling variance when the
  Binance feed is active, so the kick tempo responds to real turbulence.
- Sample-accurate kick + tape scheduling via a Web Audio lookahead scheduler for
  a genuinely locked grid.
- A **spectral test-pattern** band (bar-code sweep) keyed to per-asset order-flow
  imbalance, closer to `test pattern`'s barcode aesthetic.
- Optional multi-exchange streams to hear cross-venue lead/lag as stereo spread.
