import React from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLowBandwidth } from '../hooks/useLowBandwidth';

export default function SettingsScreen() {
  const { lowBandwidth, setLowBandwidth, autoDetected } = useLowBandwidth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Data & Performance</Text>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Low-bandwidth mode</Text>
          <Text style={styles.rowHint}>
            Disables image preloading, shows placeholder thumbnails, and stops video autoload.
            {autoDetected ? ' Enabled automatically on slow connections.' : ''}
          </Text>
        </View>
        <Switch
          value={lowBandwidth}
          onValueChange={setLowBandwidth}
          accessibilityLabel="Low-bandwidth mode"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowText: {
    flex: 1,
    paddingRight: 12,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowHint: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.7,
  },
});
