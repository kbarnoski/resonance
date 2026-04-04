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
  /** Record a journey as completed (idempotent) */
  completeJourney: (journeyId: string) => void;
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

      completeJourney: (journeyId) => {
        const state = get();
        // Already recorded — idempotent
        if (
          state.completedJourneyIds.includes(journeyId) ||
          state.completedCulminationIds.includes(journeyId)
        )
          return;

        const now = new Date().toISOString();

        // Check if this is a culmination journey
        const isCulmination = JOURNEY_PATHS.some(
          (p) => p.culminationJourneyId === journeyId
        );
        const isGrandCulmination = journeyId === "the-spirit";

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
