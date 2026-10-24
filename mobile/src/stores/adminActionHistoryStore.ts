/**
 * adminActionHistoryStore — #85
 *
 * Zustand store that keeps an in-memory, append-only log of admin operations
 * performed during the current session. The history is surfaced on
 * AdminActionSuccessScreen so operators can audit their recent actions without
 * leaving the app.
 *
 * Design notes:
 * - Capped at MAX_HISTORY entries (newest first) to keep memory bounded.
 * - The store is intentionally session-scoped; persistence across app restarts
 *   can be added later via expo-secure-store or AsyncStorage if required.
 */
import { create } from 'zustand';
import type { AdminActionType } from '../screens/AdminActionSuccessScreen';

export interface AdminActionRecord {
  /** The type of admin operation performed. */
  actionType: AdminActionType;
  /** The stream the action was applied to. */
  streamId: string;
  /** ISO-8601 string of when the action completed. */
  timestamp: string;
}

interface AdminActionHistoryState {
  history: AdminActionRecord[];
  /** Prepend a new record and trim the list to MAX_HISTORY entries. */
  addAction: (record: AdminActionRecord) => void;
  /** Clear all history, e.g. on sign-out. */
  clearHistory: () => void;
}

const MAX_HISTORY = 50;

export const useAdminActionHistoryStore = create<AdminActionHistoryState>((set) => ({
  history: [],

  addAction: (record) =>
    set((state) => ({
      history: [record, ...state.history].slice(0, MAX_HISTORY),
    })),

  clearHistory: () => set({ history: [] }),
}));
