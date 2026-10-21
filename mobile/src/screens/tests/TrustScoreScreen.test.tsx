import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import TrustScoreScreen from '../TrustScoreScreen';

// Mock the safe area context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => inset,
  };
});

describe('TrustScoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state', () => {
    render(<TrustScoreScreen />);
    expect(screen.getByText('Calculating trust score...')).toBeTruthy();
  });

  it('renders error state with retry button', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Failed to fetch'));
    
    render(<TrustScoreScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Failed to fetch')).toBeTruthy();
    });
    
    expect(screen.getByTestId('retry-button')).toBeTruthy();
  });

  it('displays trust score data correctly', async () => {
    render(<TrustScoreScreen />);
    
    await waitFor(() => {
      // Main score should be displayed
      expect(screen.getByText('85')).toBeTruthy();
      expect(screen.getByText('Excellent')).toBeTruthy();
    });
  });

  it('shows score breakdown with progress bars', async () => {
    render(<TrustScoreScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Completed Trades')).toBeTruthy();
      expect(screen.getByText('45')).toBeTruthy();
      expect(screen.getByText('Response Time')).toBeTruthy();
      expect(screen.getByText('92%')).toBeTruthy();
    });
  });

  it('displays score history', async () => {
    render(<TrustScoreScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Score History')).toBeTruthy();
      expect(screen.getByText('2024-10')).toBeTruthy();
      expect(screen.getByText('2024-09')).toBeTruthy();
    });
  });

  it('has working retry button', async () => {
    render(<TrustScoreScreen />);
    
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy();
    });
    
    const retryButton = screen.getByTestId('retry-button');
    fireEvent.press(retryButton);
    
    // Should show loading state again
    expect(screen.getByText('Calculating trust score...')).toBeTruthy();
  });
});