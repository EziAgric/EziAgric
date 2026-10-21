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

type Props = StackScreenProps<RootStackParamList, 'MediatorDisputeReview'>;

type Resolution = 'FAVOR_BUYER' | 'FAVOR_SELLER' | 'SPLIT';

interface EvidenceItem {
  id: string;
  mediaType: 'video' | 'photo';
  fileName: string;
  fileHash: string;
  uploadedAt: string;
  uploadedBy: string;
}

interface DisputeDetail {
  id: string;
  tradeId: string;
  reason: string;
  status: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED';
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc: string;
  buyerLossBps: number;
  sellerLossBps: number;
  evidence: EvidenceItem[];
  createdAt: string;
  slaDeadlineAt?: string;
}

interface SplitPreview {
  buyerReceives: string;
  sellerReceives: string;
}

function computeSplit(
  amountUsdc: string,
  resolution: Resolution,
  buyerBps: number,
  sellerBps: number
): SplitPreview {
  const total = parseFloat(amountUsdc);
  if (resolution === 'FAVOR_BUYER') return { buyerReceives: total.toFixed(2), sellerReceives: '0.00' };
  if (resolution === 'FAVOR_SELLER') return { buyerReceives: '0.00', sellerReceives: total.toFixed(2) };
  // SPLIT: apply loss bps
  const buyerGets = total * (1 - buyerBps / 10000);
  const sellerGets = total * (1 - sellerBps / 10000);
  return { buyerReceives: buyerGets.toFixed(2), sellerReceives: sellerGets.toFixed(2) };
}

export default function MediatorDisputeReviewScreen({ route, navigation }: Props) {
  const { disputeId } = route.params;
  const insets = useSafeAreaInsets();
  const { token } = useAuthStore();

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Resolution>('SPLIT');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    apiClient
      .get(`/mediator/disputes/${disputeId}`, { headers: authHeader })
      .then((r) => setDispute(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load dispute'))
      .finally(() => setLoading(false));
  }, [disputeId]);

  const handleSubmit = async () => {
    if (!dispute) return;
    if (!notes.trim()) {
      Alert.alert('Notes required', 'Please add resolution notes before submitting.');
      return;
    }
    Alert.alert(
      'Confirm Resolution',
      `Submit "${resolution.replace('_', ' ')}" resolution for this dispute?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await apiClient.post(
                `/mediator/disputes/${disputeId}/resolve`,
                { resolution, notes: notes.trim() },
                { headers: authHeader }
              );
              Alert.alert('Resolved', 'The dispute has been resolved.', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Submission failed');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const split = dispute
    ? computeSplit(dispute.amountUsdc, resolution, dispute.buyerLossBps, dispute.sellerLossBps)
    : null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Dispute</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading && <ActivityIndicator color="#2d6a2d" size="large" style={{ marginTop: 40 }} />}
      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {dispute && (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Dispute overview */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Dispute Details</Text>
            <Text style={styles.reason}>{dispute.reason}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Buyer</Text>
              <Text style={styles.mono}>{dispute.buyerAddress.slice(0, 16)}…</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Seller</Text>
              <Text style={styles.mono}>{dispute.sellerAddress.slice(0, 16)}…</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Amount</Text>
              <Text style={styles.value}>${dispute.amountUsdc} USDC</Text>
            </View>
          </View>

          {/* Evidence manifest */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Evidence ({dispute.evidence.length})</Text>
            {dispute.evidence.length === 0 && (
              <Text style={styles.emptyEvidence}>No evidence uploaded yet.</Text>
            )}
            {dispute.evidence.map((ev) => (
              <View key={ev.id} style={styles.evidenceItem}>
                <Text style={styles.evidenceIcon}>{ev.mediaType === 'video' ? '🎬' : '🖼️'}</Text>
                <View style={styles.evidenceMeta}>
                  <Text style={styles.evidenceFile}>{ev.fileName}</Text>
                  <Text style={styles.evidenceHash}>SHA-256: {ev.fileHash.slice(0, 16)}…</Text>
                  <Text style={styles.evidenceBy}>
                    by {ev.uploadedBy.slice(0, 12)}… · {new Date(ev.uploadedAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Resolution picker */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Resolution</Text>
            {(['FAVOR_BUYER', 'FAVOR_SELLER', 'SPLIT'] as Resolution[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.resOption, resolution === r && styles.resOptionActive]}
                onPress={() => setResolution(r)}
              >
                <View style={styles.radio}>
                  {resolution === r && <View style={styles.radioFill} />}
                </View>
                <Text style={[styles.resLabel, resolution === r && styles.resLabelActive]}>
                  {r.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Split preview */}
          {split && (
            <View style={styles.splitCard}>
              <Text style={styles.sectionTitle}>Payout Preview</Text>
              <View style={styles.splitRow}>
                <View style={styles.splitParty}>
                  <Text style={styles.splitPartyLabel}>Buyer receives</Text>
                  <Text style={styles.splitAmount}>${split.buyerReceives}</Text>
                </View>
                <View style={styles.splitDivider} />
                <View style={styles.splitParty}>
                  <Text style={styles.splitPartyLabel}>Seller receives</Text>
                  <Text style={styles.splitAmount}>${split.sellerReceives}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Notes */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Resolution Notes</Text>
            <TextInput
              style={styles.notesInput}
              multiline
              placeholder="Explain your decision..."
              placeholderTextColor="#bbb"
              value={notes}
              onChangeText={setNotes}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>⚖️ Submit Resolution</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
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
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a3a1a' },
  reason: { fontSize: 14, color: '#333', lineHeight: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13, color: '#888' },
  mono: { fontSize: 13, color: '#333', fontFamily: 'monospace' },
  value: { fontSize: 13, color: '#333', fontWeight: '600' },
  emptyEvidence: { fontSize: 13, color: '#888' },
  evidenceItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  evidenceIcon: { fontSize: 24, marginTop: 2 },
  evidenceMeta: { flex: 1, gap: 2 },
  evidenceFile: { fontSize: 13, color: '#333', fontWeight: '500' },
  evidenceHash: { fontSize: 11, color: '#888', fontFamily: 'monospace' },
  evidenceBy: { fontSize: 11, color: '#aaa' },
  resOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e8e0',
  },
  resOptionActive: { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioFill: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED' },
  resLabel: { fontSize: 14, color: '#555', fontWeight: '500' },
  resLabelActive: { color: '#7C3AED', fontWeight: '700' },
  splitCard: {
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  splitRow: { flexDirection: 'row', alignItems: 'center' },
  splitParty: { flex: 1, alignItems: 'center', gap: 4 },
  splitPartyLabel: { fontSize: 12, color: '#7C3AED' },
  splitAmount: { fontSize: 20, fontWeight: '700', color: '#1a3a1a' },
  splitDivider: { width: 1, height: 48, backgroundColor: '#DDD6FE' },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e0e8e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    minHeight: 100,
  },
  submitBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  errorBanner: { margin: 16, backgroundColor: '#FEE2E2', padding: 12, borderRadius: 8 },
  errorText: { color: '#DC2626', fontSize: 13 },
});
