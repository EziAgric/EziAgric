import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import DisputeDetailScreen from '../DisputeDetailScreen';

// Mock the safe area context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => inset,
  };
});

describe('DisputeDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state', () => {
    render(<DisputeDetailScreen />);
    expect(screen.getByText('Loading dispute details...')).toBeTruthy();
  });

  it('renders error state with retry button', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Failed to load dispute'));
    
    render(<DisputeDetailScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to load dispute details')).toBeTruthy();
    });
    
    expect(screen.getByTestId('retry-button')).toBeTruthy();
  });

  it('displays dispute status banner', async () => {
    render(<DisputeDetailScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Under Review')).toBeTruthy();
    });
  });

  it('shows trade information', async () => {
    render(<DisputeDetailScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Trade Information')).toBeTruthy();
      expect(screen.getByText('trade-004')).toBeTruthy();
      expect(screen.getByText('Cassava Flour (20kg)')).toBeTruthy();
      expect(screen.getByText('8,000 NGN')).toBeTruthy();
    });
  });

  it('displays dispute reason', async () => {
    render(<DisputeDetailScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Dispute Information')).toBeTruthy();
      expect(screen.getByText('Reason')).toBeTruthy();
      expect(screen.getByText(/Goods received were of inferior quality/)).toBeTruthy();
    });
  });

  it('shows evidence list', async () => {
    render(<DisputeDetailScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Evidence (2)')).toBeTruthy();
      expect(screen.getByText('VIDEO')).toBeTruthy();
      expect(screen.getByText('TEXT')).toBeTruthy();
    });
  });

  it('has working retry button', async () => {
    render(<DisputeDetailScreen />);
    
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy();
    });
    
    fireEvent.press(screen.getByTestId('retry-button'));
    
    // Should show loading state again
    expect(screen.getByText('Loading dispute details...')).toBeTruthy();
  });

  it('displays who raised the dispute', async () => {
    render(<DisputeDetailScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Raised By')).toBeTruthy();
      expect(screen.getByText('Buyer')).toBeTruthy();
    });
  });
});