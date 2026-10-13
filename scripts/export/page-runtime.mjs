// In-page runtime for the offline 4K export (docs/export-4k.md).
//
// Installed by Playwright's addInitScript BEFORE any page script runs
// (build-init-script.mjs concatenates this file with analyser-math,
// virtual-clock and virtual-media). Replaces every clock the visuals read:
//
//   performance.now / Date / setTimeout / setInterval / rAF / rIC
//                                  → virtual clock, stepped one frame at a time
//   <audio>/<video> playback       → virtual-media model (never plays natively);
//                                    videos are natively SEEKED to their virtual
//                                    time each frame and awaited ('seeked')
//   AnalyserNode.get*Data          → computed from the decoded track PCM at the
//                                    element's virtual time (analyser-math.mjs)
//   CSS transitions / animations   → paused, currentTime set from virtual time
//   Math.random / crypto random    → seeded (same take every run)
//   KHR_parallel_shader_compile    → hidden (compiles complete synchronously)
//   WebGL2 fences                  → always signaled after gl.finish()
//
// Between frames the runtime SETTLES: it waits (real time, virtual time
// frozen) until fetches, image loads/decodes, worker replies, media
// readiness and DOM mutations are quiet — so async work always lands on
// the same frame, run after run.
//
// CONSTRAINT: concatenated into the page init script — imports must be
// single-line (the builder drops them), top-level `export function` only.
import { createVirtualClock, mulberry32 } from "./virtual-clock.mjs";
import { createMediaState, mediaPlay, mediaPause, mediaSeek, mediaLoad, mediaAdvance } from "./virtual-media.mjs";
import { analyserMagnitudes, smoothSpectrum, toByteFrequency, toFloatFrequency, toByteTimeDomain, toFloatTimeDomain, mixWindow, sampleIndexAt } from "./analyser-math.mjs";

/** Native media events swallowed (the virtual model fires its own). Loading events pass through. */
export const EXPORT_BLOCKED_MEDIA_EVENTS = ["play", "playing", "pause", "seeking", "seeked", "timeupdate", "ended", "waiting"];

export const EXPORT_RUNTIME_DEFAULTS = {
  fps: 60,
  epochMs: 1791921600000, // 2026-10-13T20:00:00Z — fixed so Date-driven logic is reproducible
  seed: 1,
  seedCrypto: true,
  settleMs: 4000,
  quietTurns: 3,
  seekTimeoutMs: 10000,
  mediaReadyTimeoutMs: 30000,
  workerStaleMs: 5000,
  analyserLeadS: 0,
  disableParallelCompile: true,
  forceSyncFences: true,
};

