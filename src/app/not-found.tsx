import Link from "next/link";
import { DisplayTitle, MonoLabel } from "@/components/ui/typography";

/**
 * Global 404 — the quiet error voice.
 *
 * Covers everything from a mistyped URL to a deleted or regenerated
 * share token: a Welcome Home link that no longer resolves lands here
 * instead of on Next's unstyled system page. Composition mirrors
 * error.tsx — pure black (void surface), centered column.
 */
export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-void text-white">
      <div className="flex flex-col items-center gap-5 text-center px-6">
        <DisplayTitle className="text-[clamp(2rem,6vw,2.75rem)] leading-[1.15] text-white/90">
          This path has faded
        </DisplayTitle>
        <MonoLabel
          as="p"
          className="max-w-[24rem] text-[0.75rem] leading-[1.7] tracking-[0.06em] text-ink-faint"
        >
          The page you&apos;re looking for doesn&apos;t exist — the link may
          be old, or the address mistyped.
        </MonoLabel>
        <Link
          href="/"
          className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-white/20 px-5 font-mono text-[0.8rem] tracking-[0.06em] text-white/80 no-underline transition-colors duration-instant ease-enter hover:bg-white/10 hover:text-white"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
