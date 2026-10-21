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

type Props = StackScreenProps<RootStackParamList, 'TrustScore'>;

interface ScoreComponent {
  label: string;
  score: number;
  maxScore: number;
  detail: string;
}

interface TrustScoreData {
  address: string;
  overallScore: number;
  components: ScoreComponent[];
  computedAt: string;
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

export default function TrustScoreScreen({ route, navigation }: Props) {
  const { address } = route.params;
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  const [data, setData] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get(`/users/${encodeURIComponent(address)}/trust-score`, {
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
              <Text style={[styles.overallValue, { color: overallColor(data.overallScore) }]}>
                {data.overallScore}
              </Text>
              <Text style={styles.overallMax}>/100</Text>
              <Text style={styles.computedAt}>
                Computed {new Date(data.computedAt).toLocaleDateString()}
              </Text>
            </View>

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
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  overallLabel: { fontSize: 13, color: '#888' },
  overallValue: { fontSize: 64, fontWeight: '700' },
  overallMax: { fontSize: 14, color: '#888', marginTop: -8 },
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
});
