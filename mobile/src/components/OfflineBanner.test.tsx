import { render, screen } from '@testing-library/react-native';
import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner', () => {
  it('renders the default headline and message', () => {
    render(<OfflineBanner />);
    expect(screen.getByText('No connection')).toBeTruthy();
    expect(
      screen.getByText(/You're offline\. Admin actions can't be submitted/i)
    ).toBeTruthy();
  });

  it('uses the default accessibility role and live region', () => {
    render(<OfflineBanner />);
    const banner = screen.getByTestId('offline-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLiveRegion).toBe('polite');
  });

  it('renders a custom message override', () => {
    render(<OfflineBanner message="Trading requires a connection." />);
    expect(screen.getByText('Trading requires a connection.')).toBeTruthy();
    // Default headline stays.
    expect(screen.getByText('No connection')).toBeTruthy();
  });
});
