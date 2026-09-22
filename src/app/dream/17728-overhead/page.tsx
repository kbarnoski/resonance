"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17728-overhead — "What if the one crewed outpost overhead — the International
// Space Station crossing the sky right now — conducted one of Karel's real piano
// takes as it passes, sounding present and bright in daylight and dark and
// distant when it slips into Earth's shadow?"
//
//   THE FEED — the ISS's live latitude/longitude/altitude/velocity/visibility is
//   polled every ~4.5 s from api.wheretheiss.at (keyless, CORS *). If the network
//   is blocked or fails, a synthetic 51.6°-inclination great-circle orbit takes
//   over — it sweeps a full pass in ~80 s and flips daylight↔eclipsed across a
//   real subsolar terminator, so the whole day→night mapping is demonstrable with
//   zero network. A mono status line always states which source is live.
//
//   THE SONIFICATION — Karel's real take (default "Isolation") loops through one
//   continuous voice. The station's PLACE plays it:
//     · latitude  → transpose (playbackRate): higher/brighter near the poles.
//     · longitude → stereo pan: the sound orbits your head as the ISS circles.
//     · velocity  → shimmer (tremolo) rate.
//     · altitude  → subtle detune / reverb distance.
//     · DAY/NIGHT → the poetic core: a slow (~3 s) crossfade between a BRIGHT,
//       present, drier timbre in daylight and a DARK, low-passed, reverb-wide,
//       quieter timbre in Earth's shadow. You hear the outpost pass into night.
//   If geolocation is granted, the level swells when the station's footprint is
//   overhead you; denied, it's skipped silently. Everything routes to safeMaster.
//
//   THE GLOBE — a near-black three.js Earth with a faint violet graticule, lit by
//   a directional "sun" so a day/night terminator reads. The ISS is a pale
//   violet-white marker with a fading orbital trail — bright in daylight, dim in
//   eclipse, glow pulsing with the master analyser. If WebGL is unavailable the
//   audio keeps playing.
//
//   REFERENCE — data / telemetry sonification and the auditory-display lineage
//   (ICAD, the International Conference on Auditory Display): mapping a live
//   real-world data stream onto continuous sound, treating orbital telemetry —
//   the living sky overhead — as a score performed in real time.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveToggle } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── constants ────────────────────────────────────────────────────────────────
const ISS_URL = "https://api.wheretheiss.at/v1/satellites/25544";
const POLL_MS = 4500;
const FETCH_TIMEOUT_MS = 4200;

const R = 1.6; // globe radius
const MARKER_ALT = 0.09; // marker sits this far above the surface
const TRAIL_MAX = 150;
const ORBIT_PERIOD_S = 80; // synthetic orbit: full sweep, so a pass reads in ~80 s
const INC = 51.6; // ISS orbital inclination, degrees

const DEFAULT_TRACK_ID = "dad56bd6-8e53-442f-bb19-75ce4cc3e11c"; // "Isolation"

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Geographic (lat, lon in degrees) → point on a sphere of radius r. */
function latLonToVec3(
  lat: number,
  lon: number,
  r: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  const cl = Math.cos(la);
  return out.set(r * cl * Math.cos(lo), r * Math.sin(la), -r * cl * Math.sin(lo));
}

/** Subsolar direction (unit-ish) from the real clock — works offline too. */
function sunDirection(date: Date, out: THREE.Vector3): THREE.Vector3 {
  const utcH =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const subLon = -(utcH - 12) * 15; // solar noon over this longitude
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date.getTime() - start) / 86400000;
  const decl = 23.44 * Math.sin((TAU * (doy - 81)) / 365.25);
  return latLonToVec3(decl, subLon, 1, out).normalize();
}

/** Great-circle distance (km) between two lat/lon points. */
function greatCircleKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * DEG) * Math.cos(bLat * DEG) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

type FeedMode = "live" | "offline" | "connecting";

interface Readout {
  lat: number;
  lon: number;
  altKm: number;
  velKmh: number;
  daylight: boolean;
  overhead: boolean;
}

interface LiveSample {
  lat: number;
  lon: number;
  altKm: number;
  velKmh: number;
  daylight: boolean;
  footprintKm: number;
}

