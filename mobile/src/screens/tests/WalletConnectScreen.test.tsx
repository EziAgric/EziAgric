import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import WalletConnectScreen from '../WalletConnectScreen';
import * as Linking from 'react-native';

// Mock the safe area context
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    useSafeAreaInsets: () => inset,
  };
});

// Mock Linking
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    Linking: {
      ...actual.Linking,
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
      getInitialURL: jest.fn(() => Promise.resolve(null)),
    },
  };
});

describe('WalletConnectScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders wallet connection options', () => {
    render(<WalletConnectScreen />);
    expect(screen.getByText('Connect Wallet')).toBeTruthy();
  });

  it('shows wallet options when not connected', () => {
    render(<WalletConnectScreen />);
    
    expect(screen.getByTestId('connect-freighter')).toBeTruthy();
    expect(screen.getByTestId('connect-albedo')).toBeTruthy();
    expect(screen.getByTestId('connect-xbull')).toBeTruthy();
  });

  it('shows loading state when connecting', async () => {
    render(<WalletConnectScreen />);
    
    const freighterButton = screen.getByTestId('connect-freighter');
    fireEvent.press(freighterButton);
    
    expect(screen.getByText('Connecting wallet...')).toBeTruthy();
  });

  it('shows connected state after successful connection', async () => {
    render(<WalletConnectScreen />);
    
    const freighterButton = screen.getByTestId('connect-freighter');
    fireEvent.press(freighterButton);
    
    await waitFor(() => {
      expect(screen.getByText('Wallet Connected')).toBeTruthy();
      expect(screen.getByText('My Wallet')).toBeTruthy();
    });
  });

  it('displays wallet address when connected', async () => {
    render(<WalletConnectScreen />);
    
    const freighterButton = screen.getByTestId('connect-freighter');
    fireEvent.press(freighterButton);
    
    await waitFor(() => {
      expect(screen.getByText('Address')).toBeTruthy();
      expect(screen.getByText('GAC2ZUXLLFS7CIM2KOH6G3W7KXXXXX')).toBeTruthy();
    });
  });

  it('has disconnect button when connected', async () => {
    render(<WalletConnectScreen />);
    
    const freighterButton = screen.getByTestId('connect-freighter');
    fireEvent.press(freighterButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('disconnect-button')).toBeTruthy();
    });
  });

  it('disconnects wallet when disconnect button pressed', async () => {
    render(<WalletConnectScreen />);
    
    // Connect first
    const freighterButton = screen.getByTestId('connect-freighter');
    fireEvent.press(freighterButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('disconnect-button')).toBeTruthy();
    });
    
    // Disconnect
    const disconnectButton = screen.getByTestId('disconnect-button');
    fireEvent.press(disconnectButton);
    
    // Should show connect options again
    await waitFor(() => {
      expect(screen.getByTestId('connect-freighter')).toBeTruthy();
    });
  });

  it('has copy address button when connected', async () => {
    render(<WalletConnectScreen />);
    
    const freighterButton = screen.getByTestId('connect-freighter');
    fireEvent.press(freighterButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('copy-address-button')).toBeTruthy();
    });
  });
});