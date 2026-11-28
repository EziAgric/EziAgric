import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

type Props = StackScreenProps<RootStackParamList, 'TrustScore'>;

interface ScoreComponent {
  label: string;
  score: number;
  maxScore: number;
  detail: string;
}

interface ReputationBreakdown {
  completedTrades: number;
  disputesRaised: number;
  disputesLost: number;
  avgDeliveryTimeHours: number;
}

interface TrustScoreData {
  address: string;
  overallScore: number;
  components: ScoreComponent[];
  breakdown?: ReputationBreakdown;
  computedAt: string;
}

interface Metric {
  key: string;
  label: string;
  value: string;
  explanation: string;
}

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = Math.min(100, Math.round((score / maxScore) * 100));
  const color = pct >= 80 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
  return (
    <View style={barStyles.track}>
      <View style={[barStyles.fill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { height: 8, backgroundColor: '#e0e8e0', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});

function ProgressRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color = clamped >= 80 ? '#16A34A' : clamped >= 50 ? '#D97706' : '#DC2626';
  return (
    <View style={[ringStyles.ring, { borderColor: color }]}>
      <Text style={[ringStyles.value, { color }]}>{clamped}</Text>
      <Text style={ringStyles.max}>/100</Text>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  ring: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  value: { fontSize: 44, fontWeight: '700' },
  max: { fontSize: 13, color: '#888', marginTop: -4 },
});

export default function TrustScoreScreen({ route, navigation }: Props) {
  const { address } = route.params;
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  const [data, setData] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<Metric | null>(null);

  useEffect(() => {
    apiClient
      .get(`/users/${encodeURIComponent(address)}/reputation`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load trust score'))
      .finally(() => setLoading(false));
  }, [address, token]);

  const overallColor = (s: number) => {
    if (s >= 80) return '#16A34A';
    if (s >= 50) return '#D97706';
    return '#DC2626';
  };

  const breakdown = data?.breakdown;
  const metrics: Metric[] = breakdown
    ? [
        {
          key: 'completedTrades',
          label: 'Completed Trades',
          value: String(breakdown.completedTrades),
          explanation:
            'The total number of trades you have successfully completed. More completed trades build a stronger, more reliable trust score.',
        },
        {
          key: 'disputesRaised',
          label: 'Disputes Raised',
          value: String(breakdown.disputesRaised),
          explanation:
            'Disputes you have opened against counterparties. A high number relative to your trades may lower your score.',
        },
        {
          key: 'disputesLost',
          label: 'Disputes Lost',
          value: String(breakdown.disputesLost),
          explanation:
            'Disputes resolved against you. Lost disputes weigh more heavily on your trust score than disputes you win.',
        },
        {
          key: 'avgDeliveryTimeHours',
          label: 'Avg. Delivery Time',
          value: `${breakdown.avgDeliveryTimeHours}h`,
          explanation:
            'Your average time to deliver on completed trades. Faster, on-time delivery improves your score.',
        },
      ]
    : [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trust Score</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator color="#2d6a2d" size="large" />}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {data && (
          <>
            <View style={styles.overallCard}>
              <Text style={styles.overallLabel}>Overall Trust Score</Text>
              <ProgressRing score={data.overallScore} />
              <Text style={styles.computedAt}>
                Computed {new Date(data.computedAt).toLocaleDateString()}
              </Text>
            </View>

            {metrics.length > 0 && (
              <View style={styles.breakdownCard}>
                <Text style={styles.sectionTitle}>Rating Breakdown</Text>
                {metrics.map((m) => (
                  <TouchableOpacity
                    key={m.key}
                    style={styles.metricRow}
                    onPress={() => setActiveMetric(m)}
                    accessibilityRole="button"
                    accessibilityLabel={`${m.label}: ${m.value}. Tap for explanation.`}
                  >
                    <Text style={styles.metricLabel}>{m.label}</Text>
                    <View style={styles.metricValueWrap}>
                      <Text style={styles.metricValue}>{m.value}</Text>
                      <Text style={styles.metricInfo}>ⓘ</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.breakdownCard}>
              <Text style={styles.sectionTitle}>Score Breakdown</Text>
              {data.components.map((c) => (
                <View key={c.label} style={styles.component}>
                  <View style={styles.componentHeader}>
                    <Text style={styles.componentLabel}>{c.label}</Text>
                    <Text style={styles.componentScore}>
                      {c.score}/{c.maxScore}
                    </Text>
                  </View>
                  <ScoreBar score={c.score} maxScore={c.maxScore} />
                  <Text style={styles.componentDetail}>{c.detail}</Text>
                </View>
              ))}
            </View>

            <View style={styles.noteCard}>
              <Text style={styles.noteText}>
                Trust scores are computed from completed trades, dispute history, peer reviews, and
                on-chain activity. Scores update after each completed trade.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={activeMetric !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveMetric(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setActiveMetric(null)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{activeMetric?.label}</Text>
            <Text style={styles.modalValue}>{activeMetric?.value}</Text>
            <Text style={styles.modalBody}>{activeMetric?.explanation}</Text>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setActiveMetric(null)}
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  overallCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  overallLabel: { fontSize: 13, color: '#888' },
  computedAt: { fontSize: 11, color: '#aaa', marginTop: 4 },
  breakdownCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a3a1a' },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f4f0',
  },
  metricLabel: { fontSize: 14, color: '#333' },
  metricValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricValue: { fontSize: 15, fontWeight: '700', color: '#1a3a1a' },
  metricInfo: { fontSize: 13, color: '#2d6a2d' },
  component: { gap: 6 },
  componentHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  componentLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  componentScore: { fontSize: 13, color: '#888' },
  componentDetail: { fontSize: 12, color: '#888', lineHeight: 17 },
  noteCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  noteText: { fontSize: 12, color: '#1D4ED8', lineHeight: 18 },
  errorBanner: { backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8 },
  errorText: { color: '#DC2626', fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 20, gap: 8 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1a3a1a' },
  modalValue: { fontSize: 24, fontWeight: '700', color: '#2d6a2d' },
  modalBody: { fontSize: 13, color: '#555', lineHeight: 19 },
  modalClose: {
    marginTop: 8,
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#2d6a2d',
    borderRadius: 8,
  },
  modalCloseText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
