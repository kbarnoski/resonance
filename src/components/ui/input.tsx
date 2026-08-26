import * as React from "react"

import { cn } from "@/lib/utils"

function Input({
  className,
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & {
  /** "glass" — the canonical white-alpha-on-black treatment for inputs
   *  sitting on art/void surfaces (The Room, remote, operator panels). */
  variant?: "default" | "glass"
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] duration-instant ease-enter outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        variant === "glass" &&
          "rounded-lg border-white/[0.08] bg-white/[0.04] text-ink placeholder:text-ink-faint shadow-none dark:bg-white/[0.04] hover:bg-white/[0.06] focus-visible:border-white/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
