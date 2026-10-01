import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import {
  cooperativeApi,
  type CoopAnnouncement,
  type CoopHomeData,
  type CoopTrade,
} from '../api/cooperative';

type Props = StackScreenProps<RootStackParamList, 'CoopHome'>;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TradeRow({ trade }: { trade: CoopTrade }) {
  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  return (
    <View style={styles.tradeRow}>
      <Text style={styles.tradeId}>#{trade.tradeId.slice(0, 8)}</Text>
      <Text style={styles.tradeAmount}>{trade.amountUsdc} USDC</Text>
      <Text style={[styles.tradeBadge, trade.status === 'COMPLETED' ? styles.badgeDone : styles.badgeActive]}>
        {trade.status}
      </Text>
      <Text style={styles.tradePair}>{short(trade.buyerAddress)} → {short(trade.sellerAddress)}</Text>
    </View>
  );
}

function AnnouncementCard({ item }: { item: CoopAnnouncement }) {
  const date = new Date(item.publishedAt).toLocaleDateString();
  return (
    <View style={styles.announcementCard}>
      <View style={styles.announcementHeader}>
        <Text style={styles.announcementTitle}>{item.title}</Text>
        <Text style={styles.announcementDate}>{date}</Text>
      </View>
      <Text style={styles.announcementBody}>{item.body}</Text>
    </View>
  );
}

export default function CoopHomeScreen({ route }: Props) {
  const { coopId } = route.params;
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CoopHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await cooperativeApi.getHome(coopId);
      setData(result);
    } catch {
      setError('Could not load co-op data. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [coopId]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2d6a2d" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Unknown error'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => load()}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isManager = data.role === 'MANAGER' || data.role === 'ADMIN';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f0f4f0' }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2d6a2d" />}
    >
      <View style={styles.titleRow}>
        <Text style={styles.coopName}>{data.stats.name}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleText}>{data.role}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <StatCard label="Members" value={data.stats.memberCount} />
        <StatCard label="Active Trades" value={data.stats.activeTrades} />
        <StatCard label="Volume (USDC)" value={data.stats.totalVolumeUsdc.toLocaleString()} />
      </View>

      {isManager && (
        <View style={styles.managerBanner} accessibilityLabel="Manager actions area">
          <Text style={styles.managerBannerText}>Manager Actions</Text>
          <TouchableOpacity style={styles.managerButton} accessibilityLabel="Post announcement">
            <Text style={styles.managerButtonText}>+ Post Announcement</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>Recent Member Trades</Text>
      {data.recentTrades.length === 0 ? (
        <Text style={styles.emptyText}>No trades yet.</Text>
      ) : (
        <FlatList
          data={data.recentTrades}
          keyExtractor={(item) => item.tradeId}
          renderItem={({ item }) => <TradeRow trade={item} />}
          scrollEnabled={false}
        />
      )}

      <Text style={styles.sectionTitle}>Announcements</Text>
      {data.announcements.length === 0 ? (
        <Text style={styles.emptyText}>No announcements yet.</Text>
      ) : (
        <FlatList
          data={data.announcements}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AnnouncementCard item={item} />}
          scrollEnabled={false}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f4f0',
    padding: 24,
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2d6a2d',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  coopName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a3a1a',
    flex: 1,
  },
  roleBadge: {
    backgroundColor: '#2d6a2d22',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    color: '#2d6a2d',
    fontSize: 12,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a3a1a',
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  managerBanner: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  managerBannerText: {
    color: '#92400e',
    fontWeight: '600',
    fontSize: 14,
  },
  managerButton: {
    backgroundColor: '#d97706',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  managerButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a3a1a',
    marginBottom: 12,
    marginTop: 8,
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 20,
  },
  tradeRow: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  tradeId: {
    fontSize: 12,
    color: '#9ca3af',
    fontFamily: 'monospace',
  },
  tradeAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a3a1a',
  },
  tradeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '600',
    overflow: 'hidden',
  },
  badgeDone: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  badgeActive: {
    backgroundColor: '#dbeafe',
    color: '#1e40af',
  },
  tradePair: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  announcementCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  announcementTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a3a1a',
    flex: 1,
  },
  announcementDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  announcementBody: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
});
