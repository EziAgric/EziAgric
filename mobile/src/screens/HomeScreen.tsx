import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as notifications from '../services/notification.service';

interface TradeNotification {
  id: string;
  type: 'trade_funded' | 'trade_completed' | 'dispute_raised' | 'evidence_submitted';
  tradeId: string;
  title: string;
  body: string;
  timestamp: string;
}

interface HomeData {
  activeTrades: number;
  totalVault: number;
  pendingDisputes: number;
  recentNotifications: TradeNotification[];
}

/**
 * HomeScreen - Main dashboard showing trade overview and notifications
 * Localized with i18n
 */
export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Handle incoming push notifications - routes to appropriate screens
  const handleNotification = useCallback((notification: notifications.Notification) => {
    // Route to the appropriate screen based on notification type
    const { type, data } = notification;
    
    switch (type) {
      case 'trade_funded':
      case 'trade_completed':
        // Navigate to trade detail screen
        // navigation.navigate('TradeDetail', { tradeId: data.tradeId });
        break;
      case 'dispute_raised':
      case 'evidence_submitted':
        // Navigate to dispute detail screen
        // navigation.navigate('DisputeDetail', { disputeId: data.disputeId });
        break;
      default:
        // Unknown notification type - could handle gracefully
        break;
    }
  }, []);

  // Set up notification listener
  useEffect(() => {
    const subscription = notifications.onNotification(handleNotification);
    
    return () => {
      subscription.remove();
    };
  }, [handleNotification]);

  const fetchHomeData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulated API call - replace with actual API
      const mockData: HomeData = {
        activeTrades: 3,
        totalVault: 125000,
        pendingDisputes: 1,
        recentNotifications: [
          {
            id: 'notif-001',
            type: 'trade_funded',
            tradeId: 'trade-001',
            title: t('notification.tradeFunded'),
            body: t('notification.tradeFundedBody'),
            timestamp: '2024-10-15T10:00:00Z',
          },
          {
            id: 'notif-002',
            type: 'evidence_submitted',
            tradeId: 'trade-004',
            title: t('notification.evidenceSubmitted'),
            body: t('notification.evidenceSubmittedBody'),
            timestamp: '2024-10-12T14:35:00Z',
          },
        ],
      };
      setHomeData(mockData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2d6a2d" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity testID="retry-button" style={styles.retryButton} onPress={fetchHomeData}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!homeData) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{homeData.activeTrades}</Text>
            <Text style={styles.statLabel}>{t('home.activeTrades')}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{homeData.totalVault.toLocaleString()}</Text>
            <Text style={styles.statLabel}>{t('home.totalVault')}</Text>
          </View>
          <View style={[styles.statCard, homeData.pendingDisputes > 0 && styles.statCardAlert]}>
            <Text style={styles.statValue}>{homeData.pendingDisputes}</Text>
            <Text style={styles.statLabel}>{t('home.pendingDisputes')}</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>{t('home.quickActions')}</Text>
        <View style={styles.actionsContainer}>
          <TouchableOpacity testID="create-trade-button" style={styles.actionButton}>
            <Text style={styles.actionIcon}>📦</Text>
            <Text style={styles.actionText}>{t('home.newTrade')}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="vault-button" style={styles.actionButton}>
            <Text style={styles.actionIcon}>💰</Text>
            <Text style={styles.actionText}>{t('home.vault')}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="disputes-button" style={styles.actionButton}>
            <Text style={styles.actionIcon}>⚖️</Text>
            <Text style={styles.actionText}>{t('home.disputes')}</Text>
          </TouchableOpacity>
        </View>

        {/* Notifications */}
        <Text style={styles.sectionTitle}>{t('home.recentActivity')}</Text>
        {homeData.recentNotifications.map((notif) => (
          <View key={notif.id} style={styles.notificationCard}>
            <View style={styles.notificationHeader}>
              <Text style={styles.notificationTitle}>{notif.title}</Text>
              <Text style={styles.notificationTime}>
                {new Date(notif.timestamp).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.notificationBody}>{notif.body}</Text>
          </View>
        ))}
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
    fontSize: 24,
    fontWeight: '700',
    color: '#1f3d1f',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  scroll: {
    padding: 16,
    paddingTop: 0,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statCardAlert: {
    backgroundColor: '#fef2f2',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f3d1f',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 12,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f3d1f',
  },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f3d1f',
  },
  notificationTime: {
    fontSize: 12,
    color: '#9ca3af',
  },
  notificationBody: {
    fontSize: 13,
    color: '#6b7280',
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