import { useEffect } from "react";
import { startVjBridge } from "./client";

/** Run the VJ bridge while the calling component is mounted (no-op unless
 *  ?osc=1 / the kiosk setting turned it on). */
export function useVjBridge(): void {
  useEffect(() => startVjBridge(), []);
}
