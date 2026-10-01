/* eslint-disable no-undef */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import OnboardingScreen, { ONBOARDING_SEEN_KEY } from '../OnboardingScreen';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
}));

describe('OnboardingScreen', () => {
  const mockOnDone = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the first slide on mount', () => {
    const { getByText } = render(<OnboardingScreen onDone={mockOnDone} />);
    expect(getByText('Welcome to EziAgric')).toBeTruthy();
  });

  it('renders a Skip button', () => {
    const { getByLabelText } = render(<OnboardingScreen onDone={mockOnDone} />);
    expect(getByLabelText('Skip onboarding')).toBeTruthy();
  });

  it('calls onDone and saves seen flag when Skip is pressed', async () => {
    const { getByLabelText } = render(<OnboardingScreen onDone={mockOnDone} />);
    fireEvent.press(getByLabelText('Skip onboarding'));
    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY, 'true');
      expect(mockOnDone).toHaveBeenCalledTimes(1);
    });
  });

  it('shows Get Started on the last slide', () => {
    const { getByText, getAllByLabelText } = render(<OnboardingScreen onDone={mockOnDone} />);
    // advance through slides 1, 2, 3
    const nextBtns = getAllByLabelText('Next slide');
    // tap next 3 times to reach slide 4
    fireEvent.press(nextBtns[0]);
    fireEvent.press(nextBtns[0]);
    fireEvent.press(nextBtns[0]);
    expect(getByText('Get Started')).toBeTruthy();
  });

  it('calls onDone and saves seen flag when Get Started is pressed', async () => {
    const { getByLabelText, getByText } = render(<OnboardingScreen onDone={mockOnDone} />);
    // advance to last slide
    for (let i = 0; i < 3; i++) {
      fireEvent.press(getByLabelText('Next slide'));
    }
    fireEvent.press(getByText('Get Started'));
    await waitFor(() => {
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(ONBOARDING_SEEN_KEY, 'true');
      expect(mockOnDone).toHaveBeenCalledTimes(1);
    });
  });
});
