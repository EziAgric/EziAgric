import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AdminStreamsOverviewScreen from './AdminStreamsOverviewScreen';
import { useAuthStore } from '../stores/authStore';
import { adminApi } from '../api/admin';
import { AdminApiError } from '../api/errors';

jest.mock('../stores/authStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../api/admin', () => ({
  adminApi: { listStreams: jest.fn() },
}));

jest.mock('react-native/Libraries/Linking/Linking', () => ({
  openURL: jest.fn().mockResolvedValue(true),
}));

const mockListStreams = adminApi.listStreams as jest.MockedFunction<
  typeof adminApi.listStreams
>;

describe('AdminStreamsOverviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuthStore as jest.Mock).mockReturnValue({
      role: 'admin',
      clearAuth: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('renders a stream list and action buttons for admin users', async () => {
    // Use a streamId distinct from the SEED_STREAMS so we can wait for the
    // API response to replace the seed before asserting (avoids matching
    // multiple Clawback buttons from the seed).
    mockListStreams.mockResolvedValue({
      items: [
        {
          streamId: 'stream-100',
          recipient: '',
          status: 'ACTIVE',
          vestingState: 'vesting',
          totalVested: '0',
          claimed: '0',
          unclaimed: '0',
          pendingClawback: '0',
          adminTags: [],
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const { findByText, findAllByText } = render(
      <AdminStreamsOverviewScreen navigation={navigation as any} route={{} as any} />,
    );

    expect(await findByText('Admin stream overview')).toBeTruthy();
    // Wait for the API response to replace SEED_STREAMS with the single
    // stream returned by the mocked endpoint.
    await findByText('stream-100');
    expect((await findAllByText('Clawback')).length).toBe(1);
    expect((await findAllByText('Lock')).length).toBe(1);
    expect((await findAllByText('Terminate')).length).toBe(1);
  });

  it('renders SEED_STREAMS placeholder before the first API response resolves', () => {
    // Never-resolving fetch — verifies the seed list keeps the screen
    // populated for offline / slow-network scenarios.
    mockListStreams.mockReturnValue(new Promise(() => {}));

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const { getByText } = render(
      <AdminStreamsOverviewScreen navigation={navigation as any} route={{} as any} />,
    );

    expect(getByText('stream-001')).toBeTruthy();
    expect(getByText('stream-002')).toBeTruthy();
  });

  it('shows an access message for non-admin users', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'user' });

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const { getByText } = render(
      <AdminStreamsOverviewScreen navigation={navigation as any} route={{} as any} />,
    );

    expect(getByText('Admin access required')).toBeTruthy();
  });

  it('surfaces a NETWORK_ERROR banner when the API throws an offline error', async () => {
    // Use a real AdminApiError instance so the test exercises the
    // production `viewForError(adminApiError)` branch and the friendly
    // title/message mapping, not the generic non-ApiError fallback.
    mockListStreams.mockRejectedValue(
      new AdminApiError({
        code: 'NETWORK_ERROR',
        message: "You appear to be offline. Check your connection and try again.",
        status: undefined,
      }),
    );

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const { findByTestId, getByText } = render(
      <AdminStreamsOverviewScreen navigation={navigation as any} route={{} as any} />,
    );

    const banner = await findByTestId('admin-error-banner');
    expect(banner).toBeTruthy();
    expect(getByText(/appear to be offline/i)).toBeTruthy();

    // The banner offers a retry button — press it and confirm the API
    // is called again so the network-failure path is recoverable.
    const retry = await findByTestId('admin-error-banner-primary-retry');
    await act(async () => {
      fireEvent.press(retry);
    });
    await waitFor(() => expect(mockListStreams).toHaveBeenCalledTimes(2));
  });
});
