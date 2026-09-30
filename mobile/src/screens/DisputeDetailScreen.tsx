import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

type Props = StackScreenProps<RootStackParamList, 'DisputeDetail'>;

interface Dispute {
  id: string;
  tradeId: string;
  reason: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  buyerAddress: string;
  sellerAddress: string;
  createdAt: string;
  resolution?: string;
}

export default function DisputeDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();
  const [isMediatorRole, setIsMediatorRole] = useState(false);

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get(`/disputes/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => {
        setDispute(r.data);
        // Backend sets X-User-Role header on authenticated dispute responses
        if (r.headers?.['x-user-role'] === 'mediator' || r.headers?.['x-user-role'] === 'admin') {
          setIsMediatorRole(true);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dispute'))
      .finally(() => setLoading(false));
  }, [id, token]);

  const statusColor = (s: string) => {
    if (s === 'OPEN') return '#DC2626';
    if (s === 'UNDER_REVIEW') return '#D97706';
    return '#16A34A';
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispute</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator color="#2d6a2d" size="large" />}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {dispute && (
          <>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.label}>Status</Text>
                <Text style={[styles.status, { color: statusColor(dispute.status) }]}>
                  {dispute.status.replace('_', ' ')}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Trade</Text>
                <Text style={styles.value}>{dispute.tradeId.slice(0, 16)}…</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Buyer</Text>
                <Text style={styles.value}>{dispute.buyerAddress.slice(0, 16)}…</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Seller</Text>
                <Text style={styles.value}>{dispute.sellerAddress.slice(0, 16)}…</Text>
              </View>
              <View style={styles.reasonBox}>
                <Text style={styles.label}>Reason</Text>
                <Text style={styles.reason}>{dispute.reason}</Text>
              </View>
              {dispute.resolution && (
                <View style={styles.reasonBox}>
                  <Text style={styles.label}>Resolution</Text>
                  <Text style={styles.reason}>{dispute.resolution}</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.evidenceBtn}
              onPress={() => navigation.navigate('EvidenceCapture', { tradeId: dispute.tradeId })}
            >
              <Text style={styles.evidenceBtnText}>📎 Upload Evidence</Text>
            </TouchableOpacity>

            {isMediatorRole && (
              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={() =>
                  navigation.navigate('MediatorDisputeReview', { disputeId: dispute.id })
                }
              >
                <Text style={styles.reviewBtnText}>⚖️ Review as Mediator</Text>
              </TouchableOpacity>
            )}
          </>
        )}
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
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, color: '#888', fontWeight: '500' },
  value: { fontSize: 13, color: '#333', fontFamily: 'monospace' },
  status: { fontSize: 13, fontWeight: '700' },
  reasonBox: { gap: 4 },
  reason: { fontSize: 14, color: '#333', lineHeight: 20 },
  errorBanner: { backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8 },
  errorText: { color: '#DC2626', fontSize: 13 },
  evidenceBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2563EB',
    paddingVertical: 14,
    alignItems: 'center',
  },
  evidenceBtnText: { color: '#2563EB', fontSize: 15, fontWeight: '600' },
  reviewBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  reviewBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
