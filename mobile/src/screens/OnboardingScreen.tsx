import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

export const ONBOARDING_COMPLETED_KEY = '@eziagric/onboarding_completed';

const { width } = Dimensions.get('window');

interface OnboardingStep {
  key: string;
  illustration: string;
  heading: string;
  body: string;
}

const STEPS: OnboardingStep[] = [
  {
    key: 'welcome',
    illustration: '🌾',
    heading: 'What is EziAgric',
    body: 'EziAgric connects farmers and buyers directly. Trade produce, track prices, and grow your business with confidence.',
  },
  {
    key: 'wallet',
    illustration: '👛',
    heading: 'Connect your wallet',
    body: 'Link a Stellar wallet to hold funds and settle trades securely. Your keys stay in your control at all times.',
  },
  {
    key: 'trade',
    illustration: '🤝',
    heading: 'Make your first trade',
    body: 'Browse the marketplace, place an order, and complete your first trade in just a few taps.',
  },
];

export default function OnboardingScreen() {
  const navigation = useNavigation<any>();
  const listRef = useRef<FlatList<OnboardingStep>>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === STEPS.length - 1;

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
    } catch (e) {
      // Non-fatal: still let the user proceed.
    }
    navigation.reset({ index: 0, routes: [{ name: 'Marketplace' }] });
  };

  const goNext = () => {
    if (isLast) {
      completeOnboarding();
      return;
    }
    const next = index + 1;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    if (page !== index) setIndex(page);
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={STEPS}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Text style={styles.illustration}>{item.illustration}</Text>
            <Text style={styles.heading}>{item.heading}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {STEPS.map((step, i) => (
          <View
            key={step.key}
            style={[styles.dot, i === index && styles.dotActive]}
          />
        ))}
      </View>

      <View style={styles.actions}>
        {!isLast && (
          <TouchableOpacity onPress={completeOnboarding} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={goNext} style={styles.primary}>
          <Text style={styles.primaryText}>{isLast ? 'Get started' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  illustration: { fontSize: 96, marginBottom: 32 },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#555555',
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#d0d0d0',
    marginHorizontal: 4,
  },
  dotActive: { backgroundColor: '#2e7d32' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  skip: { paddingVertical: 12, paddingHorizontal: 16 },
  skipText: { fontSize: 16, color: '#888888' },
  primary: {
    backgroundColor: '#2e7d32',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
