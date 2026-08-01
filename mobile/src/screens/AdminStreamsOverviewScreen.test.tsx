/**
 * AdminStreamsOverviewScreen.test.tsx — #86 (accessibility) + #85 (navigation)
 *
 * Covers:
 *  - #85: Pressing an action button records the action and navigates to
 *         AdminActionSuccess with correct params.
 *  - #86: All interactive elements have accessible labels and hints.
 *         Stream metadata uses accessibilityRole="text".
 *         Non-admin view has accessible "Go back" button.
 */
import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import AdminStreamsOverviewScreen from './AdminStreamsOverviewScreen';
import { useAuthStore } from '../stores/authStore';
import { useAdminActionHistoryStore } from '../stores/adminActionHistoryStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../stores/authStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../stores/adminActionHistoryStore', () => ({
  useAdminActionHistoryStore: jest.fn(),
}));

jest.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNavigation(overrides?: Partial<{ navigate: jest.Mock; goBack: jest.Mock }>) {
  return { navigate: jest.fn(), goBack: jest.fn(), ...overrides };
}

const mockUseAuthStore = useAuthStore as unknown as jest.Mock;
const mockUseNetworkStatus = useNetworkStatus as unknown as jest.Mock;

function renderAdmin() {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  return {
    navigation,
    ...render(
      <AdminStreamsOverviewScreen navigation={navigation as any} route={{} as any} />
    ),
  };
}

