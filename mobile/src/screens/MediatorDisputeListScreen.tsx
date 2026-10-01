import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

type Props = StackScreenProps<RootStackParamList, 'MediatorDisputeList'>;

interface DisputeSummary {
  id: string;
  tradeId: string;
  reason: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  createdAt: string;
  slaDeadlineAt?: string;
}

function slaColor(deadlineIso?: string): string {
  if (!deadlineIso) return '#888';
  const msLeft = new Date(deadlineIso).getTime() - Date.now();
  if (msLeft < 0) return '#DC2626';
  if (msLeft < 4 * 60 * 60 * 1000) return '#D97706';
  return '#16A34A';
}

function slaLabel(deadlineIso?: string): string {
  if (!deadlineIso) return 'No SLA';
  const msLeft = new Date(deadlineIso).getTime() - Date.now();
  if (msLeft < 0) return 'Overdue';
  const h = Math.floor(msLeft / (60 * 60 * 1000));
  const m = Math.floor((msLeft % (60 * 60 * 1000)) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

export default function MediatorDisputeListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  const [disputes, setDisputes] = useState<DisputeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDisputes = useCallback(async () => {
    try {
      const r = await apiClient.get('/mediator/disputes', {
        params: { status: 'OPEN,UNDER_REVIEW' },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setDisputes(r.data.disputes ?? r.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load disputes');
    }
  }, [token]);

  useEffect(() => {
    loadDisputes().finally(() => setLoading(false));
  }, [loadDisputes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDisputes().finally(() => setRefreshing(false));
  }, [loadDisputes]);

  const renderItem = ({ item }: { item: DisputeSummary }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('MediatorDisputeReview', { disputeId: item.id })}
      activeOpacity={0.8}
    >
      <View style={styles.cardTop}>
        <Text style={styles.disputeId}>#{item.id.slice(0, 10)}…</Text>
        <View style={[styles.statusBadge, item.status === 'UNDER_REVIEW' && styles.badgeReview]}>
          <Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text>
        </View>
      </View>
      <Text style={styles.tradeRef}>Trade: {item.tradeId.slice(0, 14)}…</Text>
      <Text style={styles.reason} numberOfLines={2}>{item.reason}</Text>
      <View style={styles.cardBottom}>
        <Text style={styles.createdAt}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        <Text style={[styles.sla, { color: slaColor(item.slaDeadlineAt) }]}>
          ⏱ {slaLabel(item.slaDeadlineAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispute Queue</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading && <ActivityIndicator color="#2d6a2d" size="large" style={{ marginTop: 40 }} />}

      {error && !loading && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && (
        <FlatList
          data={disputes}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>✅</Text>
              <Text style={styles.emptyText}>No open disputes</Text>
            </View>
          }
        />
      )}
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
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  disputeId: { fontSize: 13, color: '#555', fontFamily: 'monospace' },
  statusBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeReview: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 11, fontWeight: '700', color: '#333' },
  tradeRef: { fontSize: 12, color: '#888', fontFamily: 'monospace' },
  reason: { fontSize: 14, color: '#333', lineHeight: 20 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  createdAt: { fontSize: 12, color: '#888' },
  sla: { fontSize: 12, fontWeight: '700' },
  errorBanner: { margin: 16, backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8 },
  errorText: { color: '#DC2626', fontSize: 13 },
  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: '#888' },
});
