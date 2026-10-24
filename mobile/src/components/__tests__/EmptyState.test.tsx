import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders the message', () => {
    const { getByText } = render(<EmptyState message="Nothing here." />);
    expect(getByText('Nothing here.')).toBeTruthy();
  });

  it('defaults to the centred list variant', () => {
    const { getByText } = render(<EmptyState message="Nothing here." />);
    expect(StyleSheet.flatten(getByText('Nothing here.').props.style)).toEqual({
      textAlign: 'center',
      color: '#667',
      marginTop: 40,
    });
  });

  it('applies the section variant styles', () => {
    const { getByText } = render(<EmptyState variant="section" message="No trades yet." />);
    expect(StyleSheet.flatten(getByText('No trades yet.').props.style)).toEqual({
      color: '#9ca3af',
      fontSize: 14,
      marginBottom: 20,
    });
  });

  it('forwards testID', () => {
    const { getByTestId } = render(<EmptyState message="Empty" testID="empty-state" />);
    expect(getByTestId('empty-state')).toBeTruthy();
  });
});
