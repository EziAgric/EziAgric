import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { StackScreenProps } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../types/navigation';
import { useAuthStore } from '../stores/authStore';
import {
  adminApi,
  FeatureFlag,
  FeatureFlagListResult,
} from '../api/admin';
import { viewForError } from '../api/errorInterceptor';
import { AdminErrorBanner } from '../components/AdminErrorBanner';
import { buildSupportMailto } from '../constants/support';

type Props = StackScreenProps<RootStackParamList, 'AdminFeatures'>;

/**
 * Mobile screen for GET/PATCH /api/admin/features.
 *
 * Lists all backend-managed feature flags as rows with a Switch that
 * PATCHes the flag on tap. Errors during the initial GET surface as a
 * top-level banner with retry; per-row PATCH errors surface as a small
 * inline error text under the row plus a banner so the user can retry
 * without losing the rest of the list state.
 */
export default function AdminFeaturesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { role, clearAuth } = useAuthStore();
  const isAdmin = role === 'admin';

  const [flags, setFlags] = useState<Record<string, FeatureFlag> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [loadErrorView, setLoadErrorView] = useState<
    ReturnType<typeof viewForError> | null
  >(null);
  const [rowErrorView, setRowErrorView] = useState<
    ReturnType<typeof viewForError> | null
  >(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    setBusy(true);
    setLoadErrorView(null);
    setRowErrorView(null);
    try {
      const data: FeatureFlagListResult = await adminApi.listFeatureFlags();
      setFlags(data.flags ?? {});
    } catch (error: unknown) {
      setLoadErrorView(viewForError(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadFlags();
    }
  }, [isAdmin, loadFlags]);

  const toggleFlag = useCallback(
    async (name: string, next: boolean) => {
      if (!flags) return;
      setPendingName(name);
      setRowErrorView(null);
      // Optimistic local update so the Switch stays responsive.
      const previous = flags[name];
      setFlags({ ...flags, [name]: { ...previous, enabled: next } });
      try {
        await adminApi.setFeatureFlag(name, { enabled: next });
      } catch (error: unknown) {
        // Roll back on failure so the UI matches the backend state.
        setFlags((current) =>
          current ? { ...current, [name]: previous } : current,
        );
        setRowErrorView(viewForError(error));
      } finally {
        setPendingName(null);
      }
    },
    [flags],
  );

  const handleSignOut = useCallback(async () => {
    await clearAuth();
    navigation.goBack();
  }, [clearAuth, navigation]);

  const openMailToSupport = useCallback(
    (view: ReturnType<typeof viewForError> | null) => {
      void Linking.openURL(buildSupportMailto(view, 'features'));
    },
    [],
  );

  if (!isAdmin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.title}>Admin access required</Text>
        <Text style={styles.body}>
          Only administrators can toggle feature flags.
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

  const visibleErrorView = loadErrorView ?? rowErrorView;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin feature flags</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {visibleErrorView ? (
          <AdminErrorBanner
            view={visibleErrorView}
            onRetry={() => {
              if (loadErrorView) void loadFlags();
            }}
            onSignOut={handleSignOut}
            onGoBack={() => navigation.goBack()}
            onContactSupport={() => openMailToSupport(visibleErrorView)}
          />
        ) : null}

        {busy && !flags ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#2d6a2d" />
            <Text style={styles.loadingText}>Loading flags…</Text>
          </View>
        ) : null}

        {flags ? (
          Object.keys(flags).length === 0 ? (
            <Text style={styles.empty}>No feature flags defined.</Text>
          ) : (
            Object.entries(flags).map(([name, flag]) => (
              <View
                key={name}
                style={styles.flagCard}
                testID={`admin-features-row-${name}`}
              >
                <View style={styles.flagRow}>
                  <View style={styles.flagInfo}>
                    <Text style={styles.flagName}>{name}</Text>
                    {typeof flag.rolloutPercentage === 'number' ? (
                      <Text style={styles.flagMeta}>
                        Rollout: {flag.rolloutPercentage}%
                      </Text>
                    ) : null}
                  </View>
                  {pendingName === name ? (
                    <ActivityIndicator color="#2d6a2d" />
                  ) : (
                    <Switch
                      testID={`admin-features-toggle-${name}`}
                      value={flag.enabled}
                      onValueChange={(next) => void toggleFlag(name, next)}
                      trackColor={{ false: '#cbd5cb', true: '#2d6a2d' }}
                      thumbColor="#fff"
                    />
                  )}
                </View>
              </View>
            ))
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7f4', paddingHorizontal: 16 },
  scroll: { paddingBottom: 32, gap: 8 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1f3d1f' },
  body: { fontSize: 14, color: '#4f5d4f', marginTop: 8, lineHeight: 20 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  loadingText: { color: '#4f5d4f', fontSize: 14 },
  empty: {
    textAlign: 'center',
    color: '#4f5d4f',
    fontSize: 14,
    paddingVertical: 32,
  },
  flagCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  flagInfo: { flex: 1 },
  flagName: { fontSize: 15, fontWeight: '700', color: '#1f3d1f' },
  flagMeta: { fontSize: 12, color: '#4f5d4f', marginTop: 2 },
  backButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: { color: '#fff', fontWeight: '600' },
});
