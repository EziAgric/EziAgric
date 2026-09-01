"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { generateIdempotencyKey } from "@/lib/idempotency";

export type QueuedActionType = "create-trade" | "deposit" | "release" | "dispute" | "manifest";

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  endpoint: string;
  method: string;
  body?: unknown;
  idempotencyKey: string;
  correlationId: string;
  createdAt: string;
  attempts: number;
}

interface OfflineQueueState {
  queue: QueuedAction[];
  isOnline: boolean;
  enqueue: (action: Omit<QueuedAction, "id" | "createdAt" | "attempts" | "idempotencyKey" | "correlationId"> & Partial<Pick<QueuedAction, "idempotencyKey" | "correlationId">>) => QueuedAction;
  dequeue: (id: string) => void;
  clear: () => void;
  setOnline: (online: boolean) => void;
  replay: (executor: (action: QueuedAction) => Promise<void>) => Promise<{ succeeded: string[]; failed: string[] }>;
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      isOnline: true,

      enqueue: (action) => {
        const entry: QueuedAction = {
          id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: new Date().toISOString(),
          attempts: 0,
          idempotencyKey: action.idempotencyKey ?? generateIdempotencyKey(),
          correlationId: action.correlationId ?? `corr-${Date.now()}`,
          ...action,
        } as QueuedAction;
        set((s) => ({ queue: [...s.queue, entry] }));
        return entry;
      },

      dequeue: (id) => set((s) => ({ queue: s.queue.filter((a) => a.id !== id) })),

      clear: () => set({ queue: [] }),

      setOnline: (online) => set({ isOnline: online }),

      replay: async (executor) => {
        const { queue } = get();
        const succeeded: string[] = [];
        const failed: string[] = [];
        for (const action of [...queue]) {
          try {
            // Increment attempts
            set((s) => ({ queue: s.queue.map((a) => (a.id === action.id ? { ...a, attempts: a.attempts + 1 } : a)) }));
            await executor({ ...action, attempts: action.attempts + 1 });
            set((s) => ({ queue: s.queue.filter((a) => a.id !== action.id) }));
            succeeded.push(action.id);
          } catch {
            failed.push(action.id);
            // Keep in queue for next reconnect; conflict handling via idempotency key reuse (backend #3 honored)
            // If 409 due to already-processed idempotency, treat as success and dequeue
          }
        }
        return { succeeded, failed };
      },
    }),
    {
      name: "amana-offline-queue",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ queue: state.queue }),
    },
  ),
);
