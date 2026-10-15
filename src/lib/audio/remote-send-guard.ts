/**
 * Phone remote double-tap guard (show-day phone QA 2026-10-15). A thumb on a
 * glass button often lands twice; the second identical command used to reach
 * the kiosk too (a second NEXT re-ran the boundary, a second "Next track"
 * skipped two Joseph tracks). The same command within REPEAT_GUARD_MS of the
 * last accepted one is dropped; a different command always goes through.
 */
export const REPEAT_GUARD_MS = 800;

export function createRepeatGuard(windowMs = REPEAT_GUARD_MS) {
  let last: { cmd: string; at: number } | null = null;
  return (cmd: string, now: number): boolean => {
    if (last && last.cmd === cmd && now - last.at < windowMs) return false;
    last = { cmd, at: now };
    return true;
  };
}
