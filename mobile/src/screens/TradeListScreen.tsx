import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Trade {
  id: string;
  productName: string;
  amount: number;
  status: 'pending' | 'funded' | 'completed' | 'disputed';
  date: string;
  counterparty: string;
}

/**
 * TradeListScreen - List all trades for the user
 * Localized with i18n for high-traffic screen requirement
 */
export default function TradeListScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const filters = [
    { key: 'all', label: t('trades.filterAll') },
    { key: 'pending', label: t('trades.filterPending') },
    { key: 'funded', label: t('trades.filterFunded') },
    { key: 'completed', label: t('trades.filterCompleted') },
    { key: 'disputed', label: t('trades.filterDisputed') },
  ];

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulated API call - replace with actual API
      const mockTrades: Trade[] = [
        {
          id: 'trade-001',
          productName: 'Maize (50kg)',
          amount: 25000,
          status: 'funded',
          date: '2024-10-15',
          counterparty: 'Abuja Market Coop',
        },
        {
          id: 'trade-002',
          productName: 'Rice (25kg)',
          amount: 15000,
          status: 'pending',
          date: '2024-10-18',
          counterparty: 'Kano Traders Ltd',
        },
        {
          id: 'trade-003',
          productName: 'Soybeans (100kg)',
          amount: 45000,
          status: 'completed',
          date: '2024-10-10',
          counterparty: 'Lagos Exporters',
        },
        {
          id: 'trade-004',
          productName: 'Cassava Flour (20kg)',
          amount: 8000,
          status: 'disputed',
          date: '2024-10-12',
          counterparty: 'Port Harcourt Stores',
        },
      ];
      setTrades(mockTrades);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const filteredTrades = trades.filter((trade) => {
    if (filter === 'all') return true;
    return trade.status === filter;
  });

  const getStatusColor = (status: Trade['status']) => {
    switch (status) {
      case 'pending':
        return '#d97706';
      case 'funded':
        return '#2563eb';
      case 'completed':
        return '#2d6a2d';
      case 'disputed':
        return '#dc2626';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: Trade['status']) => {
    switch (status) {
      case 'pending':
        return t('trades.statusPending');
      case 'funded':
        return t('trades.statusFunded');
      case 'completed':
        return t('trades.statusCompleted');
      case 'disputed':
        return t('trades.statusDisputed');
      default:
        return status;
    }
  };

  const renderItem = ({ item }: { item: Trade }) => (
    <TouchableOpacity
      testID={`trade-${item.id}`}
      style={styles.tradeCard}
      accessibilityLabel={`Trade: ${item.productName}, ${item.amount} Naira, ${getStatusLabel(item.status)}`}
      accessibilityRole="button"
    >
      <View style={styles.tradeHeader}>
        <Text style={styles.tradeProduct}>{item.productName}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>
      <Text style={styles.tradeAmount}>{item.amount.toLocaleString()} NGN</Text>
      <View style={styles.tradeFooter}>
        <Text style={styles.tradeCounterparty}>{item.counterparty}</Text>
        <Text style={styles.tradeDate}>{item.date}</Text>
      </View>
    </TouchableOpacity>
  );

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
        <TouchableOpacity testID="retry-button" style={styles.retryButton} onPress={fetchTrades}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('trades.title')}</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={filters}
          keyExtractor={(item) => item.key}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`filter-${item.key}`}
              style={[
                styles.filterTab,
                filter === item.key && styles.filterTabActive,
              ]}
              onPress={() => setFilter(item.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item.key && styles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Trades List */}
      <FlatList
        data={filteredTrades}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('trades.noTrades')}</Text>
          </View>
        }
      />
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
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterTabActive: {
    backgroundColor: '#2d6a2d',
    borderColor: '#2d6a2d',
  },
  filterText: {
    fontSize: 14,
    color: '#6b7280',
  },
  filterTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  tradeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tradeProduct: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f3d1f',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  tradeAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 8,
  },
  tradeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tradeCounterparty: {
    fontSize: 13,
    color: '#6b7280',
  },
  tradeDate: {
    fontSize: 13,
    color: '#9ca3af',
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
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
});