export function installExportRuntime(g, cfg) {
  if (g.__resonanceExport) return g.__resonanceExport;
  const C = Object.assign({}, EXPORT_RUNTIME_DEFAULTS, cfg || {});

  // ── natives (captured before anything is replaced) ──────────────
  const nat = {
    setTimeout: g.setTimeout.bind(g),
    clearTimeout: g.clearTimeout.bind(g),
    perfNow: g.performance.now.bind(g.performance),
    Date: g.Date,
    fetch: typeof g.fetch === "function" ? g.fetch.bind(g) : null,
    MessageChannel: g.MessageChannel,
  };
  const realNow = () => nat.perfNow();

  const errors = [];
  const warnings = [];
  const warned = new Set();
  function warn(key, msg) {
    if (warned.has(key)) return;
    warned.add(key);
    warnings.push(msg);
    try { if (g.console) g.console.warn("[export] " + msg); } catch { /* no console */ }
  }
  function reportError(e) {
    errors.push(String((e && e.stack) || e));
    if (errors.length > 200) errors.shift();
    try {
      if (typeof g.reportError === "function") g.reportError(e);
      else nat.setTimeout(() => { throw e; }, 0);
    } catch { /* reporting must never break the step */ }
  }

  const clock = createVirtualClock({ fps: C.fps, epochMs: C.epochMs, onError: reportError });

  // ── time ────────────────────────────────────────────────────────
  Object.defineProperty(g.performance, "now", { value: () => clock.now(), configurable: true, writable: true });
  const ND = nat.Date;
  function VDate(...a) {
    if (!new.target) return new ND(clock.dateNow()).toString();
    return Reflect.construct(ND, a.length ? a : [clock.dateNow()], new.target);
  }
  VDate.prototype = ND.prototype;
  VDate.now = () => clock.dateNow();
  VDate.parse = ND.parse;
  VDate.UTC = ND.UTC;
  try { Object.defineProperty(VDate, "name", { value: "Date" }); } catch { /* cosmetic */ }
  g.Date = VDate;

  g.setTimeout = function (fn, ms, ...args) {
    if (typeof fn !== "function") { warn("string-timer", "string setTimeout/setInterval handler ignored"); return 0; }
    return clock.setTimeout(fn, ms, ...args);
  };
  g.setInterval = function (fn, ms, ...args) {
    if (typeof fn !== "function") { warn("string-timer", "string setTimeout/setInterval handler ignored"); return 0; }
    return clock.setInterval(fn, ms, ...args);
  };
  g.clearTimeout = (id) => clock.clearTimer(id);
  g.clearInterval = (id) => clock.clearTimer(id);
  g.requestAnimationFrame = (cb) => clock.requestAnimationFrame(cb);
  g.cancelAnimationFrame = (id) => clock.cancelAnimationFrame(id);
  g.requestIdleCallback = (cb) => clock.requestIdleCallback(cb);
  g.cancelIdleCallback = (id) => clock.cancelIdleCallback(id);

  // ── randomness ──────────────────────────────────────────────────
  if (C.seed !== null && C.seed !== undefined) {
    g.Math.random = mulberry32(Number(C.seed) >>> 0);
    const cr = g.crypto;
    if (C.seedCrypto && cr && typeof cr.getRandomValues === "function") {
      const rnd = mulberry32((Number(C.seed) ^ 0x9e3779b9) >>> 0);
      const fill = (arr) => {
        const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        for (let i = 0; i < u8.length; i++) u8[i] = (rnd() * 256) | 0;
        return arr;
      };
      try { Object.defineProperty(cr, "getRandomValues", { value: fill, configurable: true, writable: true }); } catch { /* frozen */ }
      if (typeof cr.randomUUID === "function") {
        try {
          Object.defineProperty(cr, "randomUUID", {
            configurable: true,
            writable: true,
            value: () => {
              const b = fill(new Uint8Array(16));
              b[6] = (b[6] & 0x0f) | 0x40;
              b[8] = (b[8] & 0x3f) | 0x80;
              const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
              return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
            },
          });
        } catch { /* frozen */ }
      }
    }
  }

  // ── pending async work (what "settled" means) ───────────────────
  const pend = { fetch: 0, body: 0, xhr: 0, decode: 0, bitmap: 0 };
  function track(key, p) {
    pend[key]++;
    let done = false;
    const fin = () => { if (!done) { done = true; pend[key]--; } };
    try { p.then(fin, fin); } catch { fin(); }
    return p;
  }
  if (nat.fetch) g.fetch = function (...a) { return track("fetch", nat.fetch(...a)); };
  if (g.Response && g.Response.prototype) {
    for (const m of ["arrayBuffer", "blob", "json", "text", "formData"]) {
      const o = g.Response.prototype[m];
      if (typeof o === "function") g.Response.prototype[m] = function (...a) { return track("body", o.apply(this, a)); };
    }
  }
  if (g.XMLHttpRequest && g.XMLHttpRequest.prototype) {
    const send = g.XMLHttpRequest.prototype.send;
    g.XMLHttpRequest.prototype.send = function (...a) {
      pend.xhr++;
      let d = false;
      const fin = () => { if (!d) { d = true; pend.xhr--; } };
      this.addEventListener("loadend", fin);
      try { return send.apply(this, a); } catch (e) { fin(); throw e; }
    };
  }
  if (typeof g.createImageBitmap === "function") {
    const cib = g.createImageBitmap.bind(g);
    g.createImageBitmap = (...a) => track("bitmap", cib(...a));
  }
  const pendingImages = new Map(); // img -> real ms when the load began
  function watchImage(img) {
    try {
      if (img.complete || img.loading === "lazy") return; // lazy + offscreen never loads — don't wait on it
      pendingImages.set(img, realNow());
      const fin = () => pendingImages.delete(img);
      img.addEventListener("load", fin, { once: true });
      img.addEventListener("error", fin, { once: true });
    } catch { /* not an image */ }
  }
  if (g.HTMLImageElement && g.HTMLImageElement.prototype) {
    const IP = g.HTMLImageElement.prototype;
    for (const prop of ["src", "srcset"]) {
      const d = Object.getOwnPropertyDescriptor(IP, prop);
      if (d && d.set) {
        Object.defineProperty(IP, prop, {
          configurable: true,
          enumerable: d.enumerable,
          get() { return d.get.call(this); },
          set(v) { d.set.call(this, v); watchImage(this); },
        });
      }
    }
    if (typeof IP.decode === "function") {
      const dec = IP.decode;
      IP.decode = function (...a) { return track("decode", dec.apply(this, a)); };
    }
  }
  const workerStates = new Set();
  if (typeof g.Worker === "function") {
    const NW = g.Worker;
    const W = function (...a) {
      const w = new NW(...a);
      const ws = { out: [] };
      workerStates.add(ws);
      const pm = w.postMessage;
      w.postMessage = function (...m) { ws.out.push(realNow()); return pm.apply(this, m); };
      w.addEventListener("message", () => { ws.out.shift(); });
      w.addEventListener("error", () => { ws.out.length = 0; });
      return w;
    };
    W.prototype = NW.prototype;
    g.Worker = W;
  }
  let mutations = 0;
  if (typeof g.MutationObserver === "function" && g.document) {
    try {
      new g.MutationObserver((recs) => { mutations += recs.length; })
        .observe(g.document, { childList: true, subtree: true, attributes: true, characterData: true });
    } catch { /* no document yet */ }
  }

  // ── media: virtual playback ─────────────────────────────────────
  const media = new Set();
  const mstate = new WeakMap();
  const listened = new WeakSet();
  const readyWaitSince = new WeakMap();
  const seekWaiters = new WeakMap(); // el -> Set(resolve)
  const mediaSourceEls = new Set();
  const ctxRates = [];
  const queued = [];
  let flushScheduled = false;
  let seeksInFlight = 0;
  const BLOCKED = new Set(EXPORT_BLOCKED_MEDIA_EVENTS);
  const MP = g.HTMLMediaElement && g.HTMLMediaElement.prototype;
  const md = (n) => (MP ? Object.getOwnPropertyDescriptor(MP, n) : undefined);
  const nCT = md("currentTime");
  const nPaused = md("paused");
  const nSrc = md("src");
  const nDur = md("duration");
  const nPlay = MP && MP.play;
  const nPause = MP && MP.pause;
  const nLoad = MP && MP.load;
  void nPlay;

  const durOf = (el) => { try { return nDur ? nDur.get.call(el) : el.duration; } catch { return NaN; } };
  const rawSrc = (el) => { try { return nSrc ? nSrc.get.call(el) : el.src; } catch { return ""; } };
  const srcKey = (el) => (el && (el.currentSrc || rawSrc(el))) || "";
  const isVideo = (el) => !!(g.HTMLVideoElement && el instanceof g.HTMLVideoElement);

  function attachListeners(el) {
    if (listened.has(el)) return;
    listened.add(el);
    for (const name of BLOCKED) {
      el.addEventListener(name, (e) => {
        if (!e.isTrusted) return;
        if (name === "seeked") resolveSeek(el, true);
        e.stopImmediatePropagation();
      }, true);
    }
    el.addEventListener("error", (e) => { if (e.isTrusted) resolveSeek(el, false); }, true);
  }
  function mst(el) {
    let s = mstate.get(el);
    if (!s) { s = createMediaState(); mstate.set(el, s); }
    media.add(el);
    attachListeners(el);
    return s;
  }
  function liveMedia() {
    const out = [];
    for (const el of media) {
      const s = mstate.get(el);
      // detached + paused elements drop out — unless a video still owes a seek to its virtual time
      let owesSeek = false;
      if (s && !el.isConnected && isVideo(el) && nCT) { try { owesSeek = Math.abs(nCT.get.call(el) - s.t) > 1e-4; } catch { /* detached */ } }
      const keep = el.isConnected || mediaSourceEls.has(el) || (s && s.playing) || owesSeek;
      if (!keep) { media.delete(el); continue; }
      out.push(el);
    }
    return out;
  }
  function keepNativePaused(el) {
    try { if (nPaused && !nPaused.get.call(el)) nPause.call(el); } catch { /* detached */ }
  }
  function flushEvents() {
    flushScheduled = false;
    const batch = queued.splice(0);
    for (const [el, n] of batch) {
      try { el.dispatchEvent(new g.Event(n)); } catch (e) { reportError(e); }
    }
  }
  function queueEvents(el, names) {
    if (!names || !names.length) return;
    for (const n of names) queued.push([el, n]);
    if (!flushScheduled) { flushScheduled = true; nat.setTimeout(flushEvents, 0); }
  }
  function dispatchNow(el, names) {
    for (const n of names) {
      try { el.dispatchEvent(new g.Event(n)); } catch (e) { reportError(e); }
    }
  }
  function resolveSeek(el, ok) {
    const set = seekWaiters.get(el);
    if (!set) return;
    seekWaiters.delete(el);
    for (const r of set) r(ok);
  }

  if (MP) {
    Object.defineProperty(MP, "currentTime", {
      configurable: true,
      enumerable: true,
      get() { return mst(this).t; },
      set(v) { queueEvents(this, mediaSeek(mst(this), v, durOf(this))); },
    });
    Object.defineProperty(MP, "paused", { configurable: true, enumerable: true, get() { return !mst(this).playing; } });
    Object.defineProperty(MP, "ended", { configurable: true, enumerable: true, get() { return mst(this).ended; } });
    if (nSrc && nSrc.set) {
      Object.defineProperty(MP, "src", {
        configurable: true,
        enumerable: true,
        get() { return nSrc.get.call(this); },
        set(v) { mediaLoad(mst(this)); nSrc.set.call(this, v); },
      });
    }
    MP.play = function () {
      const s = mst(this);
      queueEvents(this, mediaPlay(s, durOf(this)));
      // a paused element with preload!=auto never fetches data natively — ask for it
      try { if (this.preload !== "auto") this.preload = "auto"; } catch { /* readonly */ }
      keepNativePaused(this);
      return Promise.resolve();
    };
    MP.pause = function () {
      queueEvents(this, mediaPause(mst(this)));
      keepNativePaused(this);
    };
    MP.load = function () {
      mediaLoad(mst(this));
      return nLoad.call(this);
    };
    if (typeof MP.fastSeek === "function") {
      MP.fastSeek = function (t) { queueEvents(this, mediaSeek(mst(this), t, durOf(this))); };
    }
  }
  if (g.Element && g.Element.prototype) {
    const sa = g.Element.prototype.setAttribute;
    g.Element.prototype.setAttribute = function (name, value) {
      const r = sa.call(this, name, value);
      const n = String(name).toLowerCase();
      if (n === "src" || n === "srcset") {
        if (MP && this instanceof g.HTMLMediaElement && n === "src") mediaLoad(mst(this));
        else if (g.HTMLImageElement && this instanceof g.HTMLImageElement) watchImage(this);
      }
      return r;
    };
  }

  function scanMedia() {
    if (g.document && typeof g.document.querySelectorAll === "function") {
      for (const el of g.document.querySelectorAll("audio,video")) mst(el);
    }
    for (const el of liveMedia()) {
      const s = mstate.get(el);
      if (el.autoplay && !s.autoplayed && srcKey(el)) {
        s.autoplayed = true;
        queueEvents(el, mediaPlay(s, durOf(el)));
      }
      keepNativePaused(el);
    }
  }

  function seekNative(el, t) {
    return new Promise((resolve) => {
      let done = false;
      seeksInFlight++;
      const fin = (ok) => {
        if (done) return;
        done = true;
        seeksInFlight--;
        nat.clearTimeout(timer);
        resolve(ok);
      };
      let set = seekWaiters.get(el);
      if (!set) seekWaiters.set(el, (set = new Set()));
      set.add(fin);
      const timer = nat.setTimeout(() => { set.delete(fin); fin(false); }, C.seekTimeoutMs);
      try { nCT.set.call(el, t); } catch { fin(false); }
    });
  }

  let seekTimeouts = 0;
  async function syncVideos() {
    if (!nCT) return;
    const jobs = [];
    for (const el of liveMedia()) {
      if (!isVideo(el) || !srcKey(el) || el.error) continue;
      if (el.readyState < 1) continue; // metadata pending — the readiness wait covers it
      const s = mstate.get(el);
      const dur = durOf(el);
      let target = s.t;
      if (Number.isFinite(dur) && dur > 0) target = Math.min(target, Math.max(0, dur - 1e-3));
      const cur = nCT.get.call(el);
      if (Math.abs(cur - target) < 1e-4 && el.readyState >= 2 && !el.seeking) continue;
      jobs.push(seekNative(el, target).then((ok) => {
        if (!ok) { seekTimeouts++; warn("seek:" + srcKey(el), `video seek timed out/failed: ${srcKey(el).slice(-80)}`); }
      }));
    }
    if (jobs.length) await Promise.all(jobs);
  }

  function mediaPendingCount(detail) {
    let n = 0;
    const now = realNow();
    for (const el of liveMedia()) {
      const s = mstate.get(el);
      if (!s || el.error || !srcKey(el)) { readyWaitSince.delete(el); continue; }
      const need = s.playing ? 2 : (el.preload === "auto" || el.autoplay) && el.networkState === 2 ? 3 : 0;
      if (el.readyState >= need) { readyWaitSince.delete(el); continue; }
      let since = readyWaitSince.get(el);
      if (since === undefined) readyWaitSince.set(el, (since = now));
      if (now - since > C.mediaReadyTimeoutMs) {
        warn("ready:" + srcKey(el), `media never became ready (readyState ${el.readyState}): ${srcKey(el).slice(-80)}`);
        continue;
      }
      n++;
      if (detail) detail.push(`media rs=${el.readyState} ${srcKey(el).slice(-60)}`);
    }
    return n;
  }

  function pendingSummary(withDetail) {
    const detail = withDetail ? [] : null;
    const now = realNow();
    let images = 0;
    for (const [img, since] of pendingImages) {
      if (img.complete) { pendingImages.delete(img); continue; }
      if (now - since > C.mediaReadyTimeoutMs) {
        pendingImages.delete(img);
        warn("img:" + img.currentSrc, `image never finished loading: ${String(img.currentSrc || img.src).slice(-80)}`);
        continue;
      }
      images++;
    }
    let workers = 0;
    for (const ws of workerStates) {
      while (ws.out.length && now - ws.out[0] > C.workerStaleMs) {
        ws.out.shift();
        warn("worker-stale", "a worker message got no reply within workerStaleMs (fire-and-forget?) — no longer waited on");
      }
      workers += ws.out.length;
    }
    const mediaN = mediaPendingCount(detail);
    const total = pend.fetch + pend.body + pend.xhr + pend.decode + pend.bitmap + images + workers + mediaN + queued.length + seeksInFlight;
    const out = { total, fetch: pend.fetch, body: pend.body, xhr: pend.xhr, decode: pend.decode, bitmap: pend.bitmap, images, workers, media: mediaN, events: queued.length, seeks: seeksInFlight };
    if (detail) out.detail = detail;
    return out;
  }

  function macrotask() {
    return new Promise((r) => {
      if (nat.MessageChannel) {
        const ch = new nat.MessageChannel();
        ch.port1.onmessage = () => { ch.port1.close(); r(); };
        ch.port2.postMessage(0);
      } else nat.setTimeout(r, 0);
    });
  }
  const sleep = (ms) => new Promise((r) => nat.setTimeout(r, ms));
  async function microFlush() { await 0; await 0; await 0; }

  let settleTimeouts = 0;
  async function settle(maxMs) {
    const t0 = realNow();
    let quiet = 0;
    let turns = 0;
    for (;;) {
      await macrotask();
      turns++;
      const p = pendingSummary(false);
      const m = mutations;
      mutations = 0;
      if (p.total === 0 && m === 0) {
        if (++quiet >= C.quietTurns) return { ok: true, ms: realNow() - t0, turns };
      } else quiet = 0;
      if (realNow() - t0 > maxMs) {
        settleTimeouts++;
        return { ok: false, ms: realNow() - t0, turns, pending: pendingSummary(true) };
      }
      if (p.total > 0) await sleep(2);
    }
  }

  // ── CSS transitions / Web Animations ────────────────────────────
  const anims = new WeakMap();
  function syncAnimations(nowMs) {
    const doc = g.document;
    if (!doc || typeof doc.getAnimations !== "function") return 0;
    let n = 0;
    for (const a of doc.getAnimations()) {
      let r = anims.get(a);
      if (!r) {
        r = { birth: nowMs };
        anims.set(a, r);
        try { a.pause(); } catch { /* idle */ }
      }
      if (a.playState === "finished") continue;
      const rate = a.playbackRate || 1;
      const target = (nowMs - r.birth) * rate;
      let end = Infinity;
      try { end = a.effect ? a.effect.getComputedTiming().endTime : Infinity; } catch { /* no effect */ }
      try {
        if (Number.isFinite(end) && target >= end) a.finish();
        else a.currentTime = target;
      } catch (e) { reportError(e); }
      n++;
    }
    return n;
  }

  // ── Web Audio: AnalyserNode fed from the decoded PCM ────────────
  const pcmStore = new Map(); // srcKey -> { data: Float32Array, sampleRate }
  const pcmRequested = new Set();
  const out = new Map(); // AudioNode -> Set(AudioNode)
  const nodeEl = new WeakMap();
  const anState = new WeakMap();
  if (g.AudioNode && g.AnalyserNode) {
    const ACP = g.AudioContext && g.AudioContext.prototype;
    if (ACP && typeof ACP.createMediaElementSource === "function") {
      const o = ACP.createMediaElementSource;
      ACP.createMediaElementSource = function (el) {
        const n = o.call(this, el);
        nodeEl.set(n, el);
        mediaSourceEls.add(el);
        mst(el);
        try { if (!ctxRates.includes(this.sampleRate)) ctxRates.push(this.sampleRate); } catch { /* closed */ }
        return n;
      };
    }
    const AN = g.AudioNode.prototype;
    const oc = AN.connect;
    const od = AN.disconnect;
    AN.connect = function (dest, ...r) {
      const res = oc.call(this, dest, ...r);
      if (dest instanceof g.AudioNode) {
        let s = out.get(this);
        if (!s) out.set(this, (s = new Set()));
        s.add(dest);
      }
      return res;
    };
    AN.disconnect = function (...a) {
      const res = od.apply(this, a);
      if (a.length === 0 || typeof a[0] === "number") out.delete(this);
      else if (a[0] instanceof g.AudioNode) { const s = out.get(this); if (s) s.delete(a[0]); }
      return res;
    };
    const elementsFeeding = (node) => {
      const els = [];
      const seen = new Set([node]);
      const q = [node];
      while (q.length) {
        const cur = q.shift();
        for (const [src, dests] of out) {
          if (!dests.has(cur) || seen.has(src)) continue;
          seen.add(src);
          const el = nodeEl.get(src);
          if (el) els.push(el);
          q.push(src);
        }
      }
      return els;
    };
    const windowFor = (an, els) => {
      const N = an.fftSize;
      const win = new Float32Array(N);
      for (const el of els) {
        const s = mstate.get(el);
        if (!s || !s.playing) continue; // a paused element feeds silence
        const pcm = pcmStore.get(srcKey(el));
        if (!pcm) { warn("nopcm:" + srcKey(el), `no PCM for analysed media (spectrum silent): ${srcKey(el).slice(-80)}`); continue; }
        const gain = el.muted ? 0 : el.volume;
        mixWindow(pcm.data, sampleIndexAt(s.t + C.analyserLeadS, pcm.sampleRate), N, gain, win);
      }
      return win;
    };
    const smoothedFor = (an, els) => {
      const N = an.fftSize;
      let st = anState.get(an);
      if (!st || st.N !== N) { st = { N, prev: new Float64Array(N >> 1), mags: new Float64Array(N >> 1), frame: -1 }; anState.set(an, st); }
      if (st.frame !== clock.frame()) {
        st.frame = clock.frame();
        analyserMagnitudes(windowFor(an, els), N, st.mags);
        smoothSpectrum(st.prev, st.mags, an.smoothingTimeConstant);
      }
      return st.prev;
    };
    const AP = g.AnalyserNode.prototype;
    const nAP = { gbf: AP.getByteFrequencyData, gff: AP.getFloatFrequencyData, gbt: AP.getByteTimeDomainData, gft: AP.getFloatTimeDomainData };
    AP.getByteFrequencyData = function (arr) {
      const els = elementsFeeding(this);
      if (!els.length) return nAP.gbf.call(this, arr); // mic / oscillator: not ours
      toByteFrequency(smoothedFor(this, els), this.minDecibels, this.maxDecibels, arr);
    };
    AP.getFloatFrequencyData = function (arr) {
      const els = elementsFeeding(this);
      if (!els.length) return nAP.gff.call(this, arr);
      toFloatFrequency(smoothedFor(this, els), arr);
    };
    AP.getByteTimeDomainData = function (arr) {
      const els = elementsFeeding(this);
      if (!els.length) return nAP.gbt.call(this, arr);
      toByteTimeDomain(windowFor(this, els), arr);
    };
    AP.getFloatTimeDomainData = function (arr) {
      const els = elementsFeeding(this);
      if (!els.length) return nAP.gft.call(this, arr);
      toFloatTimeDomain(windowFor(this, els), arr);
    };
  }

  // ── WebGL determinism ───────────────────────────────────────────
  const patchExt = (proto) => {
    if (!proto || !C.disableParallelCompile) return;
    const ge = proto.getExtension;
    proto.getExtension = function (name) {
      if (name === "KHR_parallel_shader_compile") return null;
      return ge.call(this, name);
    };
    const gse = proto.getSupportedExtensions;
    proto.getSupportedExtensions = function () {
      const r = gse.call(this);
      return r ? r.filter((n) => n !== "KHR_parallel_shader_compile") : r;
    };
  };
  patchExt(g.WebGLRenderingContext && g.WebGLRenderingContext.prototype);
  patchExt(g.WebGL2RenderingContext && g.WebGL2RenderingContext.prototype);
  if (C.forceSyncFences && g.WebGL2RenderingContext) {
    const P = g.WebGL2RenderingContext.prototype;
    const gsp = P.getSyncParameter;
    P.getSyncParameter = function (sync, pname) {
      if (pname === this.SYNC_STATUS) { this.finish(); return this.SIGNALED; }
      return gsp.call(this, sync, pname);
    };
    P.clientWaitSync = function () { this.finish(); return this.ALREADY_SIGNALED; };
  }

  // ── driver API ──────────────────────────────────────────────────
  function mainAudio() {
    if (g.__resonanceAudio) return g.__resonanceAudio;
    for (const el of mediaSourceEls) return el;
    let best = null;
    for (const el of liveMedia()) {
      if (isVideo(el)) continue;
      if (!best || (durOf(el) || 0) > (durOf(best) || 0)) best = el;
    }
    return best;
  }
  function mainInfo() {
    const m = mainAudio();
    if (!m) return null;
    const s = mstate.get(m) || createMediaState();
    return {
      t: s.t, playing: s.playing, ended: s.ended, generation: s.generation,
      src: srcKey(m), duration: durOf(m), readyState: m.readyState,
      error: m.error ? m.error.code : 0, analysed: mediaSourceEls.has(m),
    };
  }
  function wantedPcm() {
    const list = [];
    for (const el of mediaSourceEls) {
      const k = srcKey(el);
      if (!k || pcmStore.has(k) || pcmRequested.has(k)) continue;
      pcmRequested.add(k);
      list.push({ key: k, sampleRate: ctxRates[0] || 48000 });
    }
    return list;
  }

  let stepping = false;
  async function step() {
    if (stepping) throw new Error("export runtime: step() re-entered");
    stepping = true;
    try {
      const t0 = realNow();
      const target = clock.beginFrame();
      const dt = 1 / C.fps;
      scanMedia();
      if (queued.length) flushEvents(); // events from calls made since the last frame, in call order
      // 1. media advance exactly one frame; their events fire as this frame's first task
      for (const el of liveMedia()) {
        const s = mstate.get(el);
        if (!s || !s.playing) continue;
        dispatchNow(el, mediaAdvance(s, dt, { duration: durOf(el), loop: !!el.loop, rate: el.playbackRate }));
      }
      // 2. timers due up to this frame
      await clock.runTimersUntil(target, microFlush);
      // 3. videos to their virtual frame, async work lands
      scanMedia();
      await syncVideos();
      const s1 = await settle(C.settleMs);
      scanMedia();
      await syncVideos();
      // 4. the frame: rAF, idle, CSS animation clocks
      const rafs = clock.runAnimationFrames(target);
      clock.runIdleCallbacks();
      syncAnimations(target);
      // 5. whatever the frame kicked off lands before the capture
      const s2 = await settle(C.settleMs);
      scanMedia();
      await syncVideos();
      const anim = syncAnimations(target);
      return {
        frame: clock.frame(), nowMs: target, rafs, anims: anim,
        main: mainInfo(),
        settle: { ok: s1.ok && s2.ok, ms: s1.ms + s2.ms, pending: s1.ok ? s2.pending : s1.pending },
        stepMs: realNow() - t0,
        wantedPcm: wantedPcm(),
        errors: errors.splice(0),
        warnings: warnings.splice(0),
        totals: { settleTimeouts, seekTimeouts },
      };
    } finally {
      stepping = false;
    }
  }

  const api = {
    config: C,
    clock,
    step,
    settle,
    scanMedia,
    pending: () => pendingSummary(true),
    mainInfo,
    wantedPcm,
    async loadPcm(key, url, sampleRate) {
      if (!nat.fetch) throw new Error("no fetch");
      const res = await nat.fetch(url);
      if (!res.ok) throw new Error(`PCM fetch ${url} → HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      pcmStore.set(key, { data: new Float32Array(buf), sampleRate });
      return buf.byteLength / 4;
    },
    hasPcm: (key) => pcmStore.has(key),
    seekMain(t) {
      const m = mainAudio();
      if (!m) throw new Error("seekMain: no main audio element");
      queueEvents(m, mediaSeek(mst(m), t, durOf(m)));
      return mstate.get(m).t;
    },
    glInfo() {
      try {
        const c = g.document.createElement("canvas");
        const gl = c.getContext("webgl2") || c.getContext("webgl");
        if (!gl) return { renderer: "NO WEBGL" };
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        return {
          renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
          vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
          webgl2: typeof g.WebGL2RenderingContext !== "undefined" && gl instanceof g.WebGL2RenderingContext,
        };
      } catch (e) { return { renderer: "error: " + e }; }
    },
    stats: () => ({ settleTimeouts, seekTimeouts, media: media.size, frame: clock.frame() }),
  };
  g.__resonanceExport = api;
  return api;
}
