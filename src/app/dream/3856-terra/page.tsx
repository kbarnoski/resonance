"use client";

// ════════════════════════════════════════════════════════════════════════════
// Terra — the living planet as an acoustic space (3856)
//
// THE ONE QUESTION: What if a recording of the *living planet* — the real global
// earthquakes of the last hour — were the score, and you could hear and watch
// the Earth as an acoustic space?
//
// On mount we fetch the live USGS "all_hour" global earthquake feed (CORS-open,
// so a direct client fetch works). Each quake becomes a point on a slowly
// self-rotating 3-D globe. A compressed replay clock replays the last hour over
// ~90 s (looping). When a quake's moment arrives it BLOOMS: an expanding
// shockwave ring across the globe surface + a persistent glowing dot, and a
// struck modal-resonator "bell" voice sounds — magnitude → gain + ring-out,
// depth → brightness/register (continuous log map, never quantized), longitude
// → stereo pan. A drone pad swells with total released energy; a continuous
// ambient pad sits under everything (no drums, no scale-snapping).
//
// GRACEFUL FALLBACK (headless-safe): if the fetch fails, times out (~6 s) or
// returns zero features, a SEEDED mulberry32(0x3856) synthetic quake stream
// takes over so the piece always self-demos with sound + rings within ~2 s of
// Begin. WebGL failure degrades to an audio-only bed with an on-brand notice.
//
// Self-contained: all code in this file. three.js is the only import.
// Inspired by the Seismic Sound Lab (Holtzman, Candler, Lem) — see README.
// ════════════════════════════════════════════════════════════════════════════

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ── Data shape ───────────────────────────────────────────────────────────────
interface Quake {
  lat: number;
  lon: number;
  depth: number; // km
  mag: number;
  time: number; // epoch ms
  place: string;
}

interface UsgsFeature {
  geometry?: { coordinates?: (number | null)[] } | null;
  properties?: { mag?: number | null; time?: number | null; place?: string | null } | null;
}
interface UsgsFeed {
  features?: UsgsFeature[] | null;
}

type FeedStatus = "loading" | "live" | "synthetic" | "error";

const HOUR_MS = 3_600_000;
const REPLAY_MS = 90_000; // compress one hour into ~90 s
const GLOBE_R = 1;

// ── Deterministic PRNG (seeded so the synthetic demo is reproducible) ────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Seeded synthetic quake stream (plausible last-hour global seismicity) ────
function makeSyntheticQuakes(now: number): Quake[] {
  const rng = mulberry32(0x3856);
  const n = 46;
  const out: Quake[] = [];
  // A few loose "belts" so clusters read like real tectonic activity.
  const belts = [
    { lat: 38, lon: 142, place: "off the coast of Honshu, Japan" },
    { lat: -6, lon: 130, place: "Banda Sea" },
    { lat: 36, lon: -120, place: "Central California" },
    { lat: -20, lon: -70, place: "near the coast of Chile" },
    { lat: 19, lon: -155, place: "Island of Hawaii" },
    { lat: 40, lon: 30, place: "western Turkey" },
  ];
  for (let i = 0; i < n; i++) {
    const belt = belts[Math.floor(rng() * belts.length)];
    const lat = Math.max(-85, Math.min(85, belt.lat + (rng() - 0.5) * 24));
    const lon = ((belt.lon + (rng() - 0.5) * 36 + 540) % 360) - 180;
    // magnitude: mostly small, occasionally large (rough Gutenberg–Richter feel)
    const mag = Math.round((1.2 + Math.pow(rng(), 3) * 5.4) * 10) / 10;
    // depth: log-distributed 3..560 km
    const depth = Math.round(3 * Math.pow(560 / 3, rng()));
    const time = now - Math.floor(rng() * HOUR_MS);
    out.push({ lat, lon, depth, mag, time, place: belt.place });
  }
  return out.sort((a, b) => a.time - b.time);
}

