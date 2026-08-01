import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { OfflineBanner } from '../components/OfflineBanner';

type Props = StackScreenProps<RootStackParamList, 'AdminStreamsOverview'>;

interface StreamSummary {
  id: string;
  status: string;
  pendingClawback: string;
}

interface AdminAction {
  /** Stable key used for both React keys and testIDs, e.g. `action-<key>-<streamId>`. */
  key: 'clawback' | 'lock' | 'terminate';
  label: string;
}

const ADMIN_ACTIONS: AdminAction[] = [
  { key: 'clawback', label: 'Clawback' },
  { key: 'lock', label: 'Lock' },
  { key: 'terminate', label: 'Terminate' },
];

const STREAMS: StreamSummary[] = [
  { id: 'stream-001', status: 'ACTIVE', pendingClawback: '0' },
  { id: 'stream-002', status: 'SUSPENDED', pendingClawback: '2500' },
];

export default function AdminStreamsOverviewScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  // `role` is not yet on AuthState — it will be added in a follow-up auth
  // PR. Narrow locally so TS is happy without leaking the field into store
  // types. Tests inject the value via the authStore mock + the standard
  // `as unknown as jest.Mock` cast in the test file.
  const { role } = useAuthStore() as unknown as { role: 'admin' | 'user' | null };
  const { isOffline } = useNetworkStatus();
  const isAdmin = role === 'admin';

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Admin access required</Text>
        <Text style={styles.body}>Only administrators can manage streams from this screen.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin stream overview</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      {isOffline ? <OfflineBanner /> : null}

      <FlatList
        data={STREAMS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.streamId}>{item.id}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
            <Text style={styles.meta}>Pending clawback: {item.pendingClawback}</Text>
            <View style={styles.actions}>
              {ADMIN_ACTIONS.map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.actionButton, isOffline && styles.actionButtonDisabled]}
                  disabled={isOffline}
                  // `accessibilityState.disabled` is set explicitly even
                  // though TouchableOpacity auto-mirrors the `disabled`
                  // prop — the offline test asserts on this object for a
                  // cross-platform-stable signal.
                  accessibilityState={{ disabled: isOffline }}
                  testID={`action-${key}-${item.id}`}
                >
                  <Text style={styles.actionText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f4', paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1f3d1f' },
  body: { fontSize: 14, color: '#4f5d4f', marginTop: 8, lineHeight: 20 },
  backButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: { color: '#fff', fontWeight: '600' },
  listContent: { paddingBottom: 24, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streamId: { fontSize: 16, fontWeight: '700', color: '#1f3d1f' },
  status: { fontSize: 12, color: '#2d6a2d', fontWeight: '700' },
  meta: { fontSize: 13, color: '#4f5d4f' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    backgroundColor: '#eaf4ea',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionText: { color: '#2d6a2d', fontWeight: '600', fontSize: 13 },
});
