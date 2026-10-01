/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ListingDetailScreen from '../ListingDetailScreen';
import { listingApi } from '../../api/listings';
import { useAuthStore } from '../../stores/authStore';
import type { Listing } from '../../types/listing';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../api/listings', () => ({
  listingApi: { getListing: jest.fn(), listListings: jest.fn() },
}));

const SELLER = 'G' + 'S'.repeat(55);
const BUYER = 'G' + 'B'.repeat(55);

const baseListing: Listing = {
  id: 'l1',
  sellerAddress: SELLER,
  commodity: 'Maize',
  region: 'Kaduna',
  quantity: '100',
  unit: 'kg',
  pricePerUnit: '450',
  photos: [],
  status: 'ACTIVE',
};

function setup(listing: Listing, wallet: string | null = BUYER) {
  (listingApi.getListing as jest.Mock).mockResolvedValue(listing);
  useAuthStore.setState({ walletAddress: wallet });
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = render(<ListingDetailScreen {...({ navigation, route: { params: { listingId: listing.id } } } as any)} />);
  return { navigation, ...utils };
}

describe('ListingDetailScreen', () => {
  it('shows the listing and starts a trade with a prefill for the picked quantity', async () => {
    const { findByTestId, getByTestId, navigation } = setup(baseListing);
    const input = await findByTestId('qty-input');
    fireEvent.changeText(input, '40');
    fireEvent(input, 'blur');
    await waitFor(() => expect(getByTestId('listing-total').props.children.join('')).toContain('18,000'));

    fireEvent.press(getByTestId('start-trade'));
    expect(navigation.navigate).toHaveBeenCalledWith('CreateTrade', {
      prefill: {
        listingId: 'l1',
        commodity: 'Maize',
        quantity: '40',
        unit: 'kg',
        pricePerUnit: '450',
        sellerAddress: SELLER,
      },
    });
  });

  it('stepper changes quantity and never exceeds availability or goes below 1', async () => {
    const { findByTestId, getByTestId } = setup({ ...baseListing, quantity: '2' });
    const input = await findByTestId('qty-input');
    expect(input.props.value).toBe('1');
    fireEvent.press(getByTestId('qty-increase'));
    await waitFor(() => expect(getByTestId('qty-input').props.value).toBe('2'));
    expect(getByTestId('qty-increase').props.accessibilityState?.disabled ?? getByTestId('qty-increase').props.disabled).toBeTruthy();

    fireEvent.changeText(getByTestId('qty-input'), '999');
    fireEvent(getByTestId('qty-input'), 'blur');
    await waitFor(() => expect(getByTestId('qty-input').props.value).toBe('2'));
    fireEvent.changeText(getByTestId('qty-input'), '0');
    fireEvent(getByTestId('qty-input'), 'blur');
    await waitFor(() => expect(getByTestId('qty-input').props.value).toBe('1'));
  });

  it('does not allow starting a trade on your own listing', async () => {
    const { findByTestId, navigation } = setup(baseListing, SELLER);
    expect(await findByTestId('listing-own')).toBeTruthy();
    fireEvent.press(await findByTestId('start-trade'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('does not allow starting a trade on a sold listing', async () => {
    const { findByTestId, navigation } = setup({ ...baseListing, status: 'SOLD' });
    expect(await findByTestId('listing-unavailable')).toBeTruthy();
    fireEvent.press(await findByTestId('start-trade'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('shows an error when the listing cannot be loaded', async () => {
    (listingApi.getListing as jest.Mock).mockRejectedValue(new Error('not found'));
    const navigation = { navigate: jest.fn(), goBack: jest.fn() };
    const { findByText } = render(<ListingDetailScreen {...({ navigation, route: { params: { listingId: 'x' } } } as any)} />);
    expect(await findByText('not found')).toBeTruthy();
  });
});
