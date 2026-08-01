import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';
import { adminApi, BatchTradeUpdate, BatchTradeUpdateResult } from '../api/admin';
import { TradeStatus, TRADE_STATUSES } from '../constants/admin';
import { viewForError } from '../api/errorInterceptor';
import { AdminErrorBanner } from '../components/AdminErrorBanner';
import { AdminErrorView } from '../api/errors';
import { buildSupportMailto } from '../constants/support';

type Props = StackScreenProps<RootStackParamList, 'AdminTradesBatch'>;

/**
 * Mobile screen for POST /api/admin/trades/batch/status.
 *
 * Accepts a newline-separated list of trade IDs and a target status,
 * submits a single batch update, and renders the per-row
 * `succeeded`/`failed` results returned by the backend.
 *
 * Error model:
 *   - `loadErrorView` is reserved for future screen-level fetch errors
 *     (today this screen doesn't fetch on mount, but the slot keeps
 *     the pattern consistent across admin screens).
 *   - `actionErrorView` is set when the submit fails; the user's
 *     textarea/selection survive the error so they can retry.
 */
export default function AdminTradesBatchScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { role, clearAuth } = useAuthStore();
  const isAdmin = role === 'admin';

  const [tradeIdsText, setTradeIdsText] = useState('');
  const [status, setStatus] = useState<TradeStatus>('CANCELLED');
  const [busy, setBusy] = useState(false);
  const [loadErrorView] = useState<AdminErrorView | null>(null);
  const [actionErrorView, setActionErrorView] = useState<
    ReturnType<typeof viewForError> | null
  >(null);
  const [result, setResult] = useState<BatchTradeUpdateResult | null>(null);

  useEffect(() => {
    // No initial fetch today; this slot is intentionally empty so a
    // future "preview invalid transitions" call can hook in here without
    // refactoring the screen.
    return undefined;
  }, []);

  const runBatch = useCallback(async () => {
    const ids = tradeIdsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      // Tiny client-side validation; this never reaches the backend so
      // it short-circuits without needing a backend error code.
      return;
    }
    const updates: BatchTradeUpdate[] = ids.map((tradeId) => ({
      tradeId,
      status,
    }));

    setBusy(true);
    setActionErrorView(null);
    setResult(null);
    try {
      const data = await adminApi.updateTradeStatusesBatch(updates);
      setResult(data);
    } catch (error: unknown) {
      setActionErrorView(viewForError(error));
    } finally {
      setBusy(false);
    }
  }, [tradeIdsText, status]);

  const handleSignOut = useCallback(async () => {
    await clearAuth();
    navigation.goBack();
  }, [clearAuth, navigation]);

  const openMailToSupport = useCallback(
    (view: ReturnType<typeof viewForError> | null) => {
      void Linking.openURL(buildSupportMailto(view, 'trades batch'));
    },
    [],
  );

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Admin access required</Text>
        <Text style={styles.body}>
          Only administrators can run trade batch updates.
        </Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const visibleErrorView = loadErrorView ?? actionErrorView;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin trades batch</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {visibleErrorView ? (
          <AdminErrorBanner
            view={visibleErrorView}
            onRetry={() => {
              if (actionErrorView) void runBatch();
            }}
            onSignOut={handleSignOut}
            onGoBack={() => navigation.goBack()}
            onContactSupport={() => openMailToSupport(visibleErrorView)}
          />
        ) : null}

        <Text style={styles.label}>Trade IDs (one per line)</Text>
        <TextInput
          testID="admin-trades-batch-input"
          style={styles.textArea}
          multiline
          placeholder="trade-001\ntrade-002\n..."
          placeholderTextColor="#7e977e"
          value={tradeIdsText}
          onChangeText={setTradeIdsText}
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Target status</Text>
        <View style={styles.statusRow}>
          {TRADE_STATUSES.map((s) => (
            <TouchableOpacity
              key={s}
              testID={`admin-trades-batch-status-${s}`}
              onPress={() => setStatus(s)}
              disabled={busy}
              style={[
                styles.statusButton,
                s === status && styles.statusButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.statusButtonText,
                  s === status && styles.statusButtonTextActive,
                ]}
              >
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          testID="admin-trades-batch-run"
          onPress={() => void runBatch()}
          disabled={busy || tradeIdsText.trim().length === 0}
          style={[
            styles.runButton,
            (busy || tradeIdsText.trim().length === 0) &&
              styles.runButtonDisabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.runButtonText}>Run batch update</Text>
          )}
        </TouchableOpacity>

        {result ? (
          <View style={styles.result} testID="admin-trades-batch-result">
            <Text style={styles.resultHeader}>
              Succeeded: {result.succeeded.length} · Failed:{' '}
              {result.failed.length}
            </Text>
            {result.succeeded.length > 0 ? (
              <Text style={styles.resultOk} testID="admin-trades-batch-succeeded">
                ✓ {result.succeeded.join(', ')}
              </Text>
            ) : null}
            {result.failed.length > 0 ? (
              <Text style={styles.resultErr} testID="admin-trades-batch-failed">
                ✗ {result.failed
                  .map((f) => `${f.tradeId}: ${f.reason}`)
                  .join('\n')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f4', paddingHorizontal: 16 },
  scroll: { paddingBottom: 32, gap: 12 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1f3d1f' },
  body: { fontSize: 14, color: '#4f5d4f', marginTop: 8, lineHeight: 20 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f3d1f',
    marginTop: 8,
  },
  textArea: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    minHeight: 120,
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#1f3d1f',
    textAlignVertical: 'top',
  },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eaf4ea',
  },
  statusButtonActive: { backgroundColor: '#2d6a2d' },
  statusButtonText: { color: '#2d6a2d', fontWeight: '600', fontSize: 12 },
  statusButtonTextActive: { color: '#fff' },
  runButton: {
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  runButtonDisabled: { backgroundColor: '#7e977e' },
  runButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  backButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: { color: '#fff', fontWeight: '600' },
  result: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    gap: 6,
    marginTop: 8,
  },
  resultHeader: { fontSize: 14, fontWeight: '700', color: '#1f3d1f' },
  resultOk: { color: '#2d6a2d', fontSize: 13 },
  resultErr: { color: '#8a2a1f', fontSize: 13, fontFamily: 'monospace' },
});
