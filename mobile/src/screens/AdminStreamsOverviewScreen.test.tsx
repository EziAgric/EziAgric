import { render, within } from '@testing-library/react-native';
import AdminStreamsOverviewScreen from './AdminStreamsOverviewScreen';
import { useAuthStore } from '../stores/authStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

jest.mock('../stores/authStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../hooks/useNetworkStatus', () => ({
  useNetworkStatus: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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
  beforeEach(() => {
    jest.clearAllMocks();
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
});
