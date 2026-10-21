import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import apiClient from '../api/client';
import { useAuthStore } from '../stores/authStore';

type Props = StackScreenProps<RootStackParamList, 'LeaveReview'>;

export default function LeaveReviewScreen({ route, navigation }: Props) {
  const { tradeId, counterpartyAddress } = route.params;
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(true);

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    // Check whether the user already submitted a review for this trade
    apiClient
      .get(`/trades/${tradeId}/review/mine`, { headers: authHeader })
      .then(() => setAlreadyReviewed(true))
      .catch(() => setAlreadyReviewed(false))
      .finally(() => setCheckingExisting(false));
  }, [tradeId]);

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Select a rating', 'Please choose between 1 and 5 stars.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post(
        `/trades/${tradeId}/review`,
        { rating, comment: comment.trim(), counterpartyAddress },
        { headers: authHeader }
      );
      Alert.alert('Review submitted', 'Thank you for your feedback.', [
        { text: 'OK', onPress: () => navigation.navigate('TradeDetail', { tradeId }) },
      ]);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingExisting) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#2d6a2d" size="large" />
      </View>
    );
  }

  if (alreadyReviewed) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Leave a Review</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.alreadyCard}>
          <Text style={styles.alreadyIcon}>✅</Text>
          <Text style={styles.alreadyTitle}>Already reviewed</Text>
          <Text style={styles.alreadyBody}>You have already submitted a review for this trade.</Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate('TradeDetail', { tradeId })}
          >
            <Text style={styles.backBtnText}>Back to Trade</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Leave a Review</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Rate your counterparty</Text>
          <Text style={styles.addressText}>{counterpartyAddress.slice(0, 20)}…</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.7}>
                <Text style={[styles.star, n <= rating && styles.starFilled]}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
          {rating > 0 && (
            <Text style={styles.ratingLabel}>
              {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Comment (optional)</Text>
          <TextInput
            style={styles.commentInput}
            multiline
            placeholder="Share your experience with this trader…"
            placeholderTextColor="#bbb"
            value={comment}
            onChangeText={setComment}
            textAlignVertical="top"
            maxLength={500}
          />
          <Text style={styles.charCount}>{comment.length}/500</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (submitting || rating === 0) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={submitting || rating === 0}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>⭐ Submit Review</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e0',
  },
  backText: { fontSize: 14, color: '#2d6a2d', fontWeight: '500', width: 60 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a3a1a' },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a3a1a' },
  addressText: { fontSize: 12, color: '#888', fontFamily: 'monospace' },
  starsRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  star: { fontSize: 40, color: '#d0d0d0' },
  starFilled: { color: '#F59E0B' },
  ratingLabel: { textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#D97706' },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e0e8e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 100,
  },
  charCount: { textAlign: 'right', fontSize: 11, color: '#aaa' },
  submitBtn: {
    backgroundColor: '#2d6a2d',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  alreadyCard: {
    margin: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  alreadyIcon: { fontSize: 56 },
  alreadyTitle: { fontSize: 20, fontWeight: '700', color: '#1a3a1a' },
  alreadyBody: { fontSize: 14, color: '#555', textAlign: 'center' },
  backBtn: {
    backgroundColor: '#2d6a2d',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 8,
  },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
