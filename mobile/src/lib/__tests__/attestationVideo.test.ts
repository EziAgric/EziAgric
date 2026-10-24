/* eslint-disable no-undef */
import * as ImagePicker from 'expo-image-picker';
import {
  CameraPermissionError,
  MAX_ATTESTATION_BYTES,
  MIN_ATTESTATION_SECONDS,
  recordAttestationVideo,
  validateRecording,
} from '../attestationVideo';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
}));

const camera = ImagePicker.launchCameraAsync as jest.Mock;
const permission = ImagePicker.requestCameraPermissionsAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  permission.mockResolvedValue({ granted: true });
});

describe('validateRecording', () => {
  it('accepts a clip at the minimum length and the size limit', () => {
    expect(validateRecording({ durationSec: MIN_ATTESTATION_SECONDS, fileSize: MAX_ATTESTATION_BYTES })).toBeNull();
  });
  it('rejects clips that are too short', () => {
    expect(validateRecording({ durationSec: MIN_ATTESTATION_SECONDS - 1 })).toMatch(/at least 5 seconds/);
  });
  it('rejects clips over the 50 MB upload limit', () => {
    expect(validateRecording({ durationSec: 30, fileSize: MAX_ATTESTATION_BYTES + 1 })).toMatch(/50 MB/);
  });
  it('does not reject when the size is unknown', () => {
    expect(validateRecording({ durationSec: 30 })).toBeNull();
  });
});

describe('recordAttestationVideo', () => {
  it('records video and converts milliseconds to seconds', async () => {
    camera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://cache/v.mp4', duration: 7400, fileSize: 1234 }] });
    expect(await recordAttestationVideo()).toEqual({ uri: 'file://cache/v.mp4', durationSec: 7, fileSize: 1234 });
    expect(camera).toHaveBeenCalledWith(expect.objectContaining({ mediaTypes: ['videos'] }));
  });
  it('returns null when cancelled', async () => {
    camera.mockResolvedValue({ canceled: true, assets: null });
    expect(await recordAttestationVideo()).toBeNull();
  });
  it('throws when camera permission is denied and does not open the camera', async () => {
    permission.mockResolvedValue({ granted: false });
    await expect(recordAttestationVideo()).rejects.toBeInstanceOf(CameraPermissionError);
    expect(camera).not.toHaveBeenCalled();
  });
});
