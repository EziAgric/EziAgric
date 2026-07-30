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
import { fireEvent, render } from '@testing-library/react-native';
import AdminStreamsOverviewScreen from './AdminStreamsOverviewScreen';
import { useAuthStore } from '../stores/authStore';
import { useAdminActionHistoryStore } from '../stores/adminActionHistoryStore';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../stores/authStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('../stores/adminActionHistoryStore', () => ({
  useAdminActionHistoryStore: jest.fn(),
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdminStreamsOverviewScreen', () => {
  const mockAddAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useAdminActionHistoryStore as jest.Mock).mockReturnValue({ addAction: mockAddAction });
  });

  // ── Rendering ──────────────────────────────────────────────────────────

  it('renders stream list and action buttons for admin users', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });
    const { getByText, getAllByText } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    expect(getByText('Admin stream overview')).toBeTruthy();
    expect(getByText('stream-001')).toBeTruthy();
    // Two streams each have Clawback/Lock/Terminate buttons — use getAllByText
    expect(getAllByText('Clawback').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Lock').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Terminate').length).toBeGreaterThanOrEqual(1);
  });

  it('shows access-denied message for non-admin users', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'user' });
    const { getByText } = render(
      <AdminStreamsOverviewScreen navigation={buildNavigation() as any} route={{} as any} />,
    );
    expect(getByText('Admin access required')).toBeTruthy();
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
