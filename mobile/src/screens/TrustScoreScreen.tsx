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

interface TrustScoreData {
  score: number;
  breakdown: {
    completedTrades: number;
    successfulDisputes: number;
    responseTime: number;
    ratingQuality: number;
  };
  history: Array<{
    date: string;
    score: number;
    change: number;
  }>;
}

/**
 * TrustScoreScreen fetches and displays the user's trust score.
 * Shows score breakdown and historical trend.
 */
export default function TrustScoreScreen() {
  const insets = useSafeAreaInsets();
  const [trustData, setTrustData] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrustScore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulated API call - replace with actual API
      const mockData: TrustScoreData = {
        score: 85,
        breakdown: {
          completedTrades: 45,
          successfulDisputes: 3,
          responseTime: 92,
          ratingQuality: 88,
        },
        history: [
          { date: '2024-10', score: 82, change: 0 },
          { date: '2024-09', score: 80, change: -2 },
          { date: '2024-08', score: 78, change: -2 },
          { date: '2024-07', score: 75, change: -3 },
          { date: '2024-06', score: 70, change: -5 },
        ],
      };
      setTrustData(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trust score');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrustScore();
  }, [fetchTrustScore]);

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#2d6a2d';
    if (score >= 60) return '#d97706';
    return '#dc2626';
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2d6a2d" />
        <Text style={styles.loadingText}>Calculating trust score...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity testID="retry-button" style={styles.retryButton} onPress={fetchTrustScore}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!trustData) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Trust Score</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Main Score Card */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>{getScoreLabel(trustData.score)}</Text>
          <Text style={[styles.scoreValue, { color: getScoreColor(trustData.score) }]}>
            {trustData.score}
          </Text>
          <Text style={styles.scoreMax}>/ 100</Text>
        </View>

        {/* Breakdown Section */}
        <View style={styles.breakdownCard}>
          <Text style={styles.sectionTitle}>Score Breakdown</Text>
          
          <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownLabel}>Completed Trades</Text>
              <Text style={styles.breakdownValue}>{trustData.breakdown.completedTrades}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(trustData.breakdown.completedTrades, 100)}%` }]} />
            </View>
          </View>

          <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownLabel}>Successful Disputes</Text>
              <Text style={styles.breakdownValue}>{trustData.breakdown.successfulDisputes}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(trustData.breakdown.successfulDisputes * 20, 100)}%` }]} />
            </View>
          </View>

          <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownLabel}>Response Time</Text>
              <Text style={styles.breakdownValue}>{trustData.breakdown.responseTime}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${trustData.breakdown.responseTime}%` }]} />
            </View>
          </View>

          <View style={styles.breakdownItem}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownLabel}>Rating Quality</Text>
              <Text style={styles.breakdownValue}>{trustData.breakdown.ratingQuality}%</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${trustData.breakdown.ratingQuality}%` }]} />
            </View>
          </View>
        </View>

        {/* History Section */}
        <View style={styles.historyCard}>
          <Text style={styles.sectionTitle}>Score History</Text>
          {trustData.history.map((item, index) => (
            <View key={index} style={styles.historyItem}>
              <Text style={styles.historyDate}>{item.date}</Text>
              <Text style={[styles.historyScore, { color: getScoreColor(item.score) }]}>
                {item.score}
              </Text>
              <Text style={[
                styles.historyChange,
                { color: item.change >= 0 ? '#2d6a2d' : '#dc2626' }
              ]}>
                {item.change >= 0 ? '+' : ''}{item.change}
              </Text>
            </View>
          ))}
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
  scoreCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: '700',
  },
  scoreMax: {
    fontSize: 18,
    color: '#9ca3af',
    marginTop: -8,
  },
  breakdownCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 16,
  },
  breakdownItem: {
    marginBottom: 16,
  },
  breakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#374151',
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f3d1f',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2d6a2d',
    borderRadius: 4,
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  historyDate: {
    fontSize: 14,
    color: '#6b7280',
    flex: 1,
  },
  historyScore: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  historyChange: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
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