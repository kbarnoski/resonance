/**
 * Web Media Session API integration — lock screen Now Playing metadata
 * and transport controls. Supported in WKWebView on iOS 16+.
 */

import type { Track } from "@/lib/audio/audio-store";

export function updateMediaSession(track: Track | null): void {
  if (!("mediaSession" in navigator)) return;

  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: "Resonance",
    album: "Recordings",
  });
}

export function setMediaSessionPlaybackState(
  state: "playing" | "paused" | "none"
): void {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = state;
}

export function registerMediaSessionHandlers(handlers: {
  onPlay: () => void;
  onPause: () => void;
  onNextTrack?: () => void;
  onPreviousTrack?: () => void;
}): void {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.setActionHandler("play", handlers.onPlay);
  navigator.mediaSession.setActionHandler("pause", handlers.onPause);

  if (handlers.onNextTrack) {
    navigator.mediaSession.setActionHandler("nexttrack", handlers.onNextTrack);
  }
  if (handlers.onPreviousTrack) {
    navigator.mediaSession.setActionHandler(
      "previoustrack",
      handlers.onPreviousTrack
    );
  }
}
