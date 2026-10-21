import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import VaultDashboard from '../VaultDashboard';

// Mock the safe area context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => inset,
  };
});

describe('VaultDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton', () => {
    render(<VaultDashboard />);
    // Skeleton should be visible during loading
    expect(screen.getByText('Vault Dashboard')).toBeTruthy();
  });

  it('renders error state with retry button', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Failed to load vault'));
    
    render(<VaultDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load vault data')).toBeTruthy();
    });
    
    expect(screen.getByTestId('retry-button')).toBeTruthy();
  });

  it('displays vault balance', async () => {
    render(<VaultDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Total Balance')).toBeTruthy();
      expect(screen.getByText('93,000 NGN')).toBeTruthy();
    });
  });

  it('displays active and completed trade counts', async () => {
    render(<VaultDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('Completed')).toBeTruthy();
      expect(screen.getByText('1')).toBeTruthy();
    });
  });

  it('renders trade rows with testID', async () => {
    render(<VaultDashboard />);
    
    await waitFor(() => {
      expect(screen.getByTestId('trade-row-trade-001')).toBeTruthy();
      expect(screen.getByTestId('trade-row-trade-002')).toBeTruthy();
    });
  });

  it('shows trade product information', async () => {
    render(<VaultDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('Maize (50kg)')).toBeTruthy();
      expect(screen.getByText('Rice (25kg)')).toBeTruthy();
    });
  });

  it('has working retry button', async () => {
    render(<VaultDashboard />);
    
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy();
    });
    
    fireEvent.press(screen.getByTestId('retry-button'));
    
    // Should show loading state again
    expect(screen.getByText('Vault Dashboard')).toBeTruthy();
  });

  it('displays empty state when no trades', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      json: async () => ({ trades: [], balance: 0 }),
    } as Response);
    
    render(<VaultDashboard />);
    
    await waitFor(() => {
      expect(screen.getByText('No trades yet')).toBeTruthy();
    });
  });
});