function parseUsgs(feed: UsgsFeed): Quake[] {
  const feats = feed.features ?? [];
  const out: Quake[] = [];
  for (const f of feats) {
    const c = f.geometry?.coordinates;
    const p = f.properties;
    if (!c || c.length < 3) continue;
    const lon = c[0];
    const lat = c[1];
    const depth = c[2];
    const mag = p?.mag;
    const time = p?.time;
    if (
      typeof lon !== "number" ||
      typeof lat !== "number" ||
      typeof depth !== "number" ||
      typeof mag !== "number" ||
      typeof time !== "number"
    )
      continue;
    out.push({
      lat,
      lon,
      depth: Math.max(0, depth),
      mag,
      time,
      place: p?.place ?? "unknown region",
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

// ── Geo → cartesian on the unit sphere ───────────────────────────────────────
function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

// ── Continuous mappings (NEVER quantized) ────────────────────────────────────
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
// depth (km) → 0 (shallow/bright) .. 1 (deep/dark)
function depthNorm(depth: number): number {
  return clamp01(Math.log(depth + 1) / Math.log(701));
}
// depth → base bell frequency (shallow bright/high, deep dark/low), log-continuous
function bellBaseFreq(depth: number): number {
  const hi = 520;
  const lo = 66;
  return hi * Math.pow(lo / hi, depthNorm(depth));
}
// longitude → stereo pan (west = -1 left … east = +1 right)
const lonToPan = (lon: number) => Math.max(-1, Math.min(1, lon / 180));

// ════════════════════════════════════════════════════════════════════════════
// Audio engine — modal bell voices + energy-tracking drone + ambient bed
// ════════════════════════════════════════════════════════════════════════════
interface AudioApi {
  strike: (q: Quake) => void;
  setEnergy: (energy: number) => void;
  dispose: () => void;
}

function makeAudio(ctx: AudioContext): AudioApi {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.9, now + 1.2);
  master.connect(ctx.destination);

  // Gentle master lowpass so nothing gets harsh.
  const glue = ctx.createBiquadFilter();
  glue.type = "lowpass";
  glue.frequency.value = 6500;
  glue.connect(master);

  // ── Continuous ambient bed: a low pad, slightly moving, no rhythm ──────────
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.05;
  bedGain.connect(glue);
  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 420;
  bedFilter.connect(bedGain);
  const bedFreqs = [55, 82.4, 110]; // A1, E2, A2 — a bare fifth, continuous
  const bedOscs: OscillatorNode[] = [];
  for (const f of bedFreqs) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 8;
    o.connect(bedFilter);
    o.start();
    bedOscs.push(o);
  }
  // very slow filter drift so the bed breathes (continuous, not stepped)
  const bedLfo = ctx.createOscillator();
  bedLfo.type = "sine";
  bedLfo.frequency.value = 0.045;
  const bedLfoGain = ctx.createGain();
  bedLfoGain.gain.value = 150;
  bedLfo.connect(bedLfoGain);
  bedLfoGain.connect(bedFilter.frequency);
  bedLfo.start();

  // ── Drone pad: gain tracks total released energy in the window ─────────────
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0001;
  droneGain.connect(glue);
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 700;
  droneFilter.connect(droneGain);
  const droneOscs: OscillatorNode[] = [];
  for (const f of [110, 164.8, 220]) {
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 6;
    o.connect(droneFilter);
    o.start();
    droneOscs.push(o);
  }

  // Inharmonic partial ratios → struck-bell / modal-resonator timbre.
  const RATIOS = [1, 2.01, 3.13, 4.22, 5.43];

  function strike(q: Quake): void {
    const t = ctx.currentTime + 0.01;
    const magN = clamp01((q.mag - 1) / 6);
    const base = bellBaseFreq(q.depth);
    const dN = depthNorm(q.depth);
    const decay = 0.5 + magN * 3.4; // bigger quake → longer ring-out
    const peak = 0.04 + magN * 0.22; // bigger quake → louder

    const pan = ctx.createStereoPanner();
    pan.pan.value = lonToPan(q.lon);
    const voice = ctx.createGain();
    voice.gain.value = 1;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    // shallow → brighter (higher cutoff), deep → darker; continuous
    lp.frequency.value = base * (2.2 + (1 - dN) * 6);
    lp.Q.value = 0.7;
    voice.connect(lp);
    lp.connect(pan);
    pan.connect(glue);

    const partials = 3 + Math.round(magN * 2); // 3..5 partials
    for (let i = 0; i < partials; i++) {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = base * RATIOS[i];
      o.detune.value = (Math.random() - 0.5) * 6;
      const g = ctx.createGain();
      const amp = (peak / (i + 1)) * (0.7 + 0.3 * Math.random());
      const pDecay = decay * (1 - i * 0.11);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.15, pDecay));
      o.connect(g);
      g.connect(voice);
      o.start(t);
      o.stop(t + pDecay + 0.15);
    }
  }

  function setEnergy(energy: number): void {
    // energy is a sum of 10^mag with exponential decay → compress with log10
    const level = clamp01((Math.log10(energy + 1) - 1.5) / 4.5);
    const t = ctx.currentTime;
    droneGain.gain.setTargetAtTime(0.0001 + level * 0.075, t, 0.4);
    droneFilter.frequency.setTargetAtTime(500 + level * 1400, t, 0.5);
  }

  function dispose(): void {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(0, t, 0.2);
    const all = [...bedOscs, ...droneOscs, bedLfo];
    for (const o of all) {
      try {
        o.stop(t + 0.6);
      } catch {
        /* already stopped */
      }
    }
  }

  return { strike, setEnergy, dispose };
}

