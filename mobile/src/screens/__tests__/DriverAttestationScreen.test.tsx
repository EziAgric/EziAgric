/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DriverAttestationScreen from '../DriverAttestationScreen';
import * as service from '../../services/attestationQueue.service';
import * as video from '../../lib/attestationVideo';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../services/attestationQueue.service', () => ({
  attestationQueue: { flush: jest.fn() },
  persistVideo: jest.fn(),
  queueAttestation: jest.fn(),
}));
jest.mock('../../lib/attestationVideo', () => ({
  ...jest.requireActual('../../lib/attestationVideo'),
  recordAttestationVideo: jest.fn(),
}));

const record = video.recordAttestationVideo as jest.Mock;
const flush = service.attestationQueue.flush as jest.Mock;

function setup(kind: 'PICKUP' | 'DELIVERY' | 'LOSS' = 'PICKUP') {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const route = { params: { manifestId: 4, tradeId: 'trade-uuid-1234', kind } };
  const utils = render(<DriverAttestationScreen {...({ navigation, route } as any)} />);
  return { navigation, ...utils };
}

async function recordGood(utils: ReturnType<typeof setup>) {
  record.mockResolvedValueOnce({ uri: 'file:///cache/v.mp4', durationSec: 9, fileSize: 1000 });
  fireEvent.press(utils.getByTestId('record-video'));
  await utils.findByTestId('video-ready');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (service.persistVideo as jest.Mock).mockResolvedValue('file:///docs/attestations/v.mp4');
  (service.queueAttestation as jest.Mock).mockResolvedValue({ id: 'q1' });
  flush.mockResolvedValue({ sent: 1, failed: 0, remaining: 0 });
});

describe('DriverAttestationScreen', () => {
  it('cannot submit before a video is recorded', () => {
    const { getByTestId } = setup();
    fireEvent.press(getByTestId('attestation-submit'));
    expect(service.queueAttestation).not.toHaveBeenCalled();
  });

  it('records, persists the video, queues the attestation and syncs when online', async () => {
    const utils = setup('DELIVERY');
    await recordGood(utils);
    fireEvent.changeText(utils.getByTestId('attestation-note'), '  handed to buyer  ');
    fireEvent.press(utils.getByTestId('attestation-submit'));

    await waitFor(() => expect(service.queueAttestation).toHaveBeenCalled());
    expect(service.persistVideo).toHaveBeenCalledWith('file:///cache/v.mp4');
    expect(service.queueAttestation).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestId: 4,
        tradeId: 'trade-uuid-1234',
        kind: 'DELIVERY',
        note: 'handed to buyer',
        videoUri: 'file:///docs/attestations/v.mp4',
        durationSec: 9,
      }),
    );
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Submitted', 'Your attestation was uploaded.'));
    expect(utils.navigation.navigate).toHaveBeenCalledWith('DriverHome');
  });

  it('when offline it still saves the attestation and says it will upload later', async () => {
    flush.mockResolvedValue({ sent: 0, failed: 0, remaining: 1 });
    const utils = setup();
    await recordGood(utils);
    fireEvent.press(utils.getByTestId('attestation-submit'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Saved', expect.stringContaining('upload automatically')),
    );
    expect(service.queueAttestation).toHaveBeenCalledTimes(1);
    expect(utils.navigation.navigate).toHaveBeenCalledWith('DriverHome');
  });

  it('still saves if the immediate sync attempt throws', async () => {
    flush.mockRejectedValue(new Error('boom'));
    const utils = setup();
    await recordGood(utils);
    fireEvent.press(utils.getByTestId('attestation-submit'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Saved', expect.any(String)));
  });

  it('rejects a video shorter than the minimum', async () => {
    record.mockResolvedValueOnce({ uri: 'file:///cache/v.mp4', durationSec: 2 });
    const { getByTestId, queryByTestId } = setup();
    fireEvent.press(getByTestId('record-video'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Video not accepted', expect.stringContaining('at least 5 seconds')));
    expect(queryByTestId('video-ready')).toBeNull();
  });

  it('requires a description for a loss report', async () => {
    const utils = setup('LOSS');
    await recordGood(utils);
    fireEvent.changeText(utils.getByTestId('attestation-note'), 'short');
    expect(utils.getByText('Please write at least 10 characters.')).toBeTruthy();
    fireEvent.press(utils.getByTestId('attestation-submit'));
    expect(service.queueAttestation).not.toHaveBeenCalled();

    fireEvent.changeText(utils.getByTestId('attestation-note'), 'two bags soaked by rain');
    fireEvent.press(utils.getByTestId('attestation-submit'));
    await waitFor(() => expect(service.queueAttestation).toHaveBeenCalledWith(expect.objectContaining({ kind: 'LOSS' })));
  });

  it('shows camera permission problems and a failed save without navigating', async () => {
    record.mockRejectedValueOnce(new Error('Camera permission is needed'));
    const utils = setup();
    fireEvent.press(utils.getByTestId('record-video'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Camera', 'Camera permission is needed'));

    (service.persistVideo as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await recordGood(utils);
    fireEvent.press(utils.getByTestId('attestation-submit'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Could not save attestation', 'disk full'));
    expect(service.queueAttestation).not.toHaveBeenCalled();
    expect(utils.navigation.navigate).not.toHaveBeenCalled();
  });
});
