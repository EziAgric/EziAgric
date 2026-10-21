import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ReviewFormData {
  rating: number;
  title: string;
  comment: string;
}

interface FormErrors {
  rating?: string;
  title?: string;
  comment?: string;
}

/**
 * LeaveReviewScreen allows users to submit a review for a completed trade
 */
export default function LeaveReviewScreen() {
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState<ReviewFormData>({
    rating: 0,
    title: '',
    comment: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (formData.rating === 0) {
      newErrors.rating = 'Please select a rating';
    }
    if (!formData.title.trim()) {
      newErrors.title = 'Please enter a review title';
    } else if (formData.title.trim().length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    }
    if (!formData.comment.trim()) {
      newErrors.comment = 'Please enter your review comment';
    } else if (formData.comment.trim().length < 10) {
      newErrors.comment = 'Comment must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    try {
      // Simulated API call - replace with actual API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Review submitted successfully
      setSubmitted(true);
    } catch (err) {
      setErrors({
        comment: err instanceof Error ? err.message : 'Failed to submit review',
      });
    } finally {
      setSubmitting(false);
    }
  }, [validateForm]);

  const setRating = useCallback((rating: number) => {
    setFormData(prev => ({ ...prev, rating }));
    if (errors.rating) {
      setErrors(prev => ({ ...prev, rating: undefined }));
    }
  }, [errors.rating]);

  const updateField = useCallback((field: keyof ReviewFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  if (submitted) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.successCard}>
          <View style={styles.successIcon}>
            <Text style={styles.successIconText}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Review Submitted!</Text>
          <Text style={styles.successText}>
            Thank you for your feedback. Your review helps build trust in our community.
          </Text>
          <TouchableOpacity 
            testID="done-button"
            style={styles.doneButton}
            onPress={() => {
              // Navigate back - implementation depends on navigation
            }}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Leave a Review</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Rating Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Rating *</Text>
            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  testID={`star-button-${star}`}
                  onPress={() => setRating(star)}
                  accessibilityLabel={`Rate ${star} stars`}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.star,
                      star <= formData.rating && styles.starFilled,
                    ]}
                  >
                    ★
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.rating && (
              <Text style={styles.errorText}>{errors.rating}</Text>
            )}
            <Text style={styles.ratingLabel}>
              {formData.rating === 1 && 'Poor'}
              {formData.rating === 2 && 'Fair'}
              {formData.rating === 3 && 'Good'}
              {formData.rating === 4 && 'Very Good'}
              {formData.rating === 5 && 'Excellent'}
            </Text>
          </View>

          {/* Title Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Review Title *</Text>
            <TextInput
              testID="review-title-input"
              style={[styles.input, errors.title && styles.inputError]}
              placeholder="Summarize your experience"
              placeholderTextColor="#9ca3af"
              value={formData.title}
              onChangeText={(value) => updateField('title', value)}
              maxLength={100}
            />
            {errors.title && (
              <Text style={styles.errorText}>{errors.title}</Text>
            )}
          </View>

          {/* Comment Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Review *</Text>
            <TextInput
              testID="review-comment-input"
              style={[
                styles.input,
                styles.textArea,
                errors.comment && styles.inputError,
              ]}
              placeholder="Share details about your experience with this trade..."
              placeholderTextColor="#9ca3af"
              value={formData.comment}
              onChangeText={(value) => updateField('comment', value)}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={500}
            />
            <Text style={styles.charCount}>{formData.comment.length}/500</Text>
            {errors.comment && (
              <Text style={styles.errorText}>{errors.comment}</Text>
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            testID="submit-review-button"
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Review</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f3d1f',
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  star: {
    fontSize: 40,
    color: '#d1d5db',
  },
  starFilled: {
    color: '#fbbf24',
  },
  ratingLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    color: '#1f3d1f',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 14,
  },
  charCount: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    marginTop: 6,
  },
  submitButton: {
    backgroundColor: '#2d6a2d',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#7e977e',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  successCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    margin: 16,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2d6a2d',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successIconText: {
    fontSize: 32,
    color: '#fff',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 8,
  },
  successText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  doneButton: {
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});