// ════════════════════════════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════════════════════════════
export default function TerraPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const quakesRef = useRef<Quake[]>([]);
  const windowRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const startedRef = useRef(false);
  const tempoRef = useRef(1);
  const audioRef = useRef<AudioApi | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const clockRef = useRef(0);
  const energyRef = useRef(0);
  const fireRef = useRef<((q: Quake) => void) | null>(null);
  const dataReadyRef = useRef(false);

  const [feedStatus, setFeedStatus] = useState<FeedStatus>("loading");
  const [started, setStarted] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [tempo, setTempo] = useState(1);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState<{ utc: string; count: number; largest: number }>({
    utc: "—",
    count: 0,
    largest: 0,
  });
  const [lastFired, setLastFired] = useState<{ place: string; mag: number } | null>(null);

  // ── Fetch live feed on mount, fall back to seeded synthetic ────────────────
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    windowRef.current = { start: now - HOUR_MS, end: now };

    const commit = (quakes: Quake[], status: FeedStatus) => {
      if (cancelled) return;
      const inWindow = quakes.filter((q) => q.time >= now - HOUR_MS - 60_000);
      quakesRef.current = inWindow;
      dataReadyRef.current = true;
      setFeedStatus(status);
      const largest = inWindow.reduce((m, q) => Math.max(m, q.mag), 0);
      setReadout((r) => ({ ...r, count: inWindow.length, largest }));
    };

    const applySynthetic = (status: FeedStatus) => commit(makeSyntheticQuakes(now), status);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson", {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<UsgsFeed>;
      })
      .then((feed) => {
        clearTimeout(timeout);
        const quakes = parseUsgs(feed);
        if (quakes.length === 0) {
          applySynthetic("synthetic");
        } else {
          commit(quakes, "live");
        }
      })
      .catch(() => {
        clearTimeout(timeout);
        applySynthetic("error");
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  // ── Readout ticker (reads refs, avoids per-frame React churn) ──────────────
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!startedRef.current) return;
      const d = new Date(clockRef.current);
      const utc = `${d.getUTCHours().toString().padStart(2, "0")}:${d
        .getUTCMinutes()
        .toString()
        .padStart(2, "0")}:${d.getUTCSeconds().toString().padStart(2, "0")} UTC`;
      setReadout((r) => ({ ...r, utc }));
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  // ── Three.js globe + replay loop ───────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglError(
        "WebGL is unavailable here, so the globe can't render — but press Begin and the planet still plays as sound.",
      );
      return runAudioOnlyFallback(startedRef, tempoRef, clockRef, windowRef, quakesRef, energyRef, audioRef);
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const size = () => ({
      w: mount.clientWidth || 800,
      h: mount.clientHeight || 600,
    });
    let { w, h } = size();
    renderer.setSize(w, h);
    renderer.setClearColor(0x07040f, 1);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(0, 0.35, 3.25);
    camera.lookAt(0, 0, 0);

    const globe = new THREE.Group();
    scene.add(globe);

    // Solid dark planet body.
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x150c26 }),
    );
    globe.add(body);

    // Graticule (parallels + meridians) so it reads as a globe — on-brand violet.
    const gratMat = new THREE.LineBasicMaterial({
      color: 0x3a1d78,
      transparent: true,
      opacity: 0.55,
    });
    const gratPts: number[] = [];
    for (let lat = -75; lat <= 75; lat += 15) {
      for (let lon = -180; lon < 180; lon += 4) {
        const a = latLonToVec3(lat, lon, GLOBE_R * 1.002);
        const b = latLonToVec3(lat, lon + 4, GLOBE_R * 1.002);
        gratPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    for (let lon = -180; lon < 180; lon += 15) {
      for (let lat = -88; lat < 88; lat += 4) {
        const a = latLonToVec3(lat, lon, GLOBE_R * 1.002);
        const b = latLonToVec3(lat + 4, lon, GLOBE_R * 1.002);
        gratPts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
    const gratGeo = new THREE.BufferGeometry();
    gratGeo.setAttribute("position", new THREE.Float32BufferAttribute(gratPts, 3));
    globe.add(new THREE.LineSegments(gratGeo, gratMat));

    // Faint atmosphere halo (additive back-side sphere).
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R * 1.12, 48, 32),
      new THREE.MeshBasicMaterial({
        color: 0x5b2ec9,
        transparent: true,
        opacity: 0.14,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    globe.add(halo);

    // Reusable geometries for quake marks.
    const ringGeo = new THREE.RingGeometry(0.82, 1.0, 40);
    const dotGeo = new THREE.SphereGeometry(1, 12, 12);

    interface Ring {
      mesh: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
      born: number;
      life: number;
      maxScale: number;
    }
    interface Dot {
      mesh: THREE.Mesh;
      mat: THREE.MeshBasicMaterial;
    }
    const rings: Ring[] = [];
    const dots: Dot[] = [];

    const warm = new THREE.Color(0xb043e0);
    const hot = new THREE.Color(0xffd9a0);

    const fire = (q: Quake) => {
      audioRef.current?.strike(q);
      energyRef.current += Math.pow(10, q.mag);
      setLastFired({ place: q.place, mag: q.mag });

      const pos = latLonToVec3(q.lat, q.lon, GLOBE_R * 1.01);
      const dir = pos.clone().normalize();
      const magN = clamp01((q.mag - 1) / 6);
      const col = warm.clone().lerp(hot, magN);

      // Shockwave ring, tangent to the surface at the epicentre.
      const rMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, rMat);
      ring.position.copy(pos);
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      const maxScale = 0.16 + magN * 0.5;
      ring.scale.setScalar(0.001);
      globe.add(ring);
      rings.push({ mesh: ring, mat: rMat, born: performance.now(), life: 2000, maxScale });

      // Persistent glowing dot, sized by magnitude.
      const dMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const dot = new THREE.Mesh(dotGeo, dMat);
      dot.position.copy(pos);
      dot.scale.setScalar(0.012 + magN * 0.03);
      globe.add(dot);
      dots.push({ mesh: dot, mat: dMat });
      if (dots.length > 140) {
        const old = dots.shift();
        if (old) {
          globe.remove(old.mesh);
          old.mat.dispose();
        }
      }
    };
    fireRef.current = fire;

    const clearMarks = () => {
      for (const d of dots) {
        globe.remove(d.mesh);
        d.mat.dispose();
      }
      dots.length = 0;
      for (const r of rings) {
        globe.remove(r.mesh);
        r.mat.dispose();
      }
      rings.length = 0;
    };

    // ── Drag-to-rotate (self-rolled orbit) ───────────────────────────────────
    let dragging = false;
    let px = 0;
    let py = 0;
    let velY = 0;
    let velX = 0;
    let tilt = 0.15;
    const dom = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      px = e.clientX;
      py = e.clientY;
      dom.style.cursor = "grabbing";
      dom.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      px = e.clientX;
      py = e.clientY;
      velY = dx * 0.005;
      velX = dy * 0.005;
      globe.rotation.y += velY;
      tilt = Math.max(-1.2, Math.min(1.2, tilt + velX));
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      dom.style.cursor = "grab";
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointercancel", onUp);

    const onResize = () => {
      ({ w, h } = size());
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── Main loop ────────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let cursor = 0; // index into sorted quakes for the current loop
    let initialized = false;

    const initClock = () => {
      const win = windowRef.current;
      const qs = quakesRef.current;
      // Start just before the first quake so a strike lands within ~2 s.
      const first = qs.length ? qs[0].time : win.start;
      clockRef.current = Math.max(win.start, first - 400);
      cursor = 0;
      energyRef.current = 0;
      initialized = true;
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const nowP = performance.now();
      const dt = Math.min(0.05, (nowP - last) / 1000);
      last = nowP;

      // idle auto-rotation + drag inertia
      if (!dragging) {
        globe.rotation.y += 0.03 * dt + velY * 0.9;
        velY *= 0.92;
        velX *= 0.9;
      }
      globe.rotation.x = tilt;

      if (startedRef.current && dataReadyRef.current) {
        if (!initialized) initClock();
        const win = windowRef.current;
        const span = win.end - win.start;
        const rate = (span / REPLAY_MS) * tempoRef.current;
        clockRef.current += dt * 1000 * rate;

        const qs = quakesRef.current;
        while (cursor < qs.length && qs[cursor].time <= clockRef.current) {
          fire(qs[cursor]);
          cursor++;
        }
        // loop the hour
        if (clockRef.current >= win.end) {
          clockRef.current = win.start;
          cursor = 0;
          clearMarks();
        }
        // energy decay + drone tracking
        energyRef.current *= Math.exp(-dt / 7);
        audioRef.current?.setEnergy(energyRef.current);
      }

      // animate rings
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const age = (nowP - r.born) / r.life;
        if (age >= 1) {
          globe.remove(r.mesh);
          r.mat.dispose();
          rings.splice(i, 1);
          continue;
        }
        r.mesh.scale.setScalar(0.001 + r.maxScale * age);
        r.mat.opacity = 0.9 * (1 - age) * (1 - age);
      }
      // gentle dot shimmer
      for (const d of dots) {
        d.mat.opacity = 0.7 + 0.25 * Math.sin(nowP * 0.004 + d.mesh.position.x * 5);
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointercancel", onUp);
      fireRef.current = null;
      clearMarks();
      ringGeo.dispose();
      dotGeo.dispose();
      gratGeo.dispose();
      gratMat.dispose();
      body.geometry.dispose();
      (body.material as THREE.Material).dispose();
      halo.geometry.dispose();
      (halo.material as THREE.Material).dispose();
      renderer.dispose();
      if (dom.parentNode === mount) mount.removeChild(dom);
    };
  }, []);

  // ── Clear the transient "last fired" banner ────────────────────────────────
  useEffect(() => {
    if (!lastFired) return;
    const id = window.setTimeout(() => setLastFired(null), 3500);
    return () => window.clearTimeout(id);
  }, [lastFired]);

  // ── Cleanup audio on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  // ── Begin: create/resume AudioContext inside the user gesture ──────────────
  const onBegin = useCallback(() => {
    if (started) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("no AudioContext");
      const ctx = new Ctor();
      void ctx.resume();
      audioCtxRef.current = ctx;
      audioRef.current = makeAudio(ctx);
    } catch {
      // audio unavailable — visuals still run; leave audioRef null
    }
    startedRef.current = true;
    setStarted(true);
  }, [started]);

  const onTempo = useCallback((v: number) => {
    tempoRef.current = v;
    setTempo(v);
  }, []);

  const statusLabel =
    feedStatus === "live"
      ? "live feed — USGS all_hour"
      : feedStatus === "loading"
        ? "contacting USGS…"
        : "synthetic demo (feed unavailable)";
  const statusClass = feedStatus === "error" ? "text-destructive" : "text-muted-foreground";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* WebGL art canvas */}
      <div ref={mountRef} className="absolute inset-0" aria-hidden />

      {/* No-WebGL notice */}
      {webglError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base text-muted-foreground">{webglError}</p>
        </div>
      )}

      {/* Top-left: title + description + status */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 max-w-xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Terra
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          The last hour of the living planet&rsquo;s earthquakes, replayed as sound and light on a
          globe you can turn.
        </p>
        <p className={`mt-3 font-mono text-xs uppercase tracking-[0.18em] ${statusClass}`}>
          {statusLabel}
        </p>
      </div>

      {/* Top-right: readout */}
      <div className="pointer-events-none absolute right-0 top-0 z-20 p-6 text-right">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          replay clock
        </p>
        <p className="mt-1 font-mono text-base text-foreground">{readout.utc}</p>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          quakes in window
        </p>
        <p className="mt-1 font-mono text-base text-foreground">{readout.count}</p>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          largest magnitude
        </p>
        <p className="mt-1 font-mono text-base text-foreground">
          {readout.largest ? readout.largest.toFixed(1) : "—"}
        </p>
      </div>

      {/* Transient fired-quake banner */}
      {lastFired && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            M {lastFired.mag.toFixed(1)}
          </p>
          <p className="mt-1 text-base text-foreground">{lastFired.place}</p>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-4 p-6">
        {!started ? (
          <button
            type="button"
            onClick={onBegin}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin
          </button>
        ) : (
          <div className="pointer-events-auto flex w-full max-w-md flex-col items-center gap-2">
            <label
              htmlFor="tempo"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              coherence — replay tempo ×{tempo.toFixed(2)}
            </label>
            <input
              id="tempo"
              type="range"
              min={0.25}
              max={3}
              step={0.05}
              value={tempo}
              onChange={(e) => onTempo(parseFloat(e.target.value))}
              className="h-1 w-full max-w-xs cursor-pointer accent-primary"
            />
            <p className="text-center text-sm text-muted-foreground">
              Drag the globe to turn it. Each bloom is a real quake finding its voice.
            </p>
          </div>
        )}
      </div>

      {/* Design notes link */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute bottom-6 right-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Terra</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The Earth is always ringing. This piece takes the last hour of global seismicity
                from the USGS <span className="font-mono">all_hour</span> feed and compresses it into
                a ~90-second looping score. Each earthquake is placed at its true latitude and
                longitude on the globe; when its moment arrives it blooms as a shockwave ring and a
                glowing dot, and sounds a struck modal-resonator bell.
              </p>
              <p>
                Magnitude sets loudness and ring-out length; depth sets brightness and register on a
                continuous logarithmic map (shallow = bright/high, deep = dark/low — never snapped to
                a scale); longitude sets stereo pan (west→left, east→right). A drone pad swells with
                the total released energy, over a continuous ambient bed.
              </p>
              <p>
                If the live feed is unreachable, a seeded synthetic quake stream stands in so the
                planet always plays. Inspired by the Seismic Sound Lab (Holtzman, Candler, Lem;
                Lamont-Doherty / Hayden Planetarium) and framed by SIGGRAPH Real-Time Live! 2026.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Audio-only fallback loop when WebGL is unavailable ───────────────────────
function runAudioOnlyFallback(
  startedRef: RefObject<boolean>,
  tempoRef: RefObject<number>,
  clockRef: RefObject<number>,
  windowRef: RefObject<{ start: number; end: number }>,
  quakesRef: RefObject<Quake[]>,
  energyRef: RefObject<number>,
  audioRef: RefObject<AudioApi | null>,
): () => void {
  let raf = 0;
  let last = performance.now();
  let cursor = 0;
  let initialized = false;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const nowP = performance.now();
    const dt = Math.min(0.05, (nowP - last) / 1000);
    last = nowP;
    if (!startedRef.current) return;
    const win = windowRef.current;
    const qs = quakesRef.current;
    if (!initialized) {
      const first = qs.length ? qs[0].time : win.start;
      clockRef.current = Math.max(win.start, first - 400);
      cursor = 0;
      initialized = true;
    }
    const span = win.end - win.start;
    clockRef.current += dt * 1000 * (span / REPLAY_MS) * tempoRef.current;
    while (cursor < qs.length && qs[cursor].time <= clockRef.current) {
      const q = qs[cursor];
      audioRef.current?.strike(q);
      energyRef.current += Math.pow(10, q.mag);
      cursor++;
    }
    if (clockRef.current >= win.end) {
      clockRef.current = win.start;
      cursor = 0;
    }
    energyRef.current *= Math.exp(-dt / 7);
    audioRef.current?.setEnergy(energyRef.current);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}
