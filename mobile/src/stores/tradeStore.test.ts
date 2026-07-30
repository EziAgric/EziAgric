import { act } from '@testing-library/react-native';

import { useTradeStore } from './tradeStore';
import { tradeApi } from '../api/trade';
import { AdminApiError } from '../api/errors';
import { NETWORK_ERROR_CODE } from '../api/errorInterceptor';

jest.mock('../api/trade', () => ({
  tradeApi: {
    listTrades: jest.fn(),
    getTrade: jest.fn(),
    createTrade: jest.fn(),
    confirmDelivery: jest.fn(),
    releaseFunds: jest.fn(),
    deposit: jest.fn(),
    initiateDispute: jest.fn(),
  },
}));

const mockList = tradeApi.listTrades as jest.MockedFunction<
  typeof tradeApi.listTrades
>;
const mockConfirm = tradeApi.confirmDelivery as jest.MockedFunction<
  typeof tradeApi.confirmDelivery
>;

function resetStore(): void {
  act(() => {
    useTradeStore.setState({
      isLoading: false,
      trades: [],
      total: 0,
      currentTrade: null,
      errorView: null,
      lastActionErrorView: null,
    });
  });
}

describe('useTradeStore — error slot routing', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  it('writes fetchTrades failures to errorView (load slot)', async () => {
    mockList.mockRejectedValueOnce(
      new AdminApiError({
        code: NETWORK_ERROR_CODE,
        message: 'offline',
      }),
    );

    await act(async () => {
      await useTradeStore.getState().fetchTrades();
    });

    const state = useTradeStore.getState();
    // Assert on action/code, not message — the friendly copy is owned
    // by `mapAdminErrorCode` and may change without breaking tests.
    expect(state.errorView?.action).toBe('retry');
    expect(state.errorView?.code).toBe(NETWORK_ERROR_CODE);
    expect(state.lastActionErrorView).toBeNull();
  });

  it('writes confirmDelivery failures to lastActionErrorView (mutation slot)', async () => {
    mockConfirm.mockRejectedValueOnce(
      new AdminApiError({
        code: 'TRADE_INVALID_STATUS',
        message: 'cannot confirm',
        status: 400,
      }),
    );

    await act(async () => {
      await useTradeStore.getState().confirmDelivery('trade-1');
    });

    const state = useTradeStore.getState();
    expect(state.lastActionErrorView?.action).toBe('refresh');
    expect(state.lastActionErrorView?.code).toBe('TRADE_INVALID_STATUS');
    expect(state.errorView).toBeNull();
  });

  it('does NOT wipe lastActionErrorView when a follow-up fetch succeeds', async () => {
    // 1. confirmDelivery fails with TRADE_INVALID_STATUS → goes to mutation slot.
    mockConfirm.mockRejectedValueOnce(
      new AdminApiError({
        code: 'TRADE_INVALID_STATUS',
        message: 'cannot confirm',
      }),
    );
    await act(async () => {
      await useTradeStore.getState().confirmDelivery('trade-1');
    });
    expect(useTradeStore.getState().lastActionErrorView).not.toBeNull();

    // 2. Subsequent successful fetch should NOT erase the mutation banner.
    mockList.mockResolvedValueOnce({
      trades: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    await act(async () => {
      await useTradeStore.getState().fetchTrades();
    });

    expect(useTradeStore.getState().lastActionErrorView).not.toBeNull();
    expect(useTradeStore.getState().errorView).toBeNull();
  });

  it('clears both slots at the start of every action', async () => {
    // Seed stale state in both slots.
    act(() => {
      useTradeStore.setState({
        errorView: {
          title: 'stale',
          message: 'stale',
          action: 'retry',
          code: 'STALE_LOAD',
        },
        lastActionErrorView: {
          title: 'stale',
          message: 'stale',
          action: 'retry',
          code: 'STALE_ACTION',
        },
      });
    });

    mockList.mockResolvedValueOnce({
      trades: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    await act(async () => {
      await useTradeStore.getState().fetchTrades();
    });

    const state = useTradeStore.getState();
    expect(state.errorView).toBeNull();
    // Mutation slot lives across loads — only a mutation clears it.
    expect(state.lastActionErrorView?.code).toBe('STALE_ACTION');
  });

  it('clearErrorView() drops both error slots', () => {
    act(() => {
      useTradeStore.setState({
        errorView: {
          title: 'a',
          message: 'a',
          action: 'retry',
          code: 'A',
        },
        lastActionErrorView: {
          title: 'b',
          message: 'b',
          action: 'refresh',
          code: 'B',
        },
      });
    });

    act(() => {
      useTradeStore.getState().clearErrorView();
    });
    expect(useTradeStore.getState().errorView).toBeNull();
    expect(useTradeStore.getState().lastActionErrorView).toBeNull();
  });
});
