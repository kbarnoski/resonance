/**
 * Audio Engine Singleton
 *
 * A module-level singleton that creates the AudioContext, HTMLAudioElement,
 * and Web Audio node graph exactly once. Survives across route changes because
 * it lives outside the React component tree.
 *
 * Audio graph:  source -> analyser -> gain -> destination
 *
 * CRITICAL: createMediaElementSource() can only be called ONCE per HTMLAudioElement.
 * The singleton pattern enforces this constraint.
 */

import { NativeAnalyserNode } from "./native-analyser";

/** Union type: either browser AnalyserNode or native NativeAnalyserNode */
export type AnalyserLike = AnalyserNode | NativeAnalyserNode;

let audioContext: AudioContext | null = null;
let audioElement: HTMLAudioElement | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let analyserNode: AnalyserNode | null = null;
let gainNode: GainNode | null = null;
let ambientOsc: OscillatorNode | null = null;
let ambientGain: GainNode | null = null;

export interface AudioEngine {
  audioContext: AudioContext;
  audioElement: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode;
  analyserNode: AnalyserNode;
  gainNode: GainNode;
}

export function getAudioEngine(): AudioEngine {
  if (typeof window === "undefined") {
    throw new Error("AudioEngine can only be used in the browser");
  }

  if (!audioContext) {
    // PLAYBACK buffering (Karel 2026-10-12, Cosmic Drift: "a quick static
    // connection disruption sound … a quick distorted sound"): the default
    // "interactive" hint runs tiny render quanta meant for live instruments —
    // any CPU spike on the kiosk starved them into a crackle. Recorded music
    // only needs "playback": larger buffers that ride through load spikes
    // (the added latency is inaudible here; Live Theatre only analyses the mic).
    audioContext = new AudioContext({ latencyHint: "playback" });
  }

  if (!audioElement) {
    audioElement = new Audio();
    // LAB ONLY (?lab=1): the filming rig seeks into a journey via window.__resonanceAudio
    // (kept in sessionStorage: the kiosk loop's navigations drop the query)
    try {
      if (typeof window !== "undefined") {
        if (new URLSearchParams(location.search).get("lab") === "1") sessionStorage.setItem("resonance-lab", "1");
        if (sessionStorage.getItem("resonance-lab") === "1") (window as unknown as { __resonanceAudio?: HTMLAudioElement }).__resonanceAudio = audioElement;
      }
    } catch { /* no-op */ }
    audioElement.crossOrigin = "anonymous";
    audioElement.preload = "auto";
  }

  if (!sourceNode) {
    sourceNode = audioContext.createMediaElementSource(audioElement);

    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.8;

    gainNode = audioContext.createGain();

    sourceNode.connect(analyserNode);
    analyserNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
  }

  return {
    audioContext: audioContext!,
    audioElement: audioElement!,
    sourceNode: sourceNode!,
    analyserNode: analyserNode!,
    gainNode: gainNode!,
  };
}

export function getAnalyserNode(): AnalyserNode | null {
  return analyserNode;
}

// ─── LIVE THEATRE: the microphone drives the visuals ─────────────
// Karel 2026-10-11: he plays the Nord live through the Hyperboom; the Mac
// only LISTENS (built-in mic) and the visuals follow his playing. Rewired
// for the live page only (a full page load enters and leaves it):
//   track element -> (nothing)              (the silent clock track)
//   mic -> preamp -> analyser -> mute(0) -> destination
// The analyser hears ONLY the mic, and the mic can never reach the speakers
// (the mute keeps the analyser pulled by the graph without making a sound).
let micSource: MediaStreamAudioSourceNode | null = null;

/** Live mode: feed the shared analyser from the microphone instead of the
 *  track. Resolves false when the mic is unavailable (no permission / no
 *  device) — the visuals then simply drift on their own. */
export type LiveSource = "mic" | "laptop" | "both";
/** Which input devices a live source listens to, by label (2026-10-15: the
 *  Mac's DEFAULT input was a virtual NDI device — plain getUserMedia heard
 *  silence, and an iPhone Continuity mic can appear too). "mic" = the built-in
 *  MacBook mic; "laptop" = the BlackHole loopback (the laptop's own sound,
 *  via a Multi-Output device); "both" = mixed. Exported for tests. */
