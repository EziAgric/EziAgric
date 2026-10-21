/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import MediatorDisputeReviewScreen from '../MediatorDisputeReviewScreen';
import apiClient from '../../api/client';
import { useAuthStore } from '../../stores/authStore';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../api/client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../../stores/authStore', () => ({ useAuthStore: jest.fn() }));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const authHeaders = { headers: { Authorization: 'Bearer tok-123' } };

const detail = (over: Record<string, unknown> = {}) => ({
  id: 'd-1',
  tradeId: 'trade-11111111',
  reason: 'Maize arrived wet and partially spoiled',
  status: 'OPEN',
  buyerAddress: 'GBUYER1111111111111111111111111111111111111111',
  sellerAddress: 'GSELLER111111111111111111111111111111111111111',
  amountUsdc: '100',
  buyerLossBps: 2500,
  sellerLossBps: 1000,
  evidence: [],
  createdAt: '2026-10-01T09:00:00.000Z',
  ...over,
});

function setup() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = render(
    <MediatorDisputeReviewScreen {...({ navigation, route: { params: { disputeId: 'd-1' } } } as any)} />,
  );
  return { navigation, ...utils };
}

/** Buttons passed to the most recent Alert.alert call. */
function lastAlertButtons(): AlertButton[] {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  return calls[calls.length - 1][2];
}

async function pressAlertButton(text: string) {
  const button = lastAlertButtons().find((b) => b.text === text);
  if (!button?.onPress) throw new Error(`No "${text}" button on the last alert`);
  await act(async () => {
    await button.onPress?.();
  });
}

async function fillNotesAndSubmit(utils: ReturnType<typeof setup>, notes = 'Buyer evidence is convincing.') {
  fireEvent.changeText(await utils.findByPlaceholderText('Explain your decision...'), notes);
  fireEvent.press(utils.getByText('⚖️ Submit Resolution'));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  (useAuthStore as unknown as jest.Mock).mockReturnValue({ token: 'tok-123' });
  mockGet.mockResolvedValue({ data: detail() });
  mockPost.mockResolvedValue({ data: {} });
});

describe('MediatorDisputeReviewScreen', () => {
  it('loads the dispute by id with the auth token', async () => {
    const { findByText } = setup();
    expect(await findByText('Maize arrived wet and partially spoiled')).toBeTruthy();
    expect(mockGet).toHaveBeenCalledWith('/mediator/disputes/d-1', authHeaders);
  });

  it('shows the error message when loading fails', async () => {
    mockGet.mockRejectedValue(new Error('Dispute not found'));
    const { findByText, queryByText } = setup();
    expect(await findByText('Dispute not found')).toBeTruthy();
    expect(queryByText('⚖️ Submit Resolution')).toBeNull();
  });

  describe('evidence', () => {
    it('shows an empty-evidence message when nothing was uploaded', async () => {
      const { findByText, getByText } = setup();
      expect(await findByText('Evidence (0)')).toBeTruthy();
      expect(getByText('No evidence uploaded yet.')).toBeTruthy();
    });

    it('lists uploaded evidence', async () => {
      mockGet.mockResolvedValue({
        data: detail({
          evidence: [
            {
              id: 'ev-1',
              mediaType: 'video',
              fileName: 'unloading.mp4',
              fileHash: 'abcdef0123456789abcdef0123456789',
              uploadedAt: '2026-10-02T10:00:00.000Z',
              uploadedBy: 'GBUYER1111111111',
            },
          ],
        }),
      });
      const { findByText, getByText, queryByText } = setup();

      expect(await findByText('Evidence (1)')).toBeTruthy();
      expect(getByText('unloading.mp4')).toBeTruthy();
      expect(getByText('SHA-256: abcdef0123456789…')).toBeTruthy();
      expect(queryByText('No evidence uploaded yet.')).toBeNull();
    });
  });

  describe('payout preview', () => {
    it('applies loss bps for the default SPLIT resolution', async () => {
      const { findByText, getByText } = setup();
      expect(await findByText('$75.00')).toBeTruthy();
      expect(getByText('$90.00')).toBeTruthy();
    });

    it('gives the full amount to the buyer for FAVOR BUYER', async () => {
      const { findByText, getByText } = setup();
      fireEvent.press(await findByText('FAVOR BUYER'));
      expect(getByText('$100.00')).toBeTruthy();
      expect(getByText('$0.00')).toBeTruthy();
    });
  });

  describe('review actions', () => {
    it('blocks submission without notes', async () => {
      const utils = setup();
      fireEvent.press(await utils.findByText('⚖️ Submit Resolution'));

      expect(Alert.alert).toHaveBeenCalledWith('Notes required', 'Please add resolution notes before submitting.');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('treats whitespace-only notes as missing', async () => {
      const utils = setup();
      await fillNotesAndSubmit(utils, '   ');

      expect(Alert.alert).toHaveBeenCalledWith('Notes required', expect.any(String));
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('asks for confirmation with the chosen resolution', async () => {
      const utils = setup();
      fireEvent.press(await utils.findByText('FAVOR SELLER'));
      await fillNotesAndSubmit(utils);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Confirm Resolution',
        'Submit "FAVOR SELLER" resolution for this dispute?',
        expect.any(Array),
      );
      expect(lastAlertButtons().map((b) => b.text)).toEqual(['Cancel', 'Submit']);
    });

    it('does nothing when the confirmation is cancelled', async () => {
      const utils = setup();
      await fillNotesAndSubmit(utils);

      expect(lastAlertButtons()[0]).toMatchObject({ text: 'Cancel', style: 'cancel' });
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('submits trimmed notes on confirm, then goes back after OK', async () => {
      const utils = setup();
      await fillNotesAndSubmit(utils, '  Buyer evidence is convincing.  ');

      await pressAlertButton('Submit');

      expect(mockPost).toHaveBeenCalledWith(
        '/mediator/disputes/d-1/resolve',
        { resolution: 'SPLIT', notes: 'Buyer evidence is convincing.' },
        authHeaders,
      );
      expect(Alert.alert).toHaveBeenLastCalledWith('Resolved', 'The dispute has been resolved.', expect.any(Array));
      expect(utils.navigation.goBack).not.toHaveBeenCalled();

      await pressAlertButton('OK');
      expect(utils.navigation.goBack).toHaveBeenCalled();
    });

    it('shows an error alert and stays on screen when submission fails', async () => {
      mockPost.mockRejectedValue(new Error('Dispute already resolved'));
      const utils = setup();
      await fillNotesAndSubmit(utils);

      await pressAlertButton('Submit');

      expect(Alert.alert).toHaveBeenLastCalledWith('Error', 'Dispute already resolved');
      expect(utils.navigation.goBack).not.toHaveBeenCalled();
      await waitFor(() => expect(utils.getByText('⚖️ Submit Resolution')).toBeTruthy());
    });
  });
});
