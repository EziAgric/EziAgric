import { create } from 'zustand';

import { tradeApi } from '../api/trade';
import { viewForError } from '../api/errorInterceptor';
import { AdminErrorView } from '../api/errors';
import type { Trade, TradeListResult, TradeStatus } from '../types/trade';

interface TradeState {
  trades: Trade[];
  total: number;
  currentTrade: Trade | null;
  isLoading: boolean;

  /**
   * Error view for **load** actions (`fetchTrades`, `fetchTrade`).
   * Screens that primarily render a list/detail read this and put the
   * banner above the content.
   */
  errorView: AdminErrorView | null;
  /**
   * Error view for **mutation** actions (`createTrade`,
   * `confirmDelivery`, `releaseFunds`, `deposit`, `initiateDispute`).
   * Kept separate from `errorView` so a successful poll doesn't wipe
   * the most-recent mutation error before the user can read it (this
   * mirrors the dual-state pattern used by the admin screens — see
   * `loadErrorView` vs `actionErrorView`).
   */
  lastActionErrorView: AdminErrorView | null;

  fetchTrades: (params?: { status?: TradeStatus; page?: number }) => Promise<void>;
  fetchTrade: (tradeId: string) => Promise<void>;
  createTrade: (data: {
    sellerAddress: string;
    amountUsdc: string;
    buyerLossBps?: number;
    sellerLossBps?: number;
    commodity?: string;
    quantity?: string;
    unit?: string;
  }) => Promise<{ tradeId: string; unsignedXdr: string } | null>;
  confirmDelivery: (tradeId: string) => Promise<void>;
  releaseFunds: (tradeId: string) => Promise<void>;
  deposit: (tradeId: string) => Promise<void>;
  initiateDispute: (tradeId: string, reason: string) => Promise<void>;
  /**
   * Clears both error slots. Called by banner `onGoBack` / `onRetry`
   * paths and after explicit dismissals so a stale mutation banner
   * never leaks behind a successful refresh.
   */
  clearErrorView: () => void;
}

export const useTradeStore = create<TradeState>((set, get) => ({
  trades: [],
  total: 0,
  currentTrade: null,
  isLoading: false,
  errorView: null,
  lastActionErrorView: null,

  fetchTrades: async (params) => {
    set({ isLoading: true, errorView: null });
    try {
      const result: TradeListResult = await tradeApi.listTrades(params);
      set({ trades: result.trades, total: result.total, isLoading: false });
    } catch (error: unknown) {
      set({ errorView: viewForError(error), isLoading: false });
    }
  },

  fetchTrade: async (tradeId) => {
    set({ isLoading: true, errorView: null });
    try {
      const trade = await tradeApi.getTrade(tradeId);
      set({ currentTrade: trade, isLoading: false });
    } catch (error: unknown) {
      set({ errorView: viewForError(error), isLoading: false });
    }
  },

  createTrade: async (data) => {
    set({ isLoading: true, lastActionErrorView: null });
    try {
      const result = await tradeApi.createTrade(data);
      set({ isLoading: false });
      return result;
    } catch (error: unknown) {
      set({ lastActionErrorView: viewForError(error), isLoading: false });
      return null;
    }
  },

  confirmDelivery: async (tradeId) => {
    set({ isLoading: true, lastActionErrorView: null });
    try {
      const trade = await tradeApi.confirmDelivery(tradeId);
      set({ currentTrade: trade, isLoading: false });
    } catch (error: unknown) {
      set({ lastActionErrorView: viewForError(error), isLoading: false });
    }
  },

  releaseFunds: async (tradeId) => {
    set({ isLoading: true, lastActionErrorView: null });
    try {
      await tradeApi.releaseFunds(tradeId);
      if (get().currentTrade) {
        // Chain: fetchTrade writes to `errorView` (load slot). We
        // intentionally leave `lastActionErrorView` alone so an
        // earlier mutation banner stays visible if this chain fails.
        await get().fetchTrade(tradeId);
      }
      set({ isLoading: false });
    } catch (error: unknown) {
      set({ lastActionErrorView: viewForError(error), isLoading: false });
    }
  },

  deposit: async (tradeId) => {
    set({ isLoading: true, lastActionErrorView: null });
    try {
      await tradeApi.deposit(tradeId);
      if (get().currentTrade) {
        await get().fetchTrade(tradeId);
      }
      set({ isLoading: false });
    } catch (error: unknown) {
      set({ lastActionErrorView: viewForError(error), isLoading: false });
    }
  },

  initiateDispute: async (tradeId, reason) => {
    set({ isLoading: true, lastActionErrorView: null });
    try {
      const trade = await tradeApi.initiateDispute(tradeId, reason);
      set({ currentTrade: trade, isLoading: false });
    } catch (error: unknown) {
      set({ lastActionErrorView: viewForError(error), isLoading: false });
    }
  },

  clearErrorView: () =>
    set({
      errorView: null,
      lastActionErrorView: null,
    }),
}));