export function pickLiveInputs(devices: readonly { kind: string; deviceId: string; label: string }[], src: LiveSource): { mic: string | null; laptop: string | null } {
  const ins = devices.filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications");
  // the LAPTOP'S OWN mic is the default (Karel 2026-10-16: "allow laptop mic
  // and is the default for now"); a plugged-in mic / interface only when there
  // is no built-in one
  const virtual = /ndi|blackhole|iphone|ipad|virtual|loopback|zoom|teams|parrot|microsoft|aggregate|multi-output/i;
  const builtIn = /macbook.*microphone|built-?in.*microphone/i;
  const mic = ins.find((d) => builtIn.test(d.label))
    ?? ins.find((d) => !virtual.test(d.label));
  const laptop = ins.find((d) => /blackhole/i.test(d.label)) ?? ins.find((d) => /loopback/i.test(d.label));
  return { mic: src === "laptop" ? null : mic?.deviceId ?? null, laptop: src === "mic" ? null : laptop?.deviceId ?? null };
}
let liveStreams: MediaStream[] = [];
/** What live mode is actually listening to (the kiosk status + events log):
 *  which source was asked for, the input labels heard, and what is missing
 *  (QA 2026-10-15: "both" without BlackHole said only "on" — it must say the
 *  laptop half is unavailable). */
export interface LiveInputStatus {
  src: LiveSource;
  ok: boolean;
  inputs: string[];
  missing: ("mic" | "laptop")[];
  note: string | null;
}
let liveInputStatus: LiveInputStatus | null = null;
export function getLiveInputStatus(): LiveInputStatus | null {
  return liveInputStatus;
}
/** The status line for a source + what was found. Pure — tested. */
export function describeLiveInputs(src: LiveSource, picks: { mic: string | null; laptop: string | null }, heard: string[], fellBackToDefault: boolean, error?: string): LiveInputStatus {
  const missing: ("mic" | "laptop")[] = [];
  if (src !== "laptop" && !picks.mic && !fellBackToDefault) missing.push("mic");
  if (src !== "mic" && !picks.laptop) missing.push("laptop");
  const ok = heard.length > 0;
  const notes: string[] = [];
  if (error) notes.push(`input refused (${error})`);
  if (missing.includes("laptop")) notes.push("laptop sound unavailable — BlackHole not installed");
  if (missing.includes("mic")) notes.push("built-in mic not found");
  if (fellBackToDefault) notes.push("built-in mic not found by name — using the default input");
  if (!ok) notes.push("visuals drift on their own");
  return { src, ok, inputs: heard, missing, note: notes.length ? notes.join("; ") : null };
}
export async function attachMicDrive(preampGain = 2, src: LiveSource = "mic"): Promise<boolean> {
  if (micSource) return true;
  const eng = getAudioEngine();
  const raw = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  const streams: MediaStream[] = [];
  let picks: { mic: string | null; laptop: string | null } = { mic: null, laptop: null };
  let fellBack = false;
  try {
    // one plain request first: it grants the permission, which unlocks device labels
    const probe = await navigator.mediaDevices.getUserMedia({ audio: raw });
    picks = pickLiveInputs(await navigator.mediaDevices.enumerateDevices(), src);
    probe.getTracks().forEach((t) => t.stop());
    for (const id of [picks.mic, picks.laptop]) {
      if (!id) continue;
      try { streams.push(await navigator.mediaDevices.getUserMedia({ audio: { ...raw, deviceId: { exact: id } } })); } catch { /* that input failed: the other still drives */ }
    }
    // no match (labels hidden / nothing installed): the default input, as before
    if (!streams.length && src !== "laptop") {
      streams.push(await navigator.mediaDevices.getUserMedia({ audio: raw }));
      fellBack = true;
    }
  } catch (e) {
    streams.forEach((st) => st.getTracks().forEach((t) => t.stop()));
    liveInputStatus = describeLiveInputs(src, picks, [], false, e instanceof Error ? e.name : String(e));
    return false;
  }
  liveInputStatus = describeLiveInputs(src, picks, streams.flatMap((st) => st.getAudioTracks().map((t) => t.label)), fellBack);
  if (!streams.length) return false;
  liveStreams = streams;
  // an input that drops mid-show (unplugged / permission pulled) is reported, never silent
  for (const st of streams) for (const t of st.getAudioTracks()) {
    t.addEventListener("ended", () => {
      if (!liveInputStatus) return;
      const left = liveStreams.flatMap((x) => x.getAudioTracks().filter((y) => y.readyState === "live").map((y) => y.label));
      liveInputStatus = { ...liveInputStatus, ok: left.length > 0, inputs: left, note: `input lost: ${t.label}${left.length ? "" : " — visuals drift on their own"}` };
    });
  }
  const ctx = eng.audioContext;
  // The clock track is disconnected OUTRIGHT: the element still plays and
  // advances (the visuals' clock) but has no path to the speakers, so no
  // volume restore anywhere can ever play it over Karel's live set.
  try { eng.sourceNode.disconnect(); } catch { /* not connected */ }
  try { eng.analyserNode.disconnect(); } catch { /* not connected */ }
  const mute = ctx.createGain();
  mute.gain.value = 0;
  eng.analyserNode.connect(mute);
  mute.connect(ctx.destination);
  const preamp = ctx.createGain();
  preamp.gain.value = preampGain;
  preamp.connect(eng.analyserNode);
  for (const st of liveStreams) {
    const node = ctx.createMediaStreamSource(st);
    node.connect(preamp);
    micSource ??= node;
  }
  return true;
}
/** The input labels live mode is listening to (diagnostics / the events log). */
export function liveInputLabels(): string[] {
  return liveStreams.flatMap((st) => st.getAudioTracks().map((t) => t.label));
}

