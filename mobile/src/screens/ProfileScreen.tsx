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

type Props = StackScreenProps<RootStackParamList, 'Profile'>;

interface ReviewSummary {
  id: string;
  rating: number;
  comment: string;
  reviewerAddress: string;
  createdAt: string;
}

interface ProfileData {
  address: string;
  displayName?: string;
  trustScore: number;
  totalTrades: number;
  completedTrades: number;
  disputeRate: number;
  recentReviews: ReviewSummary[];
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={starStyles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text key={n} style={[starStyles.star, n <= rating && starStyles.starFilled]}>
          ★
        </Text>
      ))}
    </View>
  );
}

const starStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 16, color: '#d0d0d0' },
  starFilled: { color: '#F59E0B' },
});

export default function ProfileScreen({ route, navigation }: Props) {
  const { address, isSelf } = route.params;
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get(`/users/${encodeURIComponent(address)}/profile`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .then((r) => setProfile(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [address, token]);

  const scoreColor = (s: number) => {
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
        <Text style={styles.headerTitle}>{isSelf ? 'My Profile' : 'Counterparty'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator color="#2d6a2d" size="large" />}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {profile && (
          <>
            {/* Identity card */}
            <View style={styles.identityCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(profile.displayName ?? profile.address).slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.displayName}>{profile.displayName ?? 'Anonymous'}</Text>
              <Text style={styles.addressText}>{profile.address.slice(0, 20)}…</Text>
            </View>

            {/* Trust score */}
            <TouchableOpacity
              style={styles.scoreCard}
              onPress={() => navigation.navigate('TrustScore', { address })}
              activeOpacity={0.85}
            >
              <Text style={styles.scoreCardLabel}>Trust Score</Text>
              <Text style={[styles.scoreValue, { color: scoreColor(profile.trustScore) }]}>
                {profile.trustScore}
              </Text>
              <Text style={styles.scoreMax}>/100</Text>
              <Text style={styles.scoreHint}>Tap for breakdown →</Text>
            </TouchableOpacity>

            {/* Stats */}
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.totalTrades}</Text>
                <Text style={styles.statLabel}>Trades</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{profile.completedTrades}</Text>
                <Text style={styles.statLabel}>Completed</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, profile.disputeRate > 10 && styles.statValueWarn]}>
                  {profile.disputeRate.toFixed(1)}%
                </Text>
                <Text style={styles.statLabel}>Dispute rate</Text>
              </View>
            </View>

            {/* Reviews */}
            <View style={styles.reviewsCard}>
              <Text style={styles.sectionTitle}>Recent Reviews ({profile.recentReviews.length})</Text>
              {profile.recentReviews.length === 0 && (
                <Text style={styles.noReviews}>No reviews yet.</Text>
              )}
              {profile.recentReviews.map((rev) => (
                <View key={rev.id} style={styles.reviewItem}>
                  <View style={styles.reviewTop}>
                    <StarRating rating={rev.rating} />
                    <Text style={styles.reviewDate}>
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {rev.comment ? (
                    <Text style={styles.reviewComment}>{rev.comment}</Text>
                  ) : null}
                  <Text style={styles.reviewBy}>by {rev.reviewerAddress.slice(0, 14)}…</Text>
                </View>
              ))}
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
  identityCard: {
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
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2d6a2d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  displayName: { fontSize: 20, fontWeight: '700', color: '#1a3a1a' },
  addressText: { fontSize: 12, color: '#888', fontFamily: 'monospace' },
  scoreCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  scoreCardLabel: { fontSize: 13, color: '#888' },
  scoreValue: { fontSize: 52, fontWeight: '700' },
  scoreMax: { fontSize: 14, color: '#888', marginTop: -8 },
  scoreHint: { fontSize: 12, color: '#2563EB', marginTop: 4 },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1a3a1a' },
  statValueWarn: { color: '#DC2626' },
  statLabel: { fontSize: 11, color: '#888' },
  statDivider: { width: 1, height: 40, backgroundColor: '#e0e8e0' },
  reviewsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a3a1a' },
  noReviews: { fontSize: 13, color: '#888' },
  reviewItem: { gap: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f4f0' },
  reviewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewDate: { fontSize: 11, color: '#aaa' },
  reviewComment: { fontSize: 13, color: '#333', lineHeight: 18 },
  reviewBy: { fontSize: 11, color: '#aaa', fontFamily: 'monospace' },
  errorBanner: { backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8 },
  errorText: { color: '#DC2626', fontSize: 13 },
});
