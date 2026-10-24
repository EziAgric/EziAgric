import apiClient from './client';
import type { AssignedManifest, QueuedAttestation } from '../types/driver';

export const driverApi = {
  /** Manifests assigned to the signed-in driver. */
  async listAssignedManifests(): Promise<AssignedManifest[]> {
    const response = await apiClient.get('/manifests/assigned');
    return response.data;
  },

  /**
   * Upload one attestation video. Uses the existing `POST /evidence/video`
   * endpoint (multipart `file`, MP4/WebM <= 50 MB) and adds the manifest context
   * as extra fields. `Idempotency-Key` makes retries after a lost response safe.
   */
  async submitAttestation(item: QueuedAttestation, token: string | null): Promise<void> {
    const form = new FormData();
    form.append('tradeId', item.tradeId);
    form.append('manifestId', String(item.manifestId));
    form.append('attestationKind', item.kind);
    form.append('capturedAt', item.capturedAt);
    form.append('durationSec', String(item.durationSec));
    if (item.note) form.append('note', item.note);
    // React Native's FormData accepts a { uri, name, type } descriptor.
    form.append('file', { uri: item.videoUri, name: `${item.id}.mp4`, type: 'video/mp4' } as unknown as Blob);

    await apiClient.post('/evidence/video', form, {
      headers: {
        'Content-Type': 'multipart/form-data',
        'Idempotency-Key': item.id,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 120000,
    });
  },
};
