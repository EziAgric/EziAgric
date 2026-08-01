import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { adminApi, AdminAuditRecord } from '../api/admin';

// ─── Help text ───────────────────────────────────────────────────────────────

const HELP_TEXT =
  'Stream management allows admins to monitor and audit all administrative ' +
  'actions, including clawback events. Use the audit trail below to review ' +
  'actor addresses, affected targets, and timestamps for every recorded action.';

// ─── Sub-components ──────────────────────────────────────────────────────────

function AuditItem({ item }: { item: AdminAuditRecord }) {
  const shortActor =
    item.actorAddress.length > 12
      ? `${item.actorAddress.slice(0, 6)}…${item.actorAddress.slice(-4)}`
      : item.actorAddress;

  const formattedDate = new Date(item.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemRow}>
        <Text style={styles.actionLabel} numberOfLines={1}>
          {item.action}
        </Text>
        <Text style={styles.dateText}>{formattedDate}</Text>
      </View>
      <Text style={styles.actorText} numberOfLines={1}>
        {shortActor}
      </Text>
      {item.targetReference != null && (
        <Text style={styles.targetText} numberOfLines={1}>
          ref: {item.targetReference}
        </Text>
      )}
      {item.note != null && (
        <Text style={styles.noteText} numberOfLines={2}>
          {item.note}
        </Text>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

interface AdminStreamScreenProps {
  navigation?: unknown;
}

export default function AdminStreamScreen(_props: AdminStreamScreenProps) {
  const [records, setRecords] = useState<AdminAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    adminApi
      .getAuditTrail({ page: 1, limit: 50 })
      .then((result) => {
        if (!cancelled) {
          setRecords(result.items);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load audit trail');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  // Loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator testID="loading-indicator" size="large" color="#2d6a2d" />
        <Text style={styles.loadingText}>Loading audit trail…</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => setRetryKey((k) => k + 1)}
          accessibilityRole="button"
        >
          <Text style={styles.retryLabel}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Fixed header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin: Stream Management</Text>
      </View>

      <FlatList
        data={records}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.helpBox}>
            <Text style={styles.helpText}>{HELP_TEXT}</Text>
          </View>
        }
        renderItem={({ item }) => <AuditItem item={item} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No audit records found</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  center: { justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e0',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a3a1a' },

  helpBox: {
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  helpText: { fontSize: 13, color: '#2e5a2e', lineHeight: 19 },

  listContent: { padding: 16, gap: 0 },

  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1a3a1a', marginRight: 8 },
  dateText: { fontSize: 11, color: '#9ca3af', flexShrink: 0 },
  actorText: { fontSize: 12, color: '#374151', fontFamily: 'monospace' },
  targetText: { fontSize: 12, color: '#6b7280' },
  noteText: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },

  separator: { height: 8 },

  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { color: '#6b7280', fontSize: 14 },

  loadingText: { marginTop: 12, fontSize: 14, color: '#6b7280' },
  errorText: {
    color: '#dc2626',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  retryButton: {
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryLabel: { color: '#fff', fontWeight: '600' },
});
