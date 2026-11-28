import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * - `section`: sits under a section title inside a scrolling page
 *   (e.g. "No trades yet." on CoopHome).
 * - `list`: used as a FlatList `ListEmptyComponent`, centred with top
 *   spacing so it doesn't hug the header (e.g. DriverHome manifests).
 */
export type EmptyStateVariant = 'section' | 'list';

interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

interface EmptyStateProps {
  message: string;
  variant?: EmptyStateVariant;
  testID?: string;
  /** Optional illustration rendered above the heading. */
  illustration?: React.ReactNode;
  /** Optional heading shown above the message. */
  heading?: string;
  /** Optional call-to-action button rendered below the message. */
  action?: EmptyStateAction;
}

export function EmptyState({
  message,
  variant = 'list',
  testID,
  illustration,
  heading,
  action,
}: EmptyStateProps) {
  if (!illustration && !heading && !action) {
    return (
      <Text style={styles[variant]} testID={testID}>
        {message}
      </Text>
    );
  }

  return (
    <View style={[styles.container, styles[`${variant}Container`]]} testID={testID}>
      {illustration ? <View style={styles.illustration}>{illustration}</View> : null}
      {heading ? <Text style={styles.heading}>{heading}</Text> : null}
      <Text style={styles[variant]}>{message}</Text>
      {action ? (
        <Pressable
          style={styles.action}
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  listContainer: {
    marginTop: 40,
  },
  illustration: {
    marginBottom: 16,
  },
  heading: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
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
  action: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  actionLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default EmptyState;
