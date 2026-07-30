import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AdminStreamsOverviewScreen from './AdminStreamsOverviewScreen';
import { useAuthStore } from '../stores/authStore';

jest.mock('../stores/authStore', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('AdminStreamsOverviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a stream list and action buttons for admin users', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'admin' });

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const { getByText } = render(
      <AdminStreamsOverviewScreen navigation={navigation as any} route={{} as any} />
    );

    expect(getByText('Admin stream overview')).toBeTruthy();
    expect(getByText('stream-001')).toBeTruthy();
    expect(getByText('Clawback')).toBeTruthy();
    expect(getByText('Lock')).toBeTruthy();
    expect(getByText('Terminate')).toBeTruthy();
  });

  it('shows an access message for non-admin users', () => {
    (useAuthStore as jest.Mock).mockReturnValue({ role: 'user' });

    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const { getByText } = render(
      <AdminStreamsOverviewScreen navigation={navigation as any} route={{} as any} />
    );

    expect(getByText('Admin access required')).toBeTruthy();
  });
});
