import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  trustScore: number;
  totalTrades: number;
  successfulTrades: number;
  memberSince: string;
}

interface TrustScoreResponse {
  score: number;
  totalRatings: number;
  averageRating: number;
}

/**
 * ProfileScreen displays user profile information including trust score.
 * Fetches trust score from backend API.
 */
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [trustScore, setTrustScore] = useState<TrustScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulated API call - replace with actual API
      const mockProfile: UserProfile = {
        id: 'user-123',
        name: 'John Farmer',
        email: 'john@example.com',
        trustScore: 85,
        totalTrades: 24,
        successfulTrades: 22,
        memberSince: '2024-01-15',
      };
      const mockTrustScore: TrustScoreResponse = {
        score: 85,
        totalRatings: 18,
        averageRating: 4.2,
      };
      setProfile(mockProfile);
      setTrustScore(mockTrustScore);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2d6a2d" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity testID="retry-button" style={styles.retryButton} onPress={fetchProfile}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!profile || !trustScore) {
    return null;
  }

  const successRate = profile.totalTrades > 0 
    ? Math.round((profile.successfulTrades / profile.totalTrades) * 100) 
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {profile.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{profile.name}</Text>
          <Text style={styles.email}>{profile.email}</Text>
        </View>

        <View style={styles.trustScoreCard}>
          <Text style={styles.sectionTitle}>Trust Score</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreValue}>{trustScore.score}</Text>
            <View style={styles.starContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Text
                  key={star}
                  testID={`star-${star}`}
                  style={[
                    styles.star,
                    star <= Math.round(trustScore.averageRating) && styles.starFilled,
                  ]}
                >
                  ★
                </Text>
              ))}
            </View>
          </View>
          <Text style={styles.ratingText}>
            {trustScore.averageRating.toFixed(1)} out of 5 ({trustScore.totalRatings} ratings)
          </Text>
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.sectionTitle}>Trade Statistics</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{profile.totalTrades}</Text>
              <Text style={styles.statLabel}>Total Trades</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{profile.successfulTrades}</Text>
              <Text style={styles.statLabel}>Successful</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{successRate}%</Text>
              <Text style={styles.statLabel}>Success Rate</Text>
            </View>
          </View>
          <Text style={styles.memberSince}>
            Member since {profile.memberSince}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7f4',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f3d1f',
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2d6a2d',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#4f5d4f',
  },
  trustScoreCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#2d6a2d',
    marginRight: 12,
  },
  starContainer: {
    flexDirection: 'row',
  },
  star: {
    fontSize: 20,
    color: '#d1d5db',
    marginRight: 2,
  },
  starFilled: {
    color: '#fbbf24',
  },
  ratingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1f3d1f',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  memberSince: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});