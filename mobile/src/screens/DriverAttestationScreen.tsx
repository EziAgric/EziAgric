import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import { attestationQueue, persistVideo, queueAttestation } from '../services/attestationQueue.service';
import {
  recordAttestationVideo,
  validateRecording,
  MIN_ATTESTATION_SECONDS,
  type RecordedVideo,
} from '../lib/attestationVideo';

type Props = StackScreenProps<RootStackParamList, 'DriverAttestation'>;

const TITLES = { PICKUP: 'Confirm pickup', DELIVERY: 'Attest delivery', LOSS: 'Report loss' } as const;
export const MIN_LOSS_NOTE_LENGTH = 10;

export default function DriverAttestationScreen({ route, navigation }: Props) {
  const { manifestId, tradeId, kind } = route.params;
  const insets = useSafeAreaInsets();
  const [video, setVideo] = useState<RecordedVideo | null>(null);
  const [note, setNote] = useState('');
  const [recording, setRecording] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const noteRequired = kind === 'LOSS';
  const noteOk = !noteRequired || note.trim().length >= MIN_LOSS_NOTE_LENGTH;
  const canSubmit = !!video && noteOk && !submitting;

  const record = async () => {
    setRecording(true);
    try {
      const recorded = await recordAttestationVideo();
      if (!recorded) return;
      const problem = validateRecording(recorded);
      if (problem) {
        Alert.alert('Video not accepted', problem);
        return;
      }
      setVideo(recorded);
    } catch (err) {
      Alert.alert('Camera', err instanceof Error ? err.message : 'Could not record video');
    } finally {
      setRecording(false);
    }
  };

  const submit = async () => {
    if (!video || !canSubmit) return;
    setSubmitting(true);
    try {
      // Save first: from here on the attestation survives app restarts and
      // being offline. Uploading is best-effort and retried automatically.
      const videoUri = await persistVideo(video.uri);
      await queueAttestation({
        manifestId,
        tradeId,
        kind,
        note: note.trim() || undefined,
        videoUri,
        durationSec: video.durationSec,
        capturedAt: new Date().toISOString(),
      });

      const result = await attestationQueue.flush().catch(() => null);
      const synced = result !== null && result.remaining === 0;
      Alert.alert(
        synced ? 'Submitted' : 'Saved',
        synced
          ? 'Your attestation was uploaded.'
          : 'Your attestation is saved and will upload automatically when you are back online.',
      );
      navigation.navigate('DriverHome');
    } catch (err) {
      Alert.alert('Could not save attestation', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{TITLES[kind]}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.meta}>Trade #{tradeId.slice(0, 12)}</Text>
        <Text style={styles.help}>
          {kind === 'PICKUP' && `Record a video of the goods being loaded (at least ${MIN_ATTESTATION_SECONDS} seconds).`}
          {kind === 'DELIVERY' && `Record a video of the goods being handed over (at least ${MIN_ATTESTATION_SECONDS} seconds).`}
          {kind === 'LOSS' && `Record a video showing what was lost or damaged (at least ${MIN_ATTESTATION_SECONDS} seconds) and describe what happened.`}
        </Text>

        <TouchableOpacity
          style={[styles.record, recording && styles.disabled]}
          disabled={recording}
          onPress={record}
          testID="record-video"
        >
          <Text style={styles.recordText}>{video ? '🎥 Record again' : '🎥 Record video'}</Text>
        </TouchableOpacity>
        {video && (
          <Text style={styles.ok} testID="video-ready">
            ✓ Video ready ({video.durationSec}s)
          </Text>
        )}

        <Text style={styles.label}>{noteRequired ? 'What happened (required)' : 'Note (optional)'}</Text>
        <TextInput
          style={styles.input}
          multiline
          value={note}
          onChangeText={setNote}
          placeholder={noteRequired ? 'Describe the loss or damage' : 'Anything the buyer or seller should know'}
          testID="attestation-note"
        />
        {noteRequired && !noteOk && (
          <Text style={styles.error}>Please write at least {MIN_LOSS_NOTE_LENGTH} characters.</Text>
        )}

        <TouchableOpacity
          style={[styles.submit, !canSubmit && styles.disabled]}
          disabled={!canSubmit}
          onPress={submit}
          testID="attestation-submit"
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f9f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a3a1a' },
  link: { color: '#2d6a2d', fontWeight: '600' },
  content: { padding: 16 },
  meta: { color: '#667' },
  help: { marginTop: 8, color: '#333', lineHeight: 20 },
  record: { marginTop: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#2d6a2d', borderRadius: 10, padding: 16, alignItems: 'center' },
  recordText: { color: '#2d6a2d', fontWeight: '700', fontSize: 16 },
  ok: { marginTop: 8, color: '#15803D', fontWeight: '600' },
  label: { fontWeight: '600', marginTop: 20, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0dcd0', borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top' },
  error: { color: '#EF4444', marginTop: 4, fontSize: 12 },
  submit: { marginTop: 24, backgroundColor: '#2d6a2d', borderRadius: 10, padding: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.4 },
});
