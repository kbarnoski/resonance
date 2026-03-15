import { useEffect, useRef } from "react";
import { useAudioStore } from "./audio-store";

const DEFAULT_CYCLE_INTERVAL = 150_000; // 2.5 minutes

/**
 * Auto-cycling hook for installation mode.
 * When installationMode is true, cycles through viz modes at a set interval.
 */
export function useInstallationMode(cycleInterval?: number) {
  const installationMode = useAudioStore((s) => s.installationMode);
  const cycleVizMode = useAudioStore((s) => s.cycleVizMode);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!installationMode) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const ms = cycleInterval ?? DEFAULT_CYCLE_INTERVAL;
    intervalRef.current = setInterval(() => {
      cycleVizMode();
    }, ms);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [installationMode, cycleInterval, cycleVizMode]);
}
