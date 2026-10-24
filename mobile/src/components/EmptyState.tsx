import { StyleSheet, Text } from 'react-native';

/**
 * - `section`: sits under a section title inside a scrolling page
 *   (e.g. "No trades yet." on CoopHome).
 * - `list`: used as a FlatList `ListEmptyComponent`, centred with top
 *   spacing so it doesn't hug the header (e.g. DriverHome manifests).
 */
export type EmptyStateVariant = 'section' | 'list';

interface EmptyStateProps {
  message: string;
  variant?: EmptyStateVariant;
  testID?: string;
}

export function EmptyState({ message, variant = 'list', testID }: EmptyStateProps) {
  return (
    <Text style={styles[variant]} testID={testID}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  section: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 20,
  },
  list: {
    textAlign: 'center',
    color: '#667',
    marginTop: 40,
  },
});

export default EmptyState;
