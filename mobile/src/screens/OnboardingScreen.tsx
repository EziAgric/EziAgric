import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ListRenderItem,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const ONBOARDING_SEEN_KEY = 'amana_onboarding_seen';

interface Slide {
  key: string;
  title: string;
  body: string;
  emoji: string;
}

const SLIDES: Slide[] = [
  {
    key: 'welcome',
    title: 'Welcome to EziAgric',
    body: 'A secure platform that protects buyers and sellers in agricultural trade across regions.',
    emoji: '🌾',
  },
  {
    key: 'escrow',
    title: 'Funds Held in Escrow',
    body: 'Your payment is locked in a Soroban smart contract — neither party can touch it until delivery is confirmed.',
    emoji: '🔒',
  },
  {
    key: 'cngn',
    title: 'Powered by cNGN',
    body: 'Trade in local currency (NGN) while the contract automatically holds value in the stable cNGN token, shielding you from volatility.',
    emoji: '💰',
  },
  {
    key: 'delivery',
    title: 'Verified Delivery',
    body: 'Upload video evidence at delivery. Disputes are resolved by a neutral mediator — risk is shared fairly based on your agreed Loss Ratio.',
    emoji: '✅',
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OnboardingScreenProps {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const markSeenAndExit = async () => {
    await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, 'true');
    onDone();
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      markSeenAndExit();
    }
  };

  const renderSlide: ListRenderItem<Slide> = ({ item }) => (
    <View style={styles.slide}>
      <Text style={styles.emoji}>{item.emoji}</Text>
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={styles.slideBody}>{item.body}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skipButton} onPress={markSeenAndExit} accessibilityLabel="Skip onboarding">
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <FlatList
        ref={listRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={false}
        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === currentIndex && styles.dotActive]} />
          ))}
        </View>

        <TouchableOpacity style={styles.nextButton} onPress={handleNext} accessibilityLabel={currentIndex === SLIDES.length - 1 ? 'Get started' : 'Next slide'}>
          <Text style={styles.nextText}>
            {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f4f0',
  },
  skipButton: {
    position: 'absolute',
    top: 56,
    right: 24,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    color: '#2d6a2d',
    fontSize: 15,
    fontWeight: '600',
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 32,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a3a1a',
    textAlign: 'center',
    marginBottom: 16,
  },
  slideBody: {
    fontSize: 16,
    color: '#4a6a4a',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    paddingBottom: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#b0c8b0',
  },
  dotActive: {
    backgroundColor: '#2d6a2d',
    width: 20,
  },
  nextButton: {
    backgroundColor: '#2d6a2d',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  nextText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
