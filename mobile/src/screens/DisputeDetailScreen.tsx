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

interface Evidence {
  id: string;
  type: 'video' | 'image' | 'text';
  submittedBy: 'buyer' | 'seller' | 'driver';
  submittedAt: string;
  cid?: string;
  description?: string;
}

interface DisputeDetails {
  id: string;
  tradeId: string;
  productName: string;
  amount: number;
  status: 'open' | 'under_review' | 'resolved';
  reason: string;
  raisedBy: string;
  raisedAt: string;
  evidence: Evidence[];
  resolution?: {
    outcome: 'buyer_wins' | 'seller_wins' | 'split';
    decidedAt: string;
    notes?: string;
  };
}

/**
 * DisputeDetailScreen shows detailed information about a trade dispute
 */
export default function DisputeDetailScreen() {
  const insets = useSafeAreaInsets();
  const [dispute, setDispute] = useState<DisputeDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDispute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulated API call - replace with actual API
      const mockDispute: DisputeDetails = {
        id: 'dispute-001',
        tradeId: 'trade-004',
        productName: 'Cassava Flour (20kg)',
        amount: 8000,
        status: 'under_review',
        reason: 'Goods received were of inferior quality and damaged in transit',
        raisedBy: 'Buyer',
        raisedAt: '2024-10-12T14:30:00Z',
        evidence: [
          {
            id: 'ev-001',
            type: 'video',
            submittedBy: 'buyer',
            submittedAt: '2024-10-12T14:35:00Z',
            cid: 'QmVideo123',
            description: 'Video showing damaged goods upon delivery',
          },
          {
            id: 'ev-002',
            type: 'text',
            submittedBy: 'driver',
            submittedAt: '2024-10-12T10:00:00Z',
            description: 'Confirmed that goods were in good condition at pickup',
          },
        ],
      };
      setDispute(mockDispute);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dispute details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDispute();
  }, [fetchDispute]);

  const getStatusColor = (status: DisputeDetails['status']) => {
    switch (status) {
      case 'open':
        return '#d97706';
      case 'under_review':
        return '#2563eb';
      case 'resolved':
        return '#2d6a2d';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: DisputeDetails['status']) => {
    switch (status) {
      case 'open':
        return 'Open';
      case 'under_review':
        return 'Under Review';
      case 'resolved':
        return 'Resolved';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2d6a2d" />
        <Text style={styles.loadingText}>Loading dispute details...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity testID="retry-button" style={styles.retryButton} onPress={fetchDispute}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!dispute) {
    return null;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Dispute Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: getStatusColor(dispute.status) }]}>
          <Text style={styles.statusBannerText}>
            {getStatusLabel(dispute.status)}
          </Text>
        </View>

        {/* Trade Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Trade Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Trade ID</Text>
            <Text style={styles.infoValue}>{dispute.tradeId}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Product</Text>
            <Text style={styles.infoValue}>{dispute.productName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Amount</Text>
            <Text style={styles.infoValue}>{dispute.amount.toLocaleString()} NGN</Text>
          </View>
        </View>

        {/* Dispute Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dispute Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Raised By</Text>
            <Text style={styles.infoValue}>{dispute.raisedBy}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Raised On</Text>
            <Text style={styles.infoValue}>{formatDate(dispute.raisedAt)}</Text>
          </View>
          <View style={styles.reasonContainer}>
            <Text style={styles.infoLabel}>Reason</Text>
            <Text style={styles.reasonText}>{dispute.reason}</Text>
          </View>
        </View>

        {/* Evidence Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Evidence ({dispute.evidence.length})</Text>
          {dispute.evidence.map((item) => (
            <View key={item.id} style={styles.evidenceItem}>
              <View style={styles.evidenceHeader}>
                <Text style={styles.evidenceType}>{item.type.toUpperCase()}</Text>
                <Text style={styles.evidenceSubmittedBy}>
                  Submitted by {item.submittedBy}
                </Text>
              </View>
              {item.description && (
                <Text style={styles.evidenceDescription}>{item.description}</Text>
              )}
              {item.cid && (
                <Text style={styles.evidenceCid}>CID: {item.cid}</Text>
              )}
              <Text style={styles.evidenceDate}>{formatDate(item.submittedAt)}</Text>
            </View>
          ))}
        </View>

        {/* Resolution (if resolved) */}
        {dispute.resolution && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Resolution</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Outcome</Text>
              <Text style={[
                styles.infoValue,
                { color: dispute.resolution.outcome === 'buyer_wins' ? '#2d6a2d' : '#d97706' }
              ]}>
                {dispute.resolution.outcome === 'buyer_wins' ? 'Buyer Wins' :
                 dispute.resolution.outcome === 'seller_wins' ? 'Seller Wins' : 'Split'}
              </Text>
            </View>
            {dispute.resolution.notes && (
              <View style={styles.reasonContainer}>
                <Text style={styles.infoLabel}>Notes</Text>
                <Text style={styles.reasonText}>{dispute.resolution.notes}</Text>
              </View>
            )}
          </View>
        )}
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
  statusBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  statusBannerText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f3d1f',
  },
  reasonContainer: {
    paddingTop: 12,
  },
  reasonText: {
    fontSize: 14,
    color: '#374151',
    marginTop: 6,
    lineHeight: 20,
  },
  evidenceItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  evidenceType: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2d6a2d',
  },
  evidenceSubmittedBy: {
    fontSize: 12,
    color: '#6b7280',
  },
  evidenceDescription: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 6,
  },
  evidenceCid: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#6b7280',
    marginBottom: 4,
  },
  evidenceDate: {
    fontSize: 11,
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
});