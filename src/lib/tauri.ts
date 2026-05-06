/**
 * Tauri bridge — native desktop capabilities with browser fallbacks.
 * All functions degrade gracefully when running in a regular browser.
 */

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function enterKioskMode(): Promise<void> {
  if (isDesktopApp()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("enter_kiosk_mode");
  } else {
    // Browser fallback — standard Fullscreen API
    await document.documentElement.requestFullscreen().catch(() => {});
  }
}

export async function exitKioskMode(): Promise<void> {
  if (isDesktopApp()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("exit_kiosk_mode");
  } else {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
  }
}

export async function setCursorVisible(visible: boolean): Promise<void> {
  if (!isDesktopApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_cursor_visible", { visible });
}

export interface DisplayInfo {
  name: string;
  width: number;
  height: number;
  scaleFactor: number;
}

export async function getDisplays(): Promise<DisplayInfo[]> {
  if (!isDesktopApp()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DisplayInfo[]>("get_displays");
}

// ─── Native Audio Commands ───

export async function nativeAudioLoad(url: string, recordingId: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cmd_audio_load", { url, recordingId });
}

/** Pre-warm the local audio cache for a list of tracks. Returns the
 *  recordingIds that ended up cached (already-cached + newly-cached).
 *  Failed downloads are logged on the Rust side but don't fail the
 *  whole batch — uncached tracks fall back to streaming on demand. */
export async function nativeAudioPrefetch(
  tracks: { url: string; recordingId: string }[],
): Promise<string[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string[]>("cmd_audio_prefetch", { tracks });
}

export async function nativeAudioPlay(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cmd_audio_play");
}

export async function nativeAudioPause(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cmd_audio_pause");
}

export async function nativeAudioSeek(position: number): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cmd_audio_seek", { position });
}

export async function nativeAudioSetVolume(volume: number): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cmd_audio_set_volume", { volume });
}

export async function nativeAudioStop(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("cmd_audio_stop");
}

export interface AudioDataPayload {
  bins: number[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
}

export async function nativeAudioSubscribe(
  callback: (data: AudioDataPayload) => void
): Promise<void> {
  const { invoke, Channel } = await import("@tauri-apps/api/core");
  const channel = new Channel<AudioDataPayload>();
  channel.onmessage = callback;
  await invoke("cmd_audio_subscribe", { channel });
}
