/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DriverHomeScreen, { attestationProgress } from '../DriverHomeScreen';
import { driverApi } from '../../api/driver';
import * as service from '../../services/attestationQueue.service';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import type { AssignedManifest } from '../../types/driver';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../hooks/useNetworkStatus', () => ({ useNetworkStatus: jest.fn() }));
jest.mock('../../api/driver', () => ({ driverApi: { listAssignedManifests: jest.fn(), submitAttestation: jest.fn() } }));
jest.mock('../../services/attestationQueue.service', () => {
  const lib = jest.requireActual('../../lib/attestationQueue');
  const send = jest.fn();
  return {
    __send: send,
    attestationQueue: new lib.AttestationQueue(lib.createMemoryStorage(), (i: unknown) => send(i)),
    cacheManifests: jest.fn().mockResolvedValue(undefined),
    getCachedManifests: jest.fn().mockResolvedValue(null),
  };
});

const queue = service.attestationQueue;
const send = (service as any).__send as jest.Mock;

const manifest = (over: Partial<AssignedManifest> = {}): AssignedManifest => ({
  id: 1,
  tradeId: 'aaaaaaaa-1111',
  commodity: 'Maize',
  vehicleRegistration: 'KJA-123',
  routeDescription: 'Kaduna to Lagos',
  expectedDeliveryAt: '2026-10-05T00:00:00.000Z',
  ...over,
});

const queued = (manifestId: number, kind: 'PICKUP' | 'DELIVERY' | 'LOSS') =>
  queue.enqueue({ manifestId, tradeId: 'aaaaaaaa-1111', kind, videoUri: 'file:///v.mp4', durationSec: 8, capturedAt: '2026-10-01T10:00:00.000Z' });

function setup() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = render(<DriverHomeScreen {...({ navigation, route: { params: undefined } } as any)} />);
  return { navigation, ...utils };
}

beforeEach(async () => {
  jest.clearAllMocks();
  for (const i of await queue.items()) await queue.discard(i.id);
  (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline: false });
  (service.getCachedManifests as jest.Mock).mockResolvedValue(null);
  send.mockResolvedValue(undefined);
});

describe('attestationProgress', () => {
  it('combines server state with queued items', () => {
    const m = manifest({ id: 2, pickupAttestedAt: '2026-10-01T00:00:00Z' });
    expect(attestationProgress(m, [])).toMatchObject({ pickupDone: true, deliveryDone: false, pickupQueued: false });
    const items = [{ manifestId: 2, kind: 'LOSS' }, { manifestId: 9, kind: 'PICKUP' }] as any;
    expect(attestationProgress(m, items)).toMatchObject({ deliveryDone: true, deliveryQueued: true });
    expect(attestationProgress(manifest({ id: 3 }), items)).toMatchObject({ pickupDone: false });
  });
});

describe('DriverHomeScreen', () => {
  it('lists assigned manifests and starts a pickup attestation', async () => {
    (driverApi.listAssignedManifests as jest.Mock).mockResolvedValue([manifest()]);
    const { findByTestId, navigation, getByText } = setup();
    expect(await findByTestId('manifest-1')).toBeTruthy();
    expect(getByText('Kaduna to Lagos')).toBeTruthy();
    expect(service.cacheManifests).toHaveBeenCalled();

    fireEvent.press(await findByTestId('pickup-1'));
    expect(navigation.navigate).toHaveBeenCalledWith('DriverAttestation', { manifestId: 1, tradeId: 'aaaaaaaa-1111', kind: 'PICKUP' });
  });

  it('after pickup offers delivery and loss; after both, no actions', async () => {
    (driverApi.listAssignedManifests as jest.Mock).mockResolvedValue([
      manifest({ id: 1, pickupAttestedAt: '2026-10-01T00:00:00Z' }),
      manifest({ id: 2, pickupAttestedAt: 'x', deliveryAttestedAt: 'y' }),
    ]);
    const { findByTestId, queryByTestId, navigation } = setup();
    fireEvent.press(await findByTestId('loss-1'));
    expect(navigation.navigate).toHaveBeenCalledWith('DriverAttestation', expect.objectContaining({ manifestId: 1, kind: 'LOSS' }));
    fireEvent.press(await findByTestId('deliver-1'));
    expect(navigation.navigate).toHaveBeenCalledWith('DriverAttestation', expect.objectContaining({ kind: 'DELIVERY' }));
    expect(queryByTestId('pickup-2')).toBeNull();
    expect(queryByTestId('deliver-2')).toBeNull();
  });

  it('works offline: shows the cached manifests and an offline notice', async () => {
    (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline: true });
    (driverApi.listAssignedManifests as jest.Mock).mockRejectedValue(new Error('Network Error'));
    (service.getCachedManifests as jest.Mock).mockResolvedValue([manifest()]);
    const { findByTestId, getByText, getByTestId } = setup();
    expect(await findByTestId('manifest-1')).toBeTruthy();
    expect(getByTestId('driver-offline')).toBeTruthy();
    expect(getByText('Showing your last saved manifests.')).toBeTruthy();
  });

  it('shows an error with retry when offline with nothing cached', async () => {
    (driverApi.listAssignedManifests as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));
    (driverApi.listAssignedManifests as jest.Mock).mockResolvedValueOnce([manifest()]);
    const { findByText, getByTestId, findByTestId } = setup();
    expect(await findByText('Network Error')).toBeTruthy();
    fireEvent.press(getByTestId('driver-retry'));
    expect(await findByTestId('manifest-1')).toBeTruthy();
  });

  it('shows a queued pickup as queued, with a sync banner; Sync now uploads and clears it', async () => {
    send.mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    (driverApi.listAssignedManifests as jest.Mock).mockResolvedValue([manifest()]);
    await queued(1, 'PICKUP');
    const { findByTestId, getByText, queryByTestId } = setup();

    expect(await findByTestId('queue-banner')).toBeTruthy();
    expect(getByText('1 attestation waiting to sync')).toBeTruthy();
    expect(getByText('✓ Pickup (queued)')).toBeTruthy();
    expect(queryByTestId('pickup-1')).toBeNull();

    send.mockResolvedValue(undefined);
    await act(async () => {
      fireEvent.press(await findByTestId('sync-now'));
    });
    await waitFor(() => expect(queryByTestId('queue-banner')).toBeNull());
  });

  it('disables Sync now while offline', async () => {
    (useNetworkStatus as jest.Mock).mockReturnValue({ isOffline: true });
    (driverApi.listAssignedManifests as jest.Mock).mockResolvedValue([manifest()]);
    await queued(1, 'PICKUP');
    const { findByTestId } = setup();
    fireEvent.press(await findByTestId('sync-now'));
    expect(send).not.toHaveBeenCalled();
  });

  it('surfaces a rejected attestation with Retry and Discard', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 422, data: { error: 'hash mismatch' } } }));
    (driverApi.listAssignedManifests as jest.Mock).mockResolvedValue([manifest()]);
    const item = await queued(1, 'PICKUP');
    await queue.flush();
    const { findByTestId, getByText, queryByTestId } = setup();
    expect(await findByTestId(`failed-${item.id}`)).toBeTruthy();
    expect(getByText(/hash mismatch/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(await findByTestId(`discard-${item.id}`));
    });
    await waitFor(() => expect(queryByTestId(`failed-${item.id}`)).toBeNull());
  });
});
