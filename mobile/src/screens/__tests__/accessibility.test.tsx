/**
 * Accessibility smoke tests for non-admin screens.
 * Verifies that interactive elements carry accessibilityLabel / accessibilityRole,
 * and that key touch targets exist with labels screen readers can announce.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
}));

jest.mock('../../../stores/authStore', () => ({
  useAuthStore: jest.fn(() => ({
    token: 'tok',
    walletAddress: 'GABC',
    clearAuth: jest.fn(),
    setToken: jest.fn(),
    setWalletAddress: jest.fn(),
  })),
}));

jest.mock('../../../stores/tradeStore', () => ({
  useTradeStore: jest.fn(() => ({
    trades: [],
    total: 0,
    isLoading: false,
    errorView: null,
    lastActionErrorView: null,
    fetchTrades: jest.fn(),
    fetchTrade: jest.fn(),
    createTrade: jest.fn(),
    confirmDelivery: jest.fn(),
    releaseFunds: jest.fn(),
    deposit: jest.fn(),
    initiateDispute: jest.fn(),
    clearErrorView: jest.fn(),
  })),
}));

jest.mock('../../../api/auth', () => ({
  authApi: { generateChallenge: jest.fn(), verifyChallenge: jest.fn() },
}));

jest.mock('../../../api/client', () => ({ default: { post: jest.fn() } }));
jest.mock('../../../constants/support', () => ({ buildSupportMailto: jest.fn(() => 'mailto:') }));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockNavigate = jest.fn();
const mockReplace = jest.fn();
const mockGoBack = jest.fn();
const navigation = { navigate: mockNavigate, replace: mockReplace, goBack: mockGoBack } as any;

// ── HomeScreen ────────────────────────────────────────────────────────────────

import HomeScreen from '../HomeScreen';

describe('HomeScreen accessibility', () => {
  it('renders heading text elements', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('Amana Mobile')).toBeTruthy();
    expect(getByText('Getting Started')).toBeTruthy();
  });
});

// ── WalletConnectScreen ───────────────────────────────────────────────────────

import WalletConnectScreen from '../WalletConnectScreen';

describe('WalletConnectScreen accessibility', () => {
  it('Connect Wallet button has accessibilityLabel and role=button', () => {
    const { getByA11yRole, getByLabelText } = render(
      <WalletConnectScreen navigation={navigation} route={{} as any} />,
    );
    const btn = getByA11yRole('button', { name: /connect wallet/i });
    expect(btn).toBeTruthy();
    // also reachable by label
    expect(getByLabelText(/connect wallet/i)).toBeTruthy();
  });
});

// ── TradeListScreen ───────────────────────────────────────────────────────────

import TradeListScreen from '../TradeListScreen';

describe('TradeListScreen accessibility', () => {
  it('Create new trade button has label and role=button', () => {
    const { getByA11yRole } = render(
      <TradeListScreen navigation={navigation} route={{} as any} />,
    );
    expect(getByA11yRole('button', { name: /create new trade/i })).toBeTruthy();
  });

  it('Log out button has label and role=button', () => {
    const { getByA11yRole } = render(
      <TradeListScreen navigation={navigation} route={{} as any} />,
    );
    expect(getByA11yRole('button', { name: /log out/i })).toBeTruthy();
  });

  it('filter tabs have role=tab and selected state', () => {
    const { getAllByA11yRole } = render(
      <TradeListScreen navigation={navigation} route={{} as any} />,
    );
    const tabs = getAllByA11yRole('tab');
    expect(tabs.length).toBeGreaterThanOrEqual(5);
    // first tab (All) should be selected by default
    expect(tabs[0].props.accessibilityState?.selected).toBe(true);
  });
});

// ── CreateTradeScreen ─────────────────────────────────────────────────────────

import CreateTradeScreen from '../CreateTradeScreen';

describe('CreateTradeScreen accessibility', () => {
  it('header back button has role=button and label', () => {
    const { getByA11yRole } = render(
      <CreateTradeScreen navigation={navigation} route={{} as any} />,
    );
    expect(getByA11yRole('button', { name: /go back/i })).toBeTruthy();
  });

  it('commodity chips have role=radio', () => {
    const { getAllByA11yRole } = render(
      <CreateTradeScreen navigation={navigation} route={{} as any} />,
    );
    const radios = getAllByA11yRole('radio');
    // 8 commodities + 4 units = ≥ 8
    expect(radios.length).toBeGreaterThanOrEqual(8);
  });

  it('step indicator dots carry accessibility labels', () => {
    const { getAllByLabelText } = render(
      <CreateTradeScreen navigation={navigation} route={{} as any} />,
    );
    // At least one step label present
    expect(getAllByLabelText(/Step \d of \d/i).length).toBeGreaterThanOrEqual(1);
  });
});
