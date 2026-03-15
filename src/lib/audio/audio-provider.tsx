"use client";

import { useEffect, useRef, useCallback } from "react";
import { useAudioStore } from "./audio-store";
import { getAudioEngine, ensureResumed, startAmbient, stopAmbient } from "./audio-engine";
import { resolveAudioUrl } from "./resolve-audio-url";

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

  // ─── Track changes — load new src, wait for canplay, then seek + play ───
  useEffect(() => {
    if (!currentTrack) return;
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
        stopAmbient();
        loadingNewSrc.current = true;
        lastSrcRef.current = newSrc;

        resolveAudioUrl(newSrc, currentTrack.id).then((resolvedUrl) => {
          audioElement.src = resolvedUrl;
          audioElement.load();
        });
      }
    } else if (audioElement.paused && useAudioStore.getState().isPlaying) {
      // Same src, but audio is paused and store says play — resume
      ensureResumed().then(() => {
        audioElement.play().catch(() => {});
      });
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
        audioElement.play().catch(() => {});
      }
    };

    const onEnded = () => {
      const state = useAudioStore.getState();
      state.playNext();
      // Fetch analysis for whatever track is now current (if still playing)
      const nextTrack = useAudioStore.getState().currentTrack;
      if (nextTrack && useAudioStore.getState().isPlaying) {
        state.setAnalysisLoading(true);
        fetch(`/api/recordings/${nextTrack.id}/analysis`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            useAudioStore.getState().setAnalysis(data);
            useAudioStore.getState().setAnalysisLoading(false);
          })
          .catch(() => {
            useAudioStore.getState().setAnalysis(null);
            useAudioStore.getState().setAnalysisLoading(false);
          });
      }
    };

    const onError = () => {
      loadingNewSrc.current = false;
      useAudioStore.getState().pause();
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
    if (!engineReady.current || !currentTrack) return;
    // Skip if we're in the middle of loading a new src — canplay handler will play
    if (loadingNewSrc.current) return;

    const { audioElement } = getAudioEngine();

    if (isPlaying) {
      ensureResumed().then(() => {
        audioElement.play().catch(() => {});
      });
    } else {
      audioElement.pause();
    }
  }, [isPlaying, currentTrack]);

  // ─── Volume sync ───
  useEffect(() => {
    if (!engineReady.current) return;
    const { gainNode } = getAudioEngine();
    gainNode.gain.setValueAtTime(volume, 0);
  }, [volume]);

  // ─── RAF loop — sync currentTime from engine → store at ~15Hz ───
  useEffect(() => {
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

  return <>{children}</>;
}
