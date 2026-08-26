import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  JOURNEY_PATHS,
  isPathCulminationUnlocked,
  isGrandCulminationUnlocked,
} from "./paths";

export interface PathProgress {
  completedJourneyIds: string[];
  completedCulminationIds: string[];
  completionTimestamps: Record<string, string>;
  grandCulminationUnlocked: boolean;
  grandCulminationCompleted: boolean;
}

interface PathProgressState extends PathProgress {
  /** Record a journey as completed (idempotent).
   *  Built-in culminations are detected from JOURNEY_PATHS; DB-backed
   *  paths (Welcome Home etc.) use UUID culminations this store can't
   *  recognize on its own — callers pass `isCulmination` so those land
   *  in completedCulminationIds instead of the regular journey bucket. */
  completeJourney: (journeyId: string, options?: { isCulmination?: boolean }) => void;
  /** Check if a journey has been completed */
  isCompleted: (journeyId: string) => boolean;
  /** Get progress for a specific path */
  getPathProgress: (pathId: string) => { completed: number; total: number };
  /** Reset all progress (dev only) */
  resetProgress: () => void;
}

const initialState: PathProgress = {
  completedJourneyIds: [],
  completedCulminationIds: [],
  completionTimestamps: {},
  grandCulminationUnlocked: false,
  grandCulminationCompleted: false,
};

export const usePathProgressStore = create<PathProgressState>()(
  persist(
    (set, get) => ({
      ...initialState,

      completeJourney: (journeyId, options) => {
        const state = get();
        const isGrandCulmination = journeyId === "the-spirit";

        // Culmination = caller hint (DB/UUID culminations) OR built-in
        // path detection. Backward compatible: hintless calls behave
        // exactly as before.
        const isCulmination =
          !isGrandCulmination &&
          (!!options?.isCulmination ||
            JOURNEY_PATHS.some((p) => p.culminationJourneyId === journeyId));

        // Migrate legacy mis-bucketed entries: DB/UUID culminations that
        // were recorded into completedJourneyIds before the hint existed.
        if (isCulmination && state.completedJourneyIds.includes(journeyId)) {
          if (!state.completedCulminationIds.includes(journeyId)) {
            const migrated = [...state.completedCulminationIds, journeyId];
            set({
              completedJourneyIds: state.completedJourneyIds.filter(
                (id) => id !== journeyId
              ),
              completedCulminationIds: migrated,
              grandCulminationUnlocked: isGrandCulminationUnlocked(migrated),
            });
          }
          return;
        }

        // Already recorded — idempotent
        if (
          state.completedJourneyIds.includes(journeyId) ||
          state.completedCulminationIds.includes(journeyId)
        )
          return;

        const now = new Date().toISOString();

        if (isGrandCulmination) {
          set({
            grandCulminationCompleted: true,
            completionTimestamps: {
              ...state.completionTimestamps,
              [journeyId]: now,
            },
          });
          return;
        }

        if (isCulmination) {
          const newCulminations = [
            ...state.completedCulminationIds,
            journeyId,
          ];
          const grandUnlocked = isGrandCulminationUnlocked(newCulminations);
          set({
            completedCulminationIds: newCulminations,
            grandCulminationUnlocked: grandUnlocked,
            completionTimestamps: {
              ...state.completionTimestamps,
              [journeyId]: now,
            },
          });
          return;
        }

        // Regular journey
        const newCompleted = [...state.completedJourneyIds, journeyId];
        set({
          completedJourneyIds: newCompleted,
          completionTimestamps: {
            ...state.completionTimestamps,
            [journeyId]: now,
          },
        });
      },

      isCompleted: (journeyId) => {
        const state = get();
        return (
          state.completedJourneyIds.includes(journeyId) ||
          state.completedCulminationIds.includes(journeyId) ||
          (journeyId === "the-spirit" && state.grandCulminationCompleted)
        );
      },

      getPathProgress: (pathId) => {
        const path = JOURNEY_PATHS.find((p) => p.id === pathId);
        if (!path) return { completed: 0, total: 0 };
        const state = get();
        const completed = path.journeyIds.filter((id) =>
          state.completedJourneyIds.includes(id)
        ).length;
        return { completed, total: path.journeyIds.length };
      },

      resetProgress: () => set(initialState),
    }),
    {
      name: "resonance-path-progress",
    }
  )
);