describe('AdminStreamsOverviewScreen', () => {
  const mockAddAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAdminActionHistoryStore as jest.Mock).mockReturnValue({ addAction: mockAddAction });
    // Default to online so existing tests that don't care about network stay stable.
    mockUseNetworkStatus.mockReturnValue({ isOffline: false });
  });

  it('renders a stream list and action buttons for admin users when online', () => {
    mockUseAuthStore.mockReturnValue({ role: 'admin' });

    const { getByText, getByTestId, queryByTestId } = renderAdmin();

    expect(getByText('Admin stream overview')).toBeTruthy();

    // Action labels render once per stream card; assert at least the first
    // card has the expected buttons via scoped testID-based queries.
    const firstCard = getByTestId('action-clawback-stream-001');
    expect(within(firstCard).getByText('Clawback')).toBeTruthy();
    expect(within(getByTestId('action-lock-stream-001')).getByText('Lock')).toBeTruthy();
    expect(
      within(getByTestId('action-terminate-stream-001')).getByText('Terminate')
    ).toBeTruthy();

    expect(queryByTestId('offline-banner')).toBeNull();
  });

  it('shows an access message for non-admin users', () => {
    mockUseAuthStore.mockReturnValue({ role: 'user' });

    const { getByText, queryByTestId } = renderAdmin();

    expect(getByText('Admin access required')).toBeTruthy();
    // Banner is admin-only too.
    expect(queryByTestId('offline-banner')).toBeNull();
  });

  describe('offline handling', () => {
    it('renders the offline banner when the device is offline', () => {
      mockUseAuthStore.mockReturnValue({ role: 'admin' });
      mockUseNetworkStatus.mockReturnValue({ isOffline: true });

      const { getByTestId, getByText } = renderAdmin();

      const banner = getByTestId('offline-banner');
      expect(banner).toBeTruthy();
      expect(getByText('No connection')).toBeTruthy();
      expect(getByText(/You're offline\. Admin actions can't be submitted/i)).toBeTruthy();
    });

    it('does not render the offline banner when online', () => {
      mockUseAuthStore.mockReturnValue({ role: 'admin' });
      mockUseNetworkStatus.mockReturnValue({ isOffline: false });

      const { queryByTestId } = renderAdmin();

      expect(queryByTestId('offline-banner')).toBeNull();
    });

    it.each(['clawback', 'lock', 'terminate'] as const)(
      'disables %s when offline and re-enables it when transitioning back online (same tree)',
      (actionKey) => {
        mockUseAuthStore.mockReturnValue({ role: 'admin' });

        // Render once, offline.
        mockUseNetworkStatus.mockReturnValue({ isOffline: true });
        const { rerender, getByTestId, queryByTestId } = renderAdmin();

        const offlineButton = getByTestId(`action-${actionKey}-stream-001`);
        expect(offlineButton.props.accessibilityState).toEqual({ disabled: true });
        expect(queryByTestId('offline-banner')).toBeTruthy();

        // Flip the hook to online and rerender on the same tree — this
        // mirrors the production path where useNetworkStatus reports a new
        // value and React re-renders the consumers.
        mockUseNetworkStatus.mockReturnValue({ isOffline: false });
        rerender(
          <AdminStreamsOverviewScreen
            navigation={{ goBack: jest.fn(), navigate: jest.fn() } as any}
            route={{} as any}
          />
        );

        const onlineButton = getByTestId(`action-${actionKey}-stream-001`);
        expect(onlineButton.props.accessibilityState).toEqual({ disabled: false });
        // Banner must have disappeared after the reconnect transition.
        expect(queryByTestId('offline-banner')).toBeNull();
      }
    );
  });

  // ── #85: Navigation to success screen ─────────────────────────────────

  it('navigates to AdminActionSuccess with correct params when Clawback is pressed', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const navigate = jest.fn();
    const { getAllByText } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation({ navigate }) as any} route={{} as any} />,
    );
    // First stream's first action button
    fireEvent.press(getAllByText('Clawback')[0]);
    expect(navigate).toHaveBeenCalledWith(
      'AdminActionSuccess',
      expect.objectContaining({ actionType: 'Clawback', streamId: 'stream-001' }),
    );
  });

  it('records the action in the history store when an action button is pressed', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { getAllByText } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    fireEvent.press(getAllByText('Lock')[0]);
    expect(mockAddAction).toHaveBeenCalledWith(
      expect.objectContaining({ actionType: 'Lock', streamId: 'stream-001' }),
    );
  });

  it('passes a timestamp in the navigation params', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const navigate = jest.fn();
    const { getAllByText } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation({ navigate }) as any} route={{} as any} />,
    );
    fireEvent.press(getAllByText('Terminate')[0]);
    const params = navigate.mock.calls[0][1];
    expect(typeof params.timestamp).toBe('string');
    expect(new Date(params.timestamp).toISOString()).toBe(params.timestamp);
  });

  // ── #86: Accessibility — admin view ───────────────────────────────────

  it('has an accessible "Back" button with correct label in the admin header', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    // accessibilityLabel="Go back" is set on the Back button
    const btn = UNSAFE_queryByProps({ accessibilityLabel: 'Go back' });
    expect(btn).not.toBeNull();
  });

  it('stream-001 Clawback button has accessible label', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    const btn = UNSAFE_queryByProps({ accessibilityLabel: 'Clawback stream stream-001' });
    expect(btn).not.toBeNull();
  });

  it('stream-001 Lock button has accessible label', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    const btn = UNSAFE_queryByProps({ accessibilityLabel: 'Lock stream stream-001' });
    expect(btn).not.toBeNull();
  });

  it('stream-001 Terminate button has accessible label', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    const btn = UNSAFE_queryByProps({ accessibilityLabel: 'Terminate stream stream-001' });
    expect(btn).not.toBeNull();
  });

  it('stream-002 Clawback button has accessible label', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    const btn = UNSAFE_queryByProps({ accessibilityLabel: 'Clawback stream stream-002' });
    expect(btn).not.toBeNull();
  });

  it('pending clawback amount text has an accessible label on stream-002', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    const el = UNSAFE_queryByProps({ accessibilityLabel: 'Pending clawback amount: 2500' });
    expect(el).not.toBeNull();
  });

  it('stream ID element has an accessible label', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    const el = UNSAFE_queryByProps({ accessibilityLabel: 'Stream ID: stream-001' });
    expect(el).not.toBeNull();
  });

  it('Clawback button has an accessibilityHint describing the action', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    const btn = UNSAFE_queryByProps({
      accessibilityHint: 'Executes an admin clawback on this stream and shows a confirmation',
    });
    expect(btn).not.toBeNull();
  });

  // ── #86: Accessibility — non-admin view ───────────────────────────────

  it('non-admin "Go back" button has accessible label', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'user' });
    const { UNSAFE_queryByProps } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    const btn = UNSAFE_queryByProps({ accessibilityLabel: 'Go back' });
    expect(btn).not.toBeNull();
  });

  it('non-admin "Go back" button calls navigation.goBack when pressed', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'user' });
    const goBack = jest.fn();
    const { getByText } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation({ goBack }) as any} route={{} as any} />,
    );
    fireEvent.press(getByText('Go back'));
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
