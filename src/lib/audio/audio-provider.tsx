"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAudioStore } from "./audio-store";
import { getAudioEngine, ensureResumed, tryPlay, startAmbient, stopAmbient, initNativeAnalyser } from "./audio-engine";
import { resolveAudioUrl } from "./resolve-audio-url";
import {
  isDesktopApp,
  nativeAudioLoad,
  nativeAudioPlay,
  nativeAudioPause,
  nativeAudioSetVolume,
  nativeAudioSubscribe,
  type AudioDataPayload,
} from "@/lib/tauri";
import {
  updateMediaSession,
  setMediaSessionPlaybackState,
  registerMediaSessionHandlers,
} from "@/lib/media-session";
import { syncAdminFeedbackFromDb } from "@/lib/journeys/adaptive-engine";
import { loadBuiltInEnrichments } from "@/lib/journeys/built-in-enrichments";

/**
 * AudioProvider bridges the Zustand store to the audio engine singleton.
 * Renders in the root layout — never unmounts during client-side navigation.
 *
 * Key invariant: when a new track is loaded, we must wait for `canplay`
 * before seeking + playing, otherwise the browser ignores the seek and
 * play() may reject or start from 0.
 */
export function AudioProvider({ children }: { children: React.ReactNode }) {
  const engineReady = useRef(false);
  const rafRef = useRef<number>(0);
  const lastSrcRef = useRef<string>("");
  const loadingNewSrc = useRef(false);

  // Native audio mode (desktop app)
  const nativeMode = useRef(false);
  const nativeSubscribed = useRef(false);
  const nativeFailedTracks = useRef(new Set<string>());

  const isPlaying = useAudioStore((s) => s.isPlaying);
  const currentTrack = useAudioStore((s) => s.currentTrack);
  const volume = useAudioStore((s) => s.volume);

  const initEngine = useCallback(() => {
    if (engineReady.current) return;
    try {
      getAudioEngine();
      engineReady.current = true;
    } catch {
      // SSR guard
    }
  }, []);

  // Admin cross-origin feedback sync — pulls admin's full thumbs history
  // from the DB into localStorage on page load so the adaptive engine
  // trains on the unified record (localhost + prod + every other origin
  // admin has used). The endpoint is server-gated by ADMIN_EMAIL, so
  // non-admin users silently no-op. Runs once per session.
  useEffect(() => {
    syncAdminFeedbackFromDb().catch(() => {});
  }, []);

  // Built-in journey enrichments — pull the per-journey aiPromptSequence
  // cache (populated by the admin bulk-backfill endpoint) so every user
  // gets Ghost-level multi-variant imagery on built-in journeys. Runs
  // once per session; startJourney overlays the cached sequences before
  // handing the journey to the engine.
  useEffect(() => {
    loadBuiltInEnrichments().catch(() => {});
  }, []);

  // ─── Native audio setup (desktop mode) ───
  useEffect(() => {
    if (!isDesktopApp()) return;
    nativeMode.current = true;

    // Initialize the NativeAnalyserNode + subscribe to Rust FFT data
    const analyser = initNativeAnalyser();

    if (!nativeSubscribed.current) {
      nativeSubscribed.current = true;
      nativeAudioSubscribe((data: AudioDataPayload) => {
        analyser.updateFromNative(data.bins);
        // Sync time/duration from Rust to store (throttled by Rust's ~60Hz emit rate)
        const store = useAudioStore.getState();
        if (data.isPlaying && Math.abs(store.currentTime - data.currentTime) > 0.1) {
          store.setCurrentTime(data.currentTime);
        }
        if (data.duration > 0 && Math.abs(store.duration - data.duration) > 0.5) {
          store.setDuration(data.duration);
        }
      }).catch((err) => {
        console.warn("Native audio subscribe failed:", err);
        nativeMode.current = false;
      });
    }

    // Listen for track-ended event from Rust
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("native-audio-ended", () => {
        const { installationMode } = useAudioStore.getState();
        if (installationMode) {
          useAudioStore.getState().playNext();
        } else {
          useAudioStore.getState().pause();
        }
      }).then((fn) => { unlisten = fn; });
    });

    return () => { unlisten?.(); };
  }, []);

  // ─── Track changes — load new src, wait for canplay, then seek + play ───
  useEffect(() => {
    if (!currentTrack) return;

    // ── Native audio path (desktop) ──
    if (nativeMode.current && !nativeFailedTracks.current.has(currentTrack.id)) {
      const newSrc = currentTrack.audioUrl;
      const isNewSrc = lastSrcRef.current !== newSrc;

      if (isNewSrc) {
        const shouldSkip = useAudioStore.getState()._skipLoad;
        if (shouldSkip) {
          lastSrcRef.current = newSrc;
          useAudioStore.setState({ _skipLoad: false });
          stopAmbient();
          return;
        }

        stopAmbient();
        lastSrcRef.current = newSrc;

        // Resolve URL then load via Rust
        resolveAudioUrl(newSrc, currentTrack.id)
          .then((resolvedUrl) => nativeAudioLoad(resolvedUrl, currentTrack.id))
          .then(() => {
            // Auto-play if the store says we should be playing
            if (useAudioStore.getState().isPlaying) {
              return nativeAudioPlay();
            }
          })
          .catch((err) => {
            console.warn("Native audio failed for", currentTrack.id, err);
            nativeFailedTracks.current.add(currentTrack.id);
            // Fall through to browser path on next render
            lastSrcRef.current = "";
            useAudioStore.setState({ currentTrack: { ...currentTrack } });
          });
      }
      return; // Native handles the rest via Channel callback
    }

    // ── Browser audio path (original logic) ──
    // Ensure engine is ready (may already be initialized from a click handler)
    initEngine();
    if (!engineReady.current) return;

    const { audioElement } = getAudioEngine();
    const newSrc = currentTrack.audioUrl;
    const isNewSrc = lastSrcRef.current !== newSrc;

    if (isNewSrc) {
      const shouldSkip = useAudioStore.getState()._skipLoad;
      if (shouldSkip) {
        // Audio already loaded and playing (set by WaveSurfer's togglePlay) — skip reload
        lastSrcRef.current = newSrc;
        loadingNewSrc.current = false;
        useAudioStore.setState({ _skipLoad: false });
        stopAmbient();
      } else {
        // Normal async load flow (library browser, queue auto-advance, etc.)
        // Pause IMMEDIATELY before awaiting resolveAudioUrl. Otherwise
        // the old audio buffer keeps playing during the URL resolution
        // window — produces a "previous song bleeds for a moment, then
        // new song loads" glitch when switching journeys quickly.
        try { audioElement.pause(); } catch { /* element may not be ready */ }
        stopAmbient();
        loadingNewSrc.current = true;
        lastSrcRef.current = newSrc;

        resolveAudioUrl(newSrc, currentTrack.id).then((resolvedUrl) => {
          audioElement.src = resolvedUrl;
          audioElement.load();
        });
      }
    } else {
      // Same src — check if we need to seek or resume
      const state = useAudioStore.getState();
      const needsSeek = Math.abs(audioElement.currentTime - state.currentTime) > 1;
      if (needsSeek) {
        audioElement.currentTime = state.currentTime;
      }
      if (audioElement.paused && state.isPlaying) {
        ensureResumed().then(() => {
          tryPlay(audioElement);
        });
      }
    }

    const onLoadedMetadata = () => {
      useAudioStore.getState().setDuration(audioElement.duration);
    };

    const onCanPlay = async () => {
      if (!loadingNewSrc.current) return;
      loadingNewSrc.current = false;

      // Seek to the stored currentTime (from WaveSurfer or previous position)
      const state = useAudioStore.getState();
      if (state.currentTime > 0.5) {
        audioElement.currentTime = state.currentTime;
      }

      // Now play if the store says we should be playing
      if (state.isPlaying) {
        await ensureResumed();
        await tryPlay(audioElement);
      }
    };

    const onEnded = () => {
      // Sync final currentTime — RAF loop won't update once audio is paused,
      // so the store could miss the last fraction of a second. This is critical
      // for journey completion detection (currentTime >= duration - 0.5).
      if (!isNaN(audioElement.duration) && audioElement.duration > 0) {
        useAudioStore.getState().setCurrentTime(audioElement.duration);
      }

      const { installationMode, queue } = useAudioStore.getState();
      // Installation loop client manages its own sequence advancement.
      // Each journey gets queued as a single-track queue; if we called
      // playNext() here it would wrap and restart the same track,
      // racing the loop client's setQueue+startJourney for the next
      // journey and stranding the audio element in a paused state.
      // For multi-track queues (the legacy single-journey installation
      // mode), keep the auto-advance behavior so it still works.
      if (installationMode && queue.length > 1) {
        useAudioStore.getState().playNext();
      } else {
        // Just stop — viz keeps running, loop client (or user) decides next
        useAudioStore.getState().pause();
      }
    };

    const onError = () => {
      loadingNewSrc.current = false;
      // In installation mode a broken track must NEVER strand the loop.
      // Advance to the next queued track (the loop client wraps if past
      // the end), so a single bad recording doesn't leave the kiosk
      // silent forever. Outside installation mode, fall back to pausing.
      const { installationMode } = useAudioStore.getState();
      if (installationMode) {
        // eslint-disable-next-line no-console
        console.warn("[audio] track load error in installation mode — advancing");
        useAudioStore.getState().playNext();
      } else {
        useAudioStore.getState().pause();
      }
    };

    audioElement.addEventListener("loadedmetadata", onLoadedMetadata);
    audioElement.addEventListener("canplay", onCanPlay);
    audioElement.addEventListener("ended", onEnded);
    audioElement.addEventListener("error", onError);

    return () => {
      audioElement.removeEventListener("loadedmetadata", onLoadedMetadata);
      audioElement.removeEventListener("canplay", onCanPlay);
      audioElement.removeEventListener("ended", onEnded);
      audioElement.removeEventListener("error", onError);
    };
  }, [currentTrack]);

  // ─── Play / pause sync (for same-track pause/resume only) ───
  useEffect(() => {
    if (!currentTrack) return;

    if (nativeMode.current && !nativeFailedTracks.current.has(currentTrack.id)) {
      if (isPlaying) {
        nativeAudioPlay().catch(() => {});
      } else {
        nativeAudioPause().catch(() => {});
      }
      return;
    }

    if (!engineReady.current) return;
    // Skip if we're in the middle of loading a new src — canplay handler will play
    if (loadingNewSrc.current) return;

    const { audioElement } = getAudioEngine();

    if (isPlaying) {
      ensureResumed().then(() => {
        tryPlay(audioElement);
      });
    } else {
      audioElement.pause();
    }
  }, [isPlaying, currentTrack]);

  // ─── Volume sync ───
  useEffect(() => {
    if (nativeMode.current) {
      nativeAudioSetVolume(volume).catch(() => {});
      return;
    }
    if (!engineReady.current) return;
    const { gainNode } = getAudioEngine();
    gainNode.gain.setValueAtTime(volume, 0);
  }, [volume]);

  // ─── RAF loop — sync currentTime from engine → store at ~15Hz ───
  // In native mode, time sync is handled by the Rust Channel callback above
  useEffect(() => {
    if (nativeMode.current) return;
    if (!engineReady.current) return;

    let lastUpdate = 0;
    const tick = () => {
      const now = performance.now();
      if (now - lastUpdate > 66) {
        const { audioElement } = getAudioEngine();
        if (!audioElement.paused && !isNaN(audioElement.currentTime)) {
          useAudioStore.getState().setCurrentTime(audioElement.currentTime);
        }
        lastUpdate = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  // ─── Ambient mode — silent oscillator when no track loaded ───
  useEffect(() => {
    if (!engineReady.current) return;
    if (!currentTrack) {
      startAmbient();
    } else {
      stopAmbient();
    }
  }, [currentTrack]);

  // ─── Media Session — lock screen Now Playing + transport controls ───
  // Watch BOTH currentTrack and activeJourney so the lock-screen title
  // refreshes when a journey starts/stops on an already-loaded track.
  const activeJourneyName = useAudioStore((s) => s.activeJourney?.name ?? null);
  useEffect(() => {
    updateMediaSession(currentTrack, activeJourneyName);
  }, [currentTrack, activeJourneyName]);

  useEffect(() => {
    setMediaSessionPlaybackState(isPlaying ? "playing" : "paused");
  }, [isPlaying]);

  useEffect(() => {
    registerMediaSessionHandlers({
      onPlay: () => useAudioStore.getState().resume(),
      onPause: () => useAudioStore.getState().pause(),
      onNextTrack: () => useAudioStore.getState().playNext(),
      onPreviousTrack: () => useAudioStore.getState().playPrev(),
    });
  }, []);

  return <>{children}</>;
}
