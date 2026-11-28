import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { tradeService } from '../services/tradeService';
import type { Trade } from '../types/trade';

interface TradeConfirmScreenProps {
  route: {
    params: {
      trade: Trade;
    };
  };
  navigation: {
    goBack: () => void;
  };
}

const triggerHaptic = (action: () => Promise<void>) => {
  action().catch(() => {
    // Haptics are best-effort; ignore failures on unsupported devices.
  });
};

const TradeConfirmScreen: React.FC<TradeConfirmScreenProps> = ({
  route,
  navigation,
}) => {
  const { trade } = route.params;
  const [confirming, setConfirming] = useState(false);
  const [approving, setApproving] = useState(false);

  const handleConfirmDelivery = useCallback(async () => {
    triggerHaptic(() =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    );
    setConfirming(true);
    try {
      await tradeService.confirmDelivery(trade.id);
      triggerHaptic(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
      Alert.alert('Success', 'Delivery confirmed.');
      navigation.goBack();
    } catch (error) {
      triggerHaptic(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      );
      Alert.alert('Error', 'Failed to confirm delivery. Please try again.');
    } finally {
      setConfirming(false);
    }
  }, [trade.id, navigation]);

  const handleApproveSettlement = useCallback(async () => {
    triggerHaptic(() =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
    );
    setApproving(true);
    try {
      await tradeService.approveSettlement(trade.id);
      triggerHaptic(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      );
      Alert.alert('Success', 'Settlement approved.');
      navigation.goBack();
    } catch (error) {
      triggerHaptic(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
      );
      Alert.alert('Error', 'Failed to approve settlement. Please try again.');
    } finally {
      setApproving(false);
    }
  }, [trade.id, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Confirm Trade</Text>
        <Text style={styles.subtitle}>Trade #{trade.id}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.value}>{trade.status}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleConfirmDelivery}
          disabled={confirming}
          accessibilityRole="button"
          accessibilityLabel="Confirm delivery"
        >
          {confirming ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Confirm Delivery</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={handleApproveSettlement}
          disabled={approving}
          accessibilityRole="button"
          accessibilityLabel="Approve settlement"
        >
          {approving ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Approve Settlement</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 24,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    color: '#f8fafc',
    fontWeight: '600',
  },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
  },
  secondaryButton: {
    backgroundColor: '#475569',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default TradeConfirmScreen;
