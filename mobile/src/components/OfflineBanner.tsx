import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface OfflineBannerProps {
  /** Optional override for the headline text. Defaults to a generic message. */
  message?: string;
}

/**
 * Inline banner shown when network connectivity is lost.
 *
 * Kept simple and dependency-free so it can be rendered at the top of any
 * screen that needs an explicit offline signal. The component is purely
 * presentational: callers decide *when* to render it based on a network
 * status hook.
 */
export function OfflineBanner({ message }: OfflineBannerProps): React.JSX.Element {
  const body =
    message ??
    "You're offline. Admin actions can't be submitted until the device reconnects.";

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.banner}
      testID="offline-banner"
    >
      <Text style={styles.headline}>No connection</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fff4e1',
    borderColor: '#d99a2b',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginVertical: 8,
    gap: 2,
  },
  headline: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7a4d00',
  },
  body: {
    fontSize: 13,
    color: '#7a4d00',
    lineHeight: 18,
  },
});
