import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import { useBiometrics } from '../hooks/useBiometrics';

type Props = StackScreenProps<RootStackParamList, 'SecuritySettings'>;

export default function SecuritySettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const {
    isAvailable,
    isDeviceSecure,
    biometricsEnabled,
    setBiometricsEnabled,
  } = useBiometrics();
  const [saving, setSaving] = useState(false);

  const deviceCanAuthenticate = isAvailable || isDeviceSecure;

  const handleToggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await setBiometricsEnabled(enabled);
    } catch {
      Alert.alert(
        'Could not save setting',
        'Your biometrics preference was not saved. Please try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="security-settings-back"
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Biometric authentication</Text>
          <Text style={styles.description}>
            Require device authentication before confirming delivery, releasing
            funds, or approving a dispute settlement. You will be prompted every
            time; a successful check is never remembered.
          </Text>

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Use biometrics</Text>
              <Text style={styles.toggleHint}>
                {biometricsEnabled
                  ? 'Face ID / fingerprint with device PIN fallback'
                  : 'Device PIN fallback only'}
              </Text>
            </View>
            <Switch
              testID="biometrics-toggle"
              value={biometricsEnabled}
              onValueChange={(next) => void handleToggle(next)}
              disabled={saving || !deviceCanAuthenticate}
              trackColor={{ false: '#cbd5cb', true: '#2d6a2d' }}
              thumbColor="#fff"
            />
          </View>

          {!deviceCanAuthenticate && (
            <Text style={styles.warning}>
              This device has no biometrics or secure screen lock configured.
              Protected actions will be blocked until you set one up in your
              device settings.
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e0',
  },
  backText: { fontSize: 14, color: '#2d6a2d', fontWeight: '500', width: 60 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a3a1a' },
  content: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#1a3a1a' },
  description: { fontSize: 13, color: '#526552', lineHeight: 19 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e8e0',
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: '#1a3a1a' },
  toggleHint: { fontSize: 12, color: '#6b7f6b', marginTop: 2 },
  warning: { fontSize: 12, color: '#9a3412', lineHeight: 17 },
});
