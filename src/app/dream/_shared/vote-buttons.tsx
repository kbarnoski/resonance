"use client";

import { useDreamVotes } from "./votes-provider";

/** Read-only love indicator. Renders for everyone. Shows a filled red
 *  heart if Karel loved this prototype, nothing otherwise. Public
 *  visitors see Karel's taste without being able to change it. */
export function VoteIndicator({ slug }: { slug: string }) {
  const { votes } = useDreamVotes();
  if ((votes[slug] ?? 0) !== 1) return null;
  return (
    <span title="Karel loved this" className="text-rose-400/95 text-sm">
      ♥
    </span>
  );
}

/** Admin-only love toggle. Click the heart to love this prototype;
 *  click again to clear. Hidden for non-admins (the underlying API
 *  is also server-gated). */
export function VoteButtons({
  slug,
  compact = false,
  stopPropagation = false,
}: {
  slug: string;
  compact?: boolean;
  stopPropagation?: boolean;
}) {
  const { votes, isAdmin, setVote } = useDreamVotes();
  if (!isAdmin) return null;

  const loved = (votes[slug] ?? 0) === 1;
  const size = compact ? "h-6 w-6 text-xs" : "h-7 w-7 text-sm";

  const onClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    void setVote(slug, loved ? 0 : 1);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={loved ? "Remove love" : "Love this"}
      title={loved ? "Remove love" : "Love this"}
      className={`${size} flex items-center justify-center rounded-full border transition-colors ${
        loved
          ? "border-rose-400/50 bg-rose-500/20 text-rose-300"
          : "border-white/10 bg-white/5 text-white/40 hover:border-rose-400/30 hover:text-rose-300"
      }`}
    >
      ♥
    </button>
  );
}