export default function OverheadPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const { immersive, toggle } = useImmersive();

  // ── audio graph refs ─────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const enteredRef = useRef(false);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const tremRef = useRef<GainNode | null>(null);
  const levelRef = useRef<GainNode | null>(null);
  const brightGainRef = useRef<GainNode | null>(null);
  const darkGainRef = useRef<GainNode | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const wetRef = useRef<GainNode | null>(null);
  const ampDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ampRef = useRef(0);

  // ── feed / motion refs (shared with the render loop) ──────────────────────────
  const feedRef = useRef<FeedMode>("offline");
  const liveRef = useRef<LiveSample | null>(null);
  const geoRef = useRef<{ lat: number; lon: number } | null>(null);
  const rafRef = useRef(0);
  const pollTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // eased station position + day/night mix
  const curRef = useRef({ lat: 0, lon: 0, altKm: 420, velKmh: 27550 });
  const dnRef = useRef(1); // 1 = daylight, 0 = eclipsed
  const dayNightRef = useRef(true);
  const synthPhaseRef = useRef(0);
  const nodeLonRef = useRef(0);

  // ── discrete UI state ─────────────────────────────────────────────────────────
  const [started, setStarted] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [feed, setFeed] = useState<FeedMode>("offline");
  const [readout, setReadout] = useState<Readout | null>(null);
  const [trackId, setTrackId] = useState<string>(DEFAULT_TRACK_ID);
  const [trackTitle, setTrackTitle] = useState<string>("Isolation");
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── one poll of the live feed ─────────────────────────────────────────────────
  const pollOnce = useCallback(async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const to = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(ISS_URL, {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        latitude?: number;
        longitude?: number;
        altitude?: number;
        velocity?: number;
        visibility?: string;
        footprint?: number;
      };
      if (typeof j.latitude !== "number" || typeof j.longitude !== "number")
        throw new Error("bad shape");
      liveRef.current = {
        lat: j.latitude,
        lon: j.longitude,
        altKm: typeof j.altitude === "number" ? j.altitude : 420,
        velKmh: typeof j.velocity === "number" ? j.velocity : 27550,
        daylight: j.visibility !== "eclipsed",
        footprintKm: typeof j.footprint === "number" ? j.footprint : 4516,
      };
      feedRef.current = "live";
      setFeed("live");
    } catch {
      // Blocked or failed — fall back to the synthetic orbit. It keeps advancing
      // every frame regardless, so the marker simply continues from there.
      if (feedRef.current !== "offline") {
        feedRef.current = "offline";
        setFeed("offline");
      }
    } finally {
      window.clearTimeout(to);
    }
  }, []);

  // ── load one real take and (re)attach it as the looping source ────────────────
  const attachSource = useCallback(async (id: string) => {
    const ctx = ctxRef.current;
    const trem = tremRef.current;
    if (!ctx || !trem) return;
    setLoadingTrack(true);
    setAudioError(null);
    try {
      const { buffer, title } = await loadRealTrackBuffer(ctx, id);
      if (!ctxRef.current || ctxRef.current.state === "closed") return;
      try {
        srcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(trem);
      src.start(ctx.currentTime, 0);
      srcRef.current = src;
      setTrackTitle(title);
      setTrackId(id);
    } catch {
      setAudioError(
        "That take could not load right now — check your connection and try again.",
      );
    } finally {
      setLoadingTrack(false);
    }
  }, []);

  // ── Begin: build the audio graph, load the take, start polling ────────────────
  const begin = useCallback(async () => {
    if (enteredRef.current) return;

    let ctx = ctxRef.current;
    if (!ctx) {
      try {
        const Ctor: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) {
          setAudioError("Web Audio is unavailable — the globe still tracks the ISS.");
          setStarted(true);
          return;
        }
        ctx = new Ctor();
        ctxRef.current = ctx;
      } catch {
        setAudioError("Audio failed to start — the globe still tracks the ISS.");
        setStarted(true);
        return;
      }
    }
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      /* the tap should have unlocked it */
    }

    let safe = safeRef.current;
    if (!safe) {
      safe = createSafeMaster(ctx);
      safeRef.current = safe;
    }
    ampDataRef.current = new Uint8Array(safe.analyser.frequencyBinCount);

    // Build the persistent voice graph:
    //   src → trem → level → [bright LP → brightGain] + [dark LP → darkGain]
    //       → panner → dry → master ; panner → send → convolver → wet → master
    const trem = ctx.createGain();
    trem.gain.value = 1;
    const level = ctx.createGain();
    level.gain.value = 0.0001;

    const brightLP = ctx.createBiquadFilter();
    brightLP.type = "lowpass";
    brightLP.frequency.value = 9000;
    brightLP.Q.value = 0.6;
    const brightGain = ctx.createGain();
    brightGain.gain.value = 0.9;

    const darkLP = ctx.createBiquadFilter();
    darkLP.type = "lowpass";
    darkLP.frequency.value = 640;
    darkLP.Q.value = 0.7;
    const darkGain = ctx.createGain();
    darkGain.gain.value = 0.15;

    const panner = ctx.createStereoPanner();
    const dry = ctx.createGain();
    dry.gain.value = 0.85;
    const send = ctx.createGain();
    send.gain.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0.2;

    // decaying-noise IR convolver (an effect, not a source — allowed)
    const conv = ctx.createConvolver();
    const irLen = Math.floor(ctx.sampleRate * 3.0);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
      }
    }
    conv.buffer = ir;

    trem.connect(level);
    level.connect(brightLP);
    level.connect(darkLP);
    brightLP.connect(brightGain);
    darkLP.connect(darkGain);
    brightGain.connect(panner);
    darkGain.connect(panner);
    panner.connect(dry);
    dry.connect(safe.input);
    panner.connect(send);
    send.connect(conv);
    conv.connect(wet);
    wet.connect(safe.input);

    tremRef.current = trem;
    levelRef.current = level;
    brightGainRef.current = brightGain;
    darkGainRef.current = darkGain;
    pannerRef.current = panner;
    wetRef.current = wet;

    enteredRef.current = true;
    setStarted(true);
    setAudioOn(true);
    setFeed("connecting");
    feedRef.current = "connecting";

    await attachSource(trackId);

    // start polling the real feed (immediate + interval)
    void pollOnce();
    pollTimerRef.current = window.setInterval(() => void pollOnce(), POLL_MS);

    // optional overhead swell — request quietly, use only if granted
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          geoRef.current = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          };
        },
        () => {
          /* denied — overhead swell is skipped silently */
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
      );
    }
  }, [attachSource, pollOnce, trackId]);

  // ── mute / tear down the audio only ───────────────────────────────────────────
  const stopAudio = useCallback(() => {
    enteredRef.current = false;
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    try {
      abortRef.current?.abort();
    } catch {
      /* none in flight */
    }
    try {
      srcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    srcRef.current = null;
    try {
      safeRef.current?.disconnect();
    } catch {
      /* closing */
    }
    const ctx = ctxRef.current;
    safeRef.current = null;
    ctxRef.current = null;
    tremRef.current = null;
    levelRef.current = null;
    brightGainRef.current = null;
    darkGainRef.current = null;
    pannerRef.current = null;
    wetRef.current = null;
    ampDataRef.current = null;
    if (ctx) void ctx.close();
    setAudioOn(false);
    setFeed("offline");
    feedRef.current = "offline";
  }, []);

  // ── change the take while playing ─────────────────────────────────────────────
  const onSelectTrack = useCallback(
    (id: string) => {
      setTrackId(id);
      if (enteredRef.current) void attachSource(id);
      else {
        const t = REAL_TRACKS.find((x) => x.id === id);
        if (t) setTrackTitle(t.title);
      }
    },
    [attachSource],
  );

  // ── build + run the three.js globe (and the always-on engine loop) ────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = prefersReducedMotion();

    // three.js is optional — audio must survive its absence.
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError(true);
      renderer = null;
    }

    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let marker: THREE.Mesh | null = null;
    let halo: THREE.Mesh | null = null;
    let markerMat: THREE.MeshBasicMaterial | null = null;
    let haloMat: THREE.MeshBasicMaterial | null = null;
    let sunLight: THREE.DirectionalLight | null = null;
    let trailLine: THREE.Line | null = null;
    let trailGeo: THREE.BufferGeometry | null = null;
    let trailMat: THREE.LineBasicMaterial | null = null;

    // disposables
    const disposables: Array<{ dispose: () => void }> = [];
    const trailPos = new Float32Array(TRAIL_MAX * 3);
    const trailCol = new Float32Array(TRAIL_MAX * 3);
    let trailCount = 0;

    let w = mount.clientWidth || window.innerWidth;
    let h = mount.clientHeight || window.innerHeight;

    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      mount.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x04040a);

      camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.set(0, 0.6, 4.3);
      camera.lookAt(0, 0, 0);

      // near-black globe, lit so a terminator reads
      const globeGeo = new THREE.SphereGeometry(R, 64, 48);
      const globeMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a14,
        roughness: 1,
        metalness: 0,
        emissive: 0x06060e,
        emissiveIntensity: 1,
      });
      const globe = new THREE.Mesh(globeGeo, globeMat);
      scene.add(globe);
      disposables.push(globeGeo, globeMat);

      // faint violet graticule
      const gPts: number[] = [];
      const tmp = new THREE.Vector3();
      const gr = R * 1.002;
      for (let lat = -60; lat <= 60; lat += 20) {
        for (let lon = -180; lon < 180; lon += 6) {
          latLonToVec3(lat, lon, gr, tmp);
          gPts.push(tmp.x, tmp.y, tmp.z);
          latLonToVec3(lat, lon + 6, gr, tmp);
          gPts.push(tmp.x, tmp.y, tmp.z);
        }
      }
      for (let lon = -180; lon < 180; lon += 30) {
        for (let lat = -84; lat < 84; lat += 6) {
          latLonToVec3(lat, lon, gr, tmp);
          gPts.push(tmp.x, tmp.y, tmp.z);
          latLonToVec3(lat + 6, lon, gr, tmp);
          gPts.push(tmp.x, tmp.y, tmp.z);
        }
      }
      const gGeo = new THREE.BufferGeometry();
      gGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(gPts, 3),
      );
      const gMat = new THREE.LineBasicMaterial({
        color: 0x5a48a0,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const graticule = new THREE.LineSegments(gGeo, gMat);
      scene.add(graticule);
      disposables.push(gGeo, gMat);

      // sun (directional) + faint ambient so the night side is not pure black
      sunLight = new THREE.DirectionalLight(0xe7e6ff, 2.4);
      sunLight.position.set(5, 2, 5);
      scene.add(sunLight);
      const ambient = new THREE.AmbientLight(0x0c0c18, 1.4);
      scene.add(ambient);

      // ISS marker + additive halo
      const markGeo = new THREE.SphereGeometry(0.045, 16, 12);
      markerMat = new THREE.MeshBasicMaterial({ color: 0xede9ff });
      marker = new THREE.Mesh(markGeo, markerMat);
      scene.add(marker);
      disposables.push(markGeo, markerMat);

      const haloGeo = new THREE.SphereGeometry(0.12, 16, 12);
      haloMat = new THREE.MeshBasicMaterial({
        color: 0xc9b8ff,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      halo = new THREE.Mesh(haloGeo, haloMat);
      scene.add(halo);
      disposables.push(haloGeo, haloMat);

      // fading orbital trail
      trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
      trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
      trailMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      trailLine = new THREE.Line(trailGeo, trailMat);
      trailLine.frustumCulled = false;
      scene.add(trailLine);
      disposables.push(trailGeo, trailMat);
    }

    // scratch vectors
    const issVec = new THREE.Vector3();
    const sunVec = new THREE.Vector3();
    const markVec = new THREE.Vector3();
    let camAngle = 0;
    let uiThrottle = 0;
    let prev = performance.now();

    // seed current position from a plausible spot
    curRef.current.lat = 0;
    curRef.current.lon = 0;

    const frame = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - prev) / 1000));
      prev = ts;

      // advance the synthetic orbit every frame (kept warm as a fallback)
      synthPhaseRef.current += (dt / ORBIT_PERIOD_S) * TAU;
      nodeLonRef.current -= dt * 4.2; // slow westward ground-track precession
      const u = synthPhaseRef.current;
      const iRad = INC * DEG;
      const synthLat = Math.asin(Math.sin(iRad) * Math.sin(u)) / DEG;
      let synthLon =
        (Math.atan2(Math.cos(iRad) * Math.sin(u), Math.cos(u)) / DEG) +
        nodeLonRef.current;
      synthLon = ((((synthLon + 180) % 360) + 360) % 360) - 180;

      // choose the driving sample
      let tgtLat: number;
      let tgtLon: number;
      let altKm: number;
      let velKmh: number;
      let footprintKm: number;
      const mode = feedRef.current;
      const live = liveRef.current;
      if (mode === "live" && live) {
        tgtLat = live.lat;
        tgtLon = live.lon;
        altKm = live.altKm;
        velKmh = live.velKmh;
        footprintKm = live.footprintKm;
      } else {
        tgtLat = synthLat;
        tgtLon = synthLon;
        altKm = 418 + 6 * Math.sin(u * 1.3);
        velKmh = 27500 + 120 * Math.cos(u * 1.3);
        footprintKm = 4516;
      }

      // ease current position toward target (shortest-path longitude)
      const cur = curRef.current;
      const k = 1 - Math.exp(-dt / 0.9);
      let dLon = tgtLon - cur.lon;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;
      cur.lat += (tgtLat - cur.lat) * k;
      cur.lon += dLon * k;
      if (cur.lon > 180) cur.lon -= 360;
      if (cur.lon < -180) cur.lon += 360;
      cur.altKm += (altKm - cur.altKm) * k;
      cur.velKmh += (velKmh - cur.velKmh) * k;

      // sun / terminator direction (drives the visual light + offline daylight)
      sunDirection(new Date(), sunVec);
      if (sunLight) sunLight.position.copy(sunVec).multiplyScalar(6);

      latLonToVec3(cur.lat, cur.lon, 1, issVec);

      // daylight: live from the feed; offline from the real terminator
      let daylight: boolean;
      if (mode === "live" && live) daylight = live.daylight;
      else daylight = issVec.dot(sunVec) > -0.1;
      dayNightRef.current = daylight;

      // ease the day/night mix over ~3 s
      const dnTarget = daylight ? 1 : 0;
      dnRef.current += (dnTarget - dnRef.current) * (1 - Math.exp(-dt / 3.0));
      const dn = dnRef.current;

      // overhead swell (only if geolocation granted)
      let overhead = false;
      let overheadMul = 1;
      const geo = geoRef.current;
      if (geo) {
        const dist = greatCircleKm(geo.lat, geo.lon, cur.lat, cur.lon);
        const radius = footprintKm / 2;
        if (dist < radius) {
          overhead = true;
          overheadMul = 1 + 0.45 * (1 - dist / radius);
        }
      }

      // master analyser amplitude → glow pulse
      const safe = safeRef.current;
      const data = ampDataRef.current;
      if (safe && data) {
        safe.analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        ampRef.current += (rms - ampRef.current) * 0.2;
      }
      const amp = ampRef.current;

      // ── drive the audio from the station's place ──────────────────────────────
      const ctx = ctxRef.current;
      if (ctx) {
        const t = ctx.currentTime;
        const src = srcRef.current;
        if (src) {
          // latitude → transpose (higher near the poles); altitude → fine detune
          const latNorm = clamp(cur.lat / 90, -1, 1);
          const altDet = clamp((cur.altKm - 420) / 20, -1, 1) * 0.01;
          const rate = Math.pow(2, latNorm * 0.14 + altDet);
          src.playbackRate.setTargetAtTime(rate, t, 0.3);
        }
        const trem = tremRef.current;
        if (trem) {
          // velocity → shimmer rate
          const shRate = 2.5 + clamp((cur.velKmh - 27000) / 700, -1, 4);
          const shimmer = 1 + 0.1 * Math.sin(TAU * shRate * (t % 1000));
          trem.gain.setTargetAtTime(shimmer, t, 0.03);
        }
        const level = levelRef.current;
        if (level) {
          const lv = (0.28 + dn * 0.34) * overheadMul;
          level.gain.setTargetAtTime(lv, t, 0.4);
        }
        const panner = pannerRef.current;
        if (panner) {
          panner.pan.setTargetAtTime(clamp(cur.lon / 180, -1, 1), t, 0.25);
        }
        const bg = brightGainRef.current;
        if (bg) bg.gain.setTargetAtTime(0.12 + dn * 0.9, t, 0.25);
        const dg = darkGainRef.current;
        if (dg) dg.gain.setTargetAtTime(0.16 + (1 - dn) * 0.72, t, 0.25);
        const wet = wetRef.current;
        if (wet) wet.gain.setTargetAtTime(0.12 + (1 - dn) * 0.5, t, 0.35);
      }

      // ── visuals ───────────────────────────────────────────────────────────────
      if (renderer && scene && camera) {
        latLonToVec3(cur.lat, cur.lon, R + MARKER_ALT, markVec);
        if (marker) marker.position.copy(markVec);
        if (halo) halo.position.copy(markVec);

        // marker brightness: bright in daylight, dim in eclipse, pulsing with amp
        const bright = 0.25 + dn * 0.75;
        if (markerMat) {
          const c = 0.35 + bright * 0.65 + amp * 0.4;
          markerMat.color.setRGB(
            clamp(c * 0.95, 0, 1),
            clamp(c * 0.93, 0, 1),
            clamp(c, 0, 1),
          );
        }
        if (marker) marker.scale.setScalar(0.8 + bright * 0.5 + amp * 0.8);
        if (haloMat) haloMat.opacity = 0.12 + bright * 0.4 + amp * 0.5;
        if (halo) halo.scale.setScalar(1 + bright * 0.8 + amp * 1.2);

        // trail: push the current point, fade head→tail
        if (trailGeo) {
          if (trailCount < TRAIL_MAX) trailCount++;
          // shift back by one and write newest at index 0
          for (let i = Math.min(trailCount, TRAIL_MAX) - 1; i > 0; i--) {
            trailPos[i * 3] = trailPos[(i - 1) * 3];
            trailPos[i * 3 + 1] = trailPos[(i - 1) * 3 + 1];
            trailPos[i * 3 + 2] = trailPos[(i - 1) * 3 + 2];
          }
          trailPos[0] = markVec.x;
          trailPos[1] = markVec.y;
          trailPos[2] = markVec.z;
          for (let i = 0; i < trailCount; i++) {
            const f = 1 - i / TRAIL_MAX;
            trailCol[i * 3] = 0.55 * f * f;
            trailCol[i * 3 + 1] = 0.42 * f * f;
            trailCol[i * 3 + 2] = 0.95 * f * f;
          }
          trailGeo.setDrawRange(0, trailCount);
          (trailGeo.attributes.position as THREE.BufferAttribute).needsUpdate =
            true;
          (trailGeo.attributes.color as THREE.BufferAttribute).needsUpdate =
            true;
        }

        // gently drifting camera
        if (!reduced) camAngle += dt * 0.05;
        const cr = 4.3;
        camera.position.set(
          Math.sin(camAngle) * cr,
          0.7,
          Math.cos(camAngle) * cr,
        );
        camera.lookAt(0, 0, 0);

        renderer.render(scene, camera);
      }

      // ── throttled chrome updates ───────────────────────────────────────────────
      uiThrottle += dt;
      if (uiThrottle > 0.25) {
        uiThrottle = 0;
        setReadout({
          lat: cur.lat,
          lon: cur.lon,
          altKm: cur.altKm,
          velKmh: cur.velKmh,
          daylight,
          overhead,
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    const onResize = () => {
      if (!renderer || !camera) return;
      w = mount.clientWidth || window.innerWidth;
      h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* noop */
        }
      }
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  // ── full teardown on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      enteredRef.current = false;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      try {
        abortRef.current?.abort();
      } catch {
        /* none */
      }
      try {
        srcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      try {
        safeRef.current?.disconnect();
      } catch {
        /* closing */
      }
      const ctx = ctxRef.current;
      safeRef.current = null;
      ctxRef.current = null;
      if (ctx) void ctx.close();
    };
  }, []);

  const feedLabel =
    feed === "live"
      ? "ISS · live (wheretheiss.at)"
      : feed === "offline"
        ? "sample orbit (offline)"
        : "ISS · connecting…";

  const fmt = (n: number, d = 1) => n.toFixed(d);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* three.js globe */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none select-none"
        aria-hidden
      />

      {glError && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL is unavailable, so the globe can&rsquo;t render — but the ISS
            sonification keeps playing. Try another browser to see the orbit.
          </p>
        </div>
      )}

      {/* always-on status line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 p-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span
          className={feed === "live" ? "text-foreground" : "text-muted-foreground"}
        >
          {feedLabel}
        </span>
        {readout && (
          <>
            <span>
              lat {fmt(readout.lat)}° · lon {fmt(readout.lon)}°
            </span>
            <span>
              alt {fmt(readout.altKm, 0)} km · {fmt(readout.velKmh, 0)} km/h
            </span>
            <span
              className={readout.daylight ? "text-foreground" : "text-muted-foreground/70"}
            >
              {readout.daylight ? "daylight" : "eclipsed"}
            </span>
            {readout.overhead && <span className="text-foreground">overhead</span>}
          </>
        )}
        {audioOn && <span>take · {trackTitle}</span>}
        {audioError && <span className="text-destructive">{audioError}</span>}
      </div>

      {/* write-up chrome — hidden while immersive */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="pointer-events-auto max-w-md">
              <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                17728 · overhead
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                The station conducts a piano take as it passes
              </h1>
              <p className="mt-1 text-base text-muted-foreground">
                The ISS crossing the sky right now performs one of Karel&rsquo;s
                real recordings — bright and present in daylight, dark and distant
                when it slips into Earth&rsquo;s shadow.
              </p>
            </div>
            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              {!audioOn ? (
                <button
                  type="button"
                  onClick={begin}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {started ? "Begin again" : "Begin"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopAudio}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Mute
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
              <ImmersiveToggle immersive={immersive} onToggle={toggle} />
            </div>
          </div>

          {/* track picker */}
          <div className="pointer-events-auto flex items-center gap-2">
            <label
              htmlFor="track"
              className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              take
            </label>
            <select
              id="track"
              value={trackId}
              onChange={(e) => onSelectTrack(e.target.value)}
              disabled={loadingTrack}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {REAL_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
            {loadingTrack && (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                loading…
              </span>
            )}
          </div>
        </div>
      )}

      {/* immersive exit pill */}
      {immersive && <ImmersiveToggle immersive={immersive} onToggle={toggle} />}

      {!started && !immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-base text-muted-foreground">
            Press <span className="text-foreground">Begin</span> — the globe
            already tracks a sample orbit; the tap starts the live feed and the
            piano the station carries overhead.
          </p>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg space-y-3 rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              An outpost overhead as a live score
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              The station&rsquo;s live latitude, longitude, altitude, velocity and
              day/night visibility come from api.wheretheiss.at, polled every
              4.5 s. Latitude transposes the take (higher near the poles);
              longitude pans it, so the sound orbits your head as the ISS circles
              the globe; velocity sets a gentle shimmer; altitude adds a subtle
              detune. The poetic core is the terminator: crossing from daylight
              into Earth&rsquo;s shadow slowly (~3 s) crossfades a bright, present,
              drier timbre into a dark, low-passed, reverb-wide, quieter one — you
              hear the outpost pass into night.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              If the feed is blocked or fails, a synthetic 51.6°-inclination
              great-circle orbit takes over, sweeping a full pass in about 80 s
              and flipping day↔night across the real subsolar terminator — so the
              whole mapping is demonstrable with zero network. The status line
              always says which source is live. Every sound is Karel&rsquo;s one
              decoded take, routed through the shared ear-safety master; there are
              no synths or oscillators.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              After the data / telemetry sonification tradition and the
              auditory-display lineage (ICAD, the International Conference on
              Auditory Display): the living sky overhead — orbital telemetry — read
              in real time as a score.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {!immersive && <PrototypeNav slugs={["17728-overhead"]} />}
    </main>
  );
}
