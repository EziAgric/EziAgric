/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import TradeDetailScreen from '../TradeDetailScreen';
import { useTradeStore } from '../../stores/tradeStore';
import { useAuthStore } from '../../stores/authStore';
import { useBiometrics } from '../../hooks/useBiometrics';
import apiClient from '../../api/client';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../stores/tradeStore', () => ({ useTradeStore: jest.fn() }));
jest.mock('../../stores/authStore', () => ({ useAuthStore: jest.fn() }));
jest.mock('../../hooks/useBiometrics', () => ({ useBiometrics: jest.fn() }));
jest.mock('../../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const authenticate = jest.fn();
const confirmDelivery = jest.fn();
const fetchTrade = jest.fn();

const trade = {
  tradeId: 'trade-12345678',
  buyerAddress: 'GBUYER123',
  sellerAddress: 'GSELLER123',
  amountUsdc: '100',
  status: 'IN_TRANSIT',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

function setup() {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const utils = render(
    <TradeDetailScreen
      {...({ navigation, route: { params: { tradeId: trade.tradeId } } } as any)}
    />,
  );
  return { navigation, ...utils };
}

async function confirmInAlert() {
  const buttons = (Alert.alert as jest.Mock).mock.calls.slice(-1)[0][2] as AlertButton[];
  const confirm = buttons.find((button) => button.text === 'Confirm');
  if (!confirm?.onPress) throw new Error('No Confirm button in the last alert');
  await act(async () => {
    await confirm.onPress?.();
  });
}

async function pressConfirmDelivery() {
  const utils = setup();
  fireEvent.press(await utils.findByTestId('confirm-delivery-button'));
  await confirmInAlert();
  return utils;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  authenticate.mockResolvedValue(true);
  confirmDelivery.mockResolvedValue(undefined);
  fetchTrade.mockResolvedValue(undefined);
  (apiClient.get as jest.Mock).mockResolvedValue({ data: [] });
  (useBiometrics as unknown as jest.Mock).mockReturnValue({ authenticate });
  (useAuthStore as unknown as jest.Mock).mockReturnValue({
    token: 'tok-123',
    clearAuth: jest.fn(),
  });
  (useTradeStore as unknown as jest.Mock).mockReturnValue({
    currentTrade: trade,
    isLoading: false,
    errorView: null,
    lastActionErrorView: null,
    fetchTrade,
    confirmDelivery,
    releaseFunds: jest.fn(),
    initiateDispute: jest.fn(),
    deposit: jest.fn(),
    clearErrorView: jest.fn(),
  });
});

describe('TradeDetailScreen biometric gating', () => {
  it('authenticates before confirming delivery', async () => {
    await pressConfirmDelivery();

    expect(authenticate).toHaveBeenCalledWith('Confirm delivery');
    expect(confirmDelivery).toHaveBeenCalledWith(trade.tradeId);
    expect(authenticate.mock.invocationCallOrder[0]).toBeLessThan(
      confirmDelivery.mock.invocationCallOrder[0]
    );
  });

  it('does not confirm delivery when authentication is cancelled', async () => {
    authenticate.mockResolvedValue(false);

    await pressConfirmDelivery();

    expect(authenticate).toHaveBeenCalled();
    expect(confirmDelivery).not.toHaveBeenCalled();
  });

  it('prompts again on a second confirmation instead of reusing a result', async () => {
    await pressConfirmDelivery();
    await pressConfirmDelivery();

    expect(authenticate).toHaveBeenCalledTimes(2);
    expect(confirmDelivery).toHaveBeenCalledTimes(2);
  });
});
