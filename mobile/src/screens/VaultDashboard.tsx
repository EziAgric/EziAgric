import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
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
 * SkeletonBox - Loading placeholder component for vault dashboard
 * Exposes accessibilityLabel and accessibilityRole for screen readers
 */
function SkeletonBox({ style }: { style?: object }) {
  return (
    <View
      style={[styles.skeleton, style]}
      accessibilityLabel="Loading content"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: 50 }}
    />
  );
}

/**
 * LoadingSkeleton - Shows loading state for the entire dashboard
 * Exposes accessibilityLabel for screen readers
 */
function LoadingSkeleton() {
  return (
    <View style={styles.loadingContainer}>
      <SkeletonBox style={styles.skeletonTitle} />
      <SkeletonBox style={styles.skeletonCard} />
      <SkeletonBox style={styles.skeletonCard} />
      <SkeletonBox style={styles.skeletonRow} />
      <SkeletonBox style={styles.skeletonRow} />
    </View>
  );
}

/**
 * TradeRow - Individual trade row component
 * Gets a stable testID per trade for testing purposes
 */
function TradeRow({ trade, onPress }: { trade: Trade; onPress: (trade: Trade) => void }) {
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
        return 'Pending';
      case 'funded':
        return 'Funded';
      case 'completed':
        return 'Completed';
      case 'disputed':
        return 'Disputed';
      default:
        return status;
    }
  };

  return (
    <TouchableOpacity
      testID={`trade-row-${trade.id}`}
      style={styles.tradeRow}
      onPress={() => onPress(trade)}
      accessibilityLabel={`Trade: ${trade.productName}, ${trade.amount} NGN, ${getStatusLabel(trade.status)}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to view trade details"
    >
      <View style={styles.tradeInfo}>
        <Text style={styles.tradeProduct}>{trade.productName}</Text>
        <Text style={styles.tradeCounterparty}>{trade.counterparty}</Text>
        <Text style={styles.tradeDate}>{trade.date}</Text>
      </View>
      <View style={styles.tradeRight}>
        <Text style={styles.tradeAmount}>{trade.amount.toLocaleString()} NGN</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trade.status) }]}>
          <Text style={styles.statusText}>{getStatusLabel(trade.status)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/**
 * VaultDashboard displays the user's vault with trades and balance
 */
export default function VaultDashboard() {
  const insets = useSafeAreaInsets();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVaultData = useCallback(async () => {
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
      setBalance(93000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVaultData();
  }, [fetchVaultData]);

  const handleTradePress = useCallback((trade: Trade) => {
    // Navigate to trade detail - implementation depends on navigation setup
    console.log('Navigate to trade:', trade.id);
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Vault Dashboard</Text>
        </View>
        <LoadingSkeleton />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity testID="retry-button" style={styles.retryButton} onPress={fetchVaultData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeTrades = trades.filter(t => t.status !== 'completed').length;
  const completedTrades = trades.filter(t => t.status === 'completed').length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Vault Dashboard</Text>
      </View>

      <FlatList
        data={trades}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            {/* Balance Card */}
            <View 
              style={styles.balanceCard}
              accessibilityLabel={`Vault balance: ${balance.toLocaleString()} Naira`}
              accessibilityRole="text"
            >
              <Text style={styles.balanceLabel}>Total Balance</Text>
              <Text style={styles.balanceValue}>{balance.toLocaleString()} NGN</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{activeTrades}</Text>
                  <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{completedTrades}</Text>
                  <Text style={styles.statLabel}>Completed</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Recent Trades</Text>
          </>
        }
        renderItem={({ item }) => (
          <TradeRow trade={item} onPress={handleTradePress} />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No trades yet</Text>
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
  list: {
    padding: 16,
    paddingTop: 0,
  },
  balanceCard: {
    backgroundColor: '#2d6a2d',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#bbf7d0',
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statItem: {
    marginRight: 32,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#bbf7d0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 12,
  },
  tradeRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tradeInfo: {
    flex: 1,
  },
  tradeProduct: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f3d1f',
  },
  tradeCounterparty: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  tradeDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  tradeRight: {
    alignItems: 'flex-end',
  },
  tradeAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f3d1f',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  loadingContainer: {
    padding: 16,
  },
  skeleton: {
    backgroundColor: '#e5e7eb',
    borderRadius: 8,
    marginBottom: 12,
  },
  skeletonTitle: {
    height: 24,
    width: '60%',
    marginBottom: 20,
  },
  skeletonCard: {
    height: 120,
    marginBottom: 12,
  },
  skeletonRow: {
    height: 72,
    marginBottom: 12,
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