// ─── LIVE SET: a set's tracks play AUDIBLY and drive the visuals ───
// Tramokyo 2026-10-15 (the Joseph set). Same rewire as the mic drive — the
// world's clock track is cut off from the speakers — but the source is a
// second media element playing the set:
//   track element -> (nothing)                        (the silent clock)
//   set element -> setGain -> destination             (heard)
//                  setGain -> analyser -> mute(0) -> destination  (drives)
// The analyser follows the set's fades too, so the visuals breathe with them.
let setGain: GainNode | null = null;
let setSource: MediaElementAudioSourceNode | null = null;
export function attachSetDrive(el: HTMLAudioElement): GainNode | null {
  if (setGain) return setGain;
  if (micSource) return null; // a page is one or the other
  const eng = getAudioEngine();
  const ctx = eng.audioContext;
  try {
    setSource = ctx.createMediaElementSource(el);
  } catch {
    return null;
  }
  try { eng.sourceNode.disconnect(); } catch { /* not connected */ }
  try { eng.analyserNode.disconnect(); } catch { /* not connected */ }
  const mute = ctx.createGain();
  mute.gain.value = 0;
  eng.analyserNode.connect(mute);
  mute.connect(ctx.destination);
  setGain = ctx.createGain();
  setGain.gain.value = 0; // the set fades itself in
  setSource.connect(setGain);
  setGain.connect(ctx.destination);
  setGain.connect(eng.analyserNode);
  return setGain;
}
/** Ramp the live set's gain (never a step). Resolves after the ramp. */
export function rampSetGain(target: number, ms: number): Promise<void> {
  if (!setGain || !audioContext) return Promise.resolve();
  try {
    const now = audioContext.currentTime;
    setGain.gain.cancelScheduledValues(now);
    setGain.gain.setValueAtTime(setGain.gain.value, now);
    setGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, target)), now + ms / 1000);
  } catch { /* context closing */ }
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Gain envelopes — the "never abrupt" law, applied to audio ───
// Every pause / stop / src-swap should ride a short linear ramp instead of
// cutting. Ramps are deliberately short (~200ms) so rapid transitions
// (installation loop journey handoffs) never stack or lag, and every ramp
// cancels previously scheduled values first so overlapping calls can't fight.

/** Canonical ramp length for stop/pause/src-swap fades */
export const GAIN_RAMP_MS = 200;
/** Shorter ramp for volume / mute changes — removes the click without lag */
export const VOLUME_RAMP_MS = 120;

/** The gain the engine should sit at while audibly playing (user volume).
 *  tryPlay restores to this so no play path can start stuck at 0 after a fade. */
let targetGain = 1;

/**
 * Ramp the master gain to `target` over `ms` milliseconds.
 * Cancels any in-flight ramp first (cancelScheduledValues + re-pin current
 * value) so back-to-back calls always start from the actual current gain.
 * Resolves after the ramp duration has elapsed.
 */
