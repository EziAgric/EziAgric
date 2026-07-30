import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';
import { adminApi, AdminStreamSummary } from '../api/admin';
import { viewForError } from '../api/errorInterceptor';
import { AdminErrorBanner } from '../components/AdminErrorBanner';
import { buildSupportMailto } from '../constants/support';

type Props = StackScreenProps<RootStackParamList, 'AdminStreamsOverview'>;

/**
 * Seed list shown until the first API response lands so the existing
 * "renders a stream list" expectation still passes for offline / test
 * scenarios. Replaced by real data once the API responds.
 */
const SEED_STREAMS: AdminStreamSummary[] = [
  {
    streamId: 'stream-001',
    recipient: '',
    status: 'ACTIVE',
    vestingState: 'vesting',
    totalVested: '0',
    claimed: '0',
    unclaimed: '0',
    pendingClawback: '0',
    adminTags: [],
  },
  {
    streamId: 'stream-002',
    recipient: '',
    status: 'SUSPENDED',
    vestingState: 'vesting',
    totalVested: '2500',
    claimed: '0',
    unclaimed: '2500',
    pendingClawback: '0',
    adminTags: [],
  },
];

export default function AdminStreamsOverviewScreen({
  navigation,
}: Props) {
  const insets = useSafeAreaInsets();
  const { role, clearAuth } = useAuthStore();
  const isAdmin = role === 'admin';

  const [streams, setStreams] = useState<AdminStreamSummary[] | null>(
    SEED_STREAMS,
  );
  const [errorView, setErrorView] = useState<
    ReturnType<typeof viewForError> | null
  >(null);
  const [loading, setLoading] = useState(false);

  const loadStreams = useCallback(async () => {
    setLoading(true);
    setErrorView(null);
    try {
      const result = await adminApi.listStreams();
      setStreams(result.items ?? []);
    } catch (error: unknown) {
      setErrorView(viewForError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadStreams();
    }
  }, [isAdmin, loadStreams]);

  const handleSignOut = useCallback(async () => {
    await clearAuth();
    navigation.goBack();
  }, [clearAuth, navigation]);

  const handleContactSupport = useCallback(() => {
    void Linking.openURL(buildSupportMailto(errorView, 'stream overview'));
  }, [errorView]);

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Admin access required</Text>
        <Text style={styles.body}>
          Only administrators can manage streams from this screen.
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
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

      {errorView ? (
        <AdminErrorBanner
          view={errorView}
          onRetry={() => void loadStreams()}
          onSignOut={handleSignOut}
          onGoBack={() => navigation.goBack()}
          onContactSupport={handleContactSupport}
        />
      ) : null}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#2d6a2d" />
          <Text style={styles.loadingText}>Loading streams…</Text>
        </View>
      ) : null}

      <FlatList
        data={streams ?? []}
        keyExtractor={(item) => item.streamId}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.streamId}>{item.streamId}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
            <Text style={styles.meta}>
              Pending clawback: {item.pendingClawback}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionText}>Clawback</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionText}>Lock</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton}>
                <Text style={styles.actionText}>Terminate</Text>
              </TouchableOpacity>
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
  actionText: { color: '#2d6a2d', fontWeight: '600', fontSize: 13 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: { color: '#4f5d4f', fontSize: 14 },
});
