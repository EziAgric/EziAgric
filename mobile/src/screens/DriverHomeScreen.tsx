import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import type { AssignedManifest, AttestationKind, QueuedAttestation } from '../types/driver';
import { driverApi } from '../api/driver';
import { attestationQueue, cacheManifests, getCachedManifests } from '../services/attestationQueue.service';
import { useAttestationQueueItems } from '../hooks/useAttestationQueueItems';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

type Props = StackScreenProps<RootStackParamList, 'DriverHome'>;

/** Which attestation steps are done for a manifest, counting ones still queued. */
export function attestationProgress(manifest: AssignedManifest, queued: QueuedAttestation[]) {
  const mine = queued.filter((q) => q.manifestId === manifest.id);
  const has = (...kinds: AttestationKind[]) => mine.some((q) => kinds.includes(q.kind));
  return {
    pickupDone: !!manifest.pickupAttestedAt || has('PICKUP'),
    deliveryDone: !!manifest.deliveryAttestedAt || has('DELIVERY', 'LOSS'),
    pickupQueued: has('PICKUP') && !manifest.pickupAttestedAt,
    deliveryQueued: has('DELIVERY', 'LOSS') && !manifest.deliveryAttestedAt,
  };
}

export default function DriverHomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { isOffline } = useNetworkStatus();
  const { items, pending, failed } = useAttestationQueueItems();
  const [manifests, setManifests] = useState<AssignedManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const fresh = await driverApi.listAssignedManifests();
      setManifests(fresh);
      setFromCache(false);
      void cacheManifests(fresh).catch(() => undefined);
    } catch (err) {
      // Offline (or server down): fall back to the last list we saw.
      const cached = await getCachedManifests().catch(() => null);
      if (cached) {
        setManifests(cached);
        setFromCache(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load manifests');
      }
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  // Pick up server-side confirmation of queued items once they have synced.
  useEffect(() => {
    return attestationQueue.subscribe(() => {
      void attestationQueue.pending().then((p) => {
        if (p.length === 0) void load();
      });
    });
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const attest = (m: AssignedManifest, kind: AttestationKind) =>
    navigation.navigate('DriverAttestation', { manifestId: m.id, tradeId: m.tradeId, kind });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🚚 Driver</Text>
        <View style={{ width: 50 }} />
      </View>

      {isOffline && (
        <Text style={styles.offline} testID="driver-offline">
          You are offline. Attestations are saved and will upload automatically.
        </Text>
      )}
      {fromCache && <Text style={styles.stale}>Showing your last saved manifests.</Text>}

      {pending.length > 0 && (
        <View style={styles.banner} testID="queue-banner">
          <Text style={styles.bannerText}>
            {pending.length} attestation{pending.length === 1 ? '' : 's'} waiting to sync
          </Text>
          <TouchableOpacity
            disabled={isOffline}
            onPress={() => void attestationQueue.flush()}
            testID="sync-now"
          >
            <Text style={[styles.link, isOffline && styles.disabled]}>Sync now</Text>
          </TouchableOpacity>
        </View>
      )}

      {failed.map((f) => (
        <View key={f.id} style={styles.failed} testID={`failed-${f.id}`}>
          <Text style={styles.failedText}>
            {f.kind} for trade #{f.tradeId.slice(0, 8)} was rejected: {f.lastError ?? 'unknown error'}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => void attestationQueue.retry(f.id).then(() => attestationQueue.flush())} testID={`retry-${f.id}`}>
              <Text style={styles.link}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void attestationQueue.discard(f.id)} testID={`discard-${f.id}`}>
              <Text style={styles.danger}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {loading ? (
        <ActivityIndicator style={styles.center} color="#2d6a2d" testID="driver-loading" />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.danger}>{error}</Text>
          <TouchableOpacity onPress={onRefresh} testID="driver-retry">
            <Text style={styles.link}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          testID="manifest-list"
          data={manifests}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<Text style={styles.empty}>No manifests assigned to you.</Text>}
          renderItem={({ item: m }) => {
            const p = attestationProgress(m, items);
            return (
              <View style={styles.card} testID={`manifest-${m.id}`}>
                <Text style={styles.cardTitle}>
                  Trade #{m.tradeId.slice(0, 8)}
                  {m.commodity ? ` · ${m.commodity}` : ''}
                </Text>
                <Text style={styles.meta}>{m.routeDescription}</Text>
                <Text style={styles.meta}>
                  {m.vehicleRegistration} · due {new Date(m.expectedDeliveryAt).toLocaleDateString()}
                </Text>

                <View style={styles.statusRow}>
                  <Text style={p.pickupDone ? styles.done : styles.todo}>
                    {p.pickupDone ? '✓' : '○'} Pickup{p.pickupQueued ? ' (queued)' : ''}
                  </Text>
                  <Text style={p.deliveryDone ? styles.done : styles.todo}>
                    {p.deliveryDone ? '✓' : '○'} Delivery{p.deliveryQueued ? ' (queued)' : ''}
                  </Text>
                </View>

                {!p.pickupDone && (
                  <TouchableOpacity style={styles.cta} onPress={() => attest(m, 'PICKUP')} testID={`pickup-${m.id}`}>
                    <Text style={styles.ctaText}>Confirm pickup</Text>
                  </TouchableOpacity>
                )}
                {p.pickupDone && !p.deliveryDone && (
                  <View style={styles.row}>
                    <TouchableOpacity style={[styles.cta, styles.flex]} onPress={() => attest(m, 'DELIVERY')} testID={`deliver-${m.id}`}>
                      <Text style={styles.ctaText}>Attest delivery</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.ctaAlt, styles.flex]} onPress={() => attest(m, 'LOSS')} testID={`loss-${m.id}`}>
                      <Text style={styles.ctaAltText}>Report loss</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f9f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a3a1a' },
  link: { color: '#2d6a2d', fontWeight: '600' },
  disabled: { opacity: 0.4 },
  danger: { color: '#EF4444', fontWeight: '600' },
  offline: { backgroundColor: '#FEF3C7', color: '#92400E', padding: 10, marginHorizontal: 16, borderRadius: 8 },
  stale: { color: '#667', marginHorizontal: 16, marginTop: 8, fontSize: 12 },
  banner: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#E0F2FE', padding: 10, margin: 16, marginBottom: 0, borderRadius: 8 },
  bannerText: { color: '#075985', fontWeight: '600' },
  failed: { backgroundColor: '#FEE2E2', padding: 10, margin: 16, marginBottom: 0, borderRadius: 8 },
  failedText: { color: '#991B1B', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 16 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16 },
  empty: { textAlign: 'center', color: '#667', marginTop: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1a3a1a' },
  meta: { color: '#667', marginTop: 4 },
  statusRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  done: { color: '#15803D', fontWeight: '600' },
  todo: { color: '#667' },
  cta: { marginTop: 12, backgroundColor: '#2d6a2d', borderRadius: 8, padding: 12, alignItems: 'center' },
  ctaText: { color: '#fff', fontWeight: '700' },
  ctaAlt: { marginTop: 12, borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, padding: 12, alignItems: 'center' },
  ctaAltText: { color: '#EF4444', fontWeight: '700' },
});
