import { render, screen, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../ProfileScreen';

// Mock the safe area context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => inset,
  };
});

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state', () => {
    render(<ProfileScreen />);
    expect(screen.getByText('Loading profile...')).toBeTruthy();
  });

  it('renders error state with retry button', async () => {
    // Mock fetch to throw error
    jest.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));
    
    render(<ProfileScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
    
    expect(screen.getByTestId('retry-button')).toBeTruthy();
  });

  it('renders profile data after successful fetch', async () => {
    render(<ProfileScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('John Farmer')).toBeTruthy();
      expect(screen.getByText('john@example.com')).toBeTruthy();
    });
    
    // Check trust score is displayed
    expect(screen.getByText('85')).toBeTruthy();
    
    // Check trade statistics
    expect(screen.getByText('Total Trades')).toBeTruthy();
    expect(screen.getByText('24')).toBeTruthy();
  });

  it('displays star ratings correctly', async () => {
    render(<ProfileScreen />);
    
    await waitFor(() => {
      expect(screen.getByTestId('star-4')).toBeTruthy();
    });
    
    // Stars 1-4 should be filled (rating is 4.2, rounded to 4)
    expect(screen.getByTestId('star-1')).toBeTruthy();
    expect(screen.getByTestId('star-2')).toBeTruthy();
    expect(screen.getByTestId('star-3')).toBeTruthy();
  });

  it('calculates success rate correctly', async () => {
    render(<ProfileScreen />);
    
    await waitFor(() => {
      // 22 successful out of 24 = 92%
      expect(screen.getByText('92%')).toBeTruthy();
    });
  });

  it('has retry functionality', async () => {
    render(<ProfileScreen />);
    
    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toBeTruthy();
    });
    
    // Retry button should be tappable
    const retryButton = screen.getByTestId('retry-button');
    expect(retryButton).toBeTruthy();
  });
});