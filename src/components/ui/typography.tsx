import * as React from "react";
import { cn } from "@/lib/utils";

/* ─── Typography voice components ───
 *
 * The product speaks in three registers on dark surfaces:
 *
 *   <Eyebrow>      — mono, uppercase, wide-tracked kicker ("a path · by …")
 *   <DisplayTitle> — Cormorant Garamond italic light, clamp-sized display
 *   <MonoLabel>    — small mono label/metadata line
 *
 * These are extractions of the hand-rolled inline-style voice used across
 * the path pages, journey overlays, installation and remote surfaces —
 * defaults match the most common usage; call sites override via
 * className/style where their tuned values differ (tracking, gradient
 * fills, sizes). Keep rendered output identical when migrating.
 */

type ElementTag = "h1" | "h2" | "h3" | "p" | "div" | "span";

/** Mono uppercase eyebrow — section kickers and attributions. */
export function Eyebrow({
  as: Tag = "div",
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: ElementTag }) {
  return (
    <Tag
      className={cn(
        "font-mono text-[0.68rem] uppercase tracking-[0.18em] text-ink-mute",
        className
      )}
      {...props}
    />
  );
}

/** Display title — Cormorant Garamond italic 300 with fluid clamp sizing.
 *  The serif family is set inline (it is not in the Tailwind font theme);
 *  everything else is class-based and overridable. */
export function DisplayTitle({
  as: Tag = "h1",
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: ElementTag }) {
  return (
    <Tag
      className={cn(
        "font-light italic text-ink",
        "text-[clamp(2.4rem,7vw,4rem)] leading-[1.05] tracking-[0.02em]",
        className
      )}
      style={{
        fontFamily: "'Cormorant Garamond', Georgia, serif",
        ...style,
      }}
      {...props}
    />
  );
}

/** Small mono label — metadata lines, timestamps, quiet captions. */
export function MonoLabel({
  as: Tag = "div",
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: ElementTag }) {
  return (
    <Tag
      className={cn(
        "font-mono text-[0.72rem] tracking-[0.05em] text-ink-mute",
        className
      )}
      {...props}
    />
  );
}
