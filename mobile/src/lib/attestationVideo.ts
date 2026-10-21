import * as ImagePicker from 'expo-image-picker';

export const MIN_ATTESTATION_SECONDS = 5;
export const MAX_ATTESTATION_SECONDS = 90;
/** Backend limit for `POST /evidence/video`. */
export const MAX_ATTESTATION_BYTES = 50 * 1024 * 1024;

export interface RecordedVideo {
  uri: string;
  durationSec: number;
  fileSize?: number;
}

/** Returns a user-facing problem with the recording, or null if it is acceptable. */
export function validateRecording(video: { durationSec: number; fileSize?: number }): string | null {
  if (video.durationSec < MIN_ATTESTATION_SECONDS) {
    return `Video must be at least ${MIN_ATTESTATION_SECONDS} seconds. Please record again.`;
  }
  if (video.fileSize !== undefined && video.fileSize > MAX_ATTESTATION_BYTES) {
    return 'Video is larger than 50 MB. Please record a shorter clip.';
  }
  return null;
}

export class CameraPermissionError extends Error {
  constructor() {
    super('Camera permission is needed to record. Enable it in Settings.');
    this.name = 'CameraPermissionError';
  }
}

/** Open the camera in video mode. Returns null if the user cancels. */
export async function recordAttestationVideo(): Promise<RecordedVideo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new CameraPermissionError();

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['videos'],
    videoMaxDuration: MAX_ATTESTATION_SECONDS,
  });
  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    // expo-image-picker reports video duration in milliseconds.
    durationSec: Math.round((asset.duration ?? 0) / 1000),
    fileSize: asset.fileSize,
  };
}