export function rampGainTo(target: number, ms: number = GAIN_RAMP_MS): Promise<void> {
  if (!audioContext || !gainNode) return Promise.resolve();
  try {
    const now = audioContext.currentTime;
    const gain = gainNode.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(Math.max(0, target), now + ms / 1000);
  } catch {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Set the user-intended volume with a smooth ramp (no gain step click). */
export function setEngineVolume(volume: number): void {
  targetGain = Math.max(0, Math.min(1, volume));
  void rampGainTo(targetGain, VOLUME_RAMP_MS);
}

/** Fade the master gain to silence, then run the action (pause / src swap /
 *  stop). Gain stays at 0 afterward — the next tryPlay ramps it back up. */
export async function fadeOutThen(action: () => void, ms: number = GAIN_RAMP_MS): Promise<void> {
  await rampGainTo(0, ms);
  action();
}

export function getDataArray(): Uint8Array | null {
  if (!analyserNode) return null;
  return new Uint8Array(analyserNode.frequencyBinCount);
}

/** Resume AudioContext after user gesture (browser autoplay policy) */
export async function ensureResumed(): Promise<void> {
  // iOS Safari parks the context in "interrupted" (not "suspended")
  // after a phone call / Siri / route change; without resuming it the
  // element keeps advancing silently while every watchdog reports
  // healthy playback (2026-09-19 audit).
  if (
    audioContext &&
    (audioContext.state === "suspended" ||
      (audioContext.state as string) === "interrupted")
  ) {
    await audioContext.resume();
  }
}

// HTMLAudioElement.play() only works if first called inside a user
// gesture (iOS Safari is strict, Chrome/Firefox depend on autoplay
// policy). After one successful play() in a gesture the element is
// "unlocked" for the session — subsequent src changes + plays work
// even from async callbacks. Must run synchronously from the click.
let audioElementUnlocked = false;
let lastPrimingError: string | null = null;
let lastPlayError: string | null = null;
export function isAudioElementUnlocked(): boolean { return audioElementUnlocked; }
export function getLastPrimingError(): string | null { return lastPrimingError; }
export function getLastPlayError(): string | null { return lastPlayError; }
export function setLastPlayError(err: string | null): void { lastPlayError = err; }
/** Wrap audio.play() to capture its rejection reason for diagnostics.
 *  audio-provider, the watchdog, and anywhere else that calls play()
 *  on the engine element should funnel through here. */
export function tryPlay(el: HTMLAudioElement): Promise<void> {
  // Restore the master gain toward the user volume with a short ramp.
  // Every stop/pause fade parks the gain at 0 — without this, any play
  // path (provider, watchdog, installation loop) could start silent.
  void rampGainTo(targetGain, GAIN_RAMP_MS);
  const p = el.play();
  if (!p || typeof p.then !== "function") return Promise.resolve();
  return p.then(
    () => { lastPlayError = null; },
    (err: unknown) => {
      lastPlayError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      // AbortError = a pause() landed while this play() was still
      // resolving. Benign: end-of-track + credits handoff, or any
      // play/pause sync race. Still recorded in lastPlayError for
      // diagnostics; just don't pollute the console with it.
      if (err instanceof Error && err.name === "AbortError") return;
      // eslint-disable-next-line no-console
      console.warn("[audio] play() rejected:", lastPlayError);
    }
  );
}

let primingInFlight = false;

export function primeAudioElement(): void {
  if (audioElementUnlocked) return;
  // CRITICAL: also early-return if a previous prime call is in flight
  // OR if the audio element already has a non-silent src loaded. The
  // installation loop hits a race here — Begin-tap fires
  // primeAudioElement, which sets src to silent WAV + calls play();
  // before that play() promise resolves, the loop client's
  // setQueue+startJourney runs and audio-provider replaces the src
  // with the journey's track. The silent WAV's play() never resolves
  // (src was swapped), so audioElementUnlocked stays false. Without
  // this guard, every subsequent touch event on the page re-ran
  // primeAudioElement, which yanked src back to the silent WAV mid-
  // journey — read by the user as "tap stops audio, tap again starts
  // it" (the second tap let the new prime complete + audio-provider
  // re-loaded the journey).
  if (primingInFlight) return;
  const engine = getAudioEngine();
  const el = engine.audioElement;
  // If src is already set to a non-data URL, the audio-provider has
  // already loaded a real track. Don't yank it.
  if (el.src && !el.src.startsWith("data:")) {
    audioElementUnlocked = true;
    return;
  }
  primingInFlight = true;
  el.src =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAVFYAAKhWAAACABAAZGF0YQAAAAA=";
  el.muted = false;
  el.volume = 1.0;
  const p = el.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      audioElementUnlocked = true;
      primingInFlight = false;
      lastPrimingError = null;
    }).catch((err: unknown) => {
      lastPrimingError = err instanceof Error ? err.message : String(err);
      primingInFlight = false;
      // eslint-disable-next-line no-console
      console.warn("[audio] primeAudioElement play() rejected:", err);
    });
  } else {
    audioElementUnlocked = true;
    primingInFlight = false;
  }
}

/**
 * Start a silent ambient oscillator connected to the analyser.
 * Used when no track is playing so shaders still receive data.
 */
export function startAmbient(): void {
  if (ambientOsc || !audioContext || !analyserNode) return;

  ambientOsc = audioContext.createOscillator();
  ambientGain = audioContext.createGain();
  ambientGain.gain.value = 0; // silent
  ambientOsc.connect(ambientGain);
  ambientGain.connect(analyserNode);
  ambientOsc.start();
}

export function stopAmbient(): void {
  if (ambientOsc) {
    try { ambientOsc.stop(); } catch {}
    ambientOsc = null;
  }
  if (ambientGain) {
    try { ambientGain.disconnect(); } catch {}
    ambientGain = null;
  }
}

// ─── Native analyser singleton (desktop mode) ───

let nativeAnalyser: NativeAnalyserNode | null = null;

export function initNativeAnalyser(): NativeAnalyserNode {
  if (!nativeAnalyser) {
    nativeAnalyser = new NativeAnalyserNode();
  }
  return nativeAnalyser;
}

export function getNativeAnalyser(): NativeAnalyserNode | null {
  return nativeAnalyser;
}
