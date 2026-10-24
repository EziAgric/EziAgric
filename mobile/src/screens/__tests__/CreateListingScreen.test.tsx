/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CreateListingScreen from '../CreateListingScreen';
import { listingApi } from '../../api/listings';
import { referenceApi } from '../../api/reference';
import { pickListingPhotos } from '../../lib/listingPhotos';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../api/listings', () => ({
  listingApi: { createListing: jest.fn(), getListing: jest.fn(), listListings: jest.fn() },
}));
jest.mock('../../api/reference', () => ({
  ...jest.requireActual('../../api/reference'),
  referenceApi: { listCommodities: jest.fn(), listRegions: jest.fn() },
}));
jest.mock('../../lib/listingPhotos', () => ({
  ...jest.requireActual('../../lib/listingPhotos'),
  pickListingPhotos: jest.fn(),
}));

const photo = { uri: 'processed://a.jpg', name: 'a.jpg', type: 'image/jpeg', width: 1280, height: 960 };

function setup() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn() };
  const utils = render(<CreateListingScreen {...({ navigation, route: { params: undefined } } as any)} />);
  return { navigation, ...utils };
}

beforeEach(() => {
  jest.clearAllMocks();
  (referenceApi.listCommodities as jest.Mock).mockResolvedValue([
    { code: 'maize', name: 'Maize' },
    { code: 'rice', name: 'Rice' },
  ]);
  (referenceApi.listRegions as jest.Mock).mockResolvedValue([{ code: 'NG-KD', name: 'Kaduna' }]);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

async function fillValid(utils: ReturnType<typeof setup>) {
  const { findByTestId, getByTestId } = utils;
  fireEvent.press(await findByTestId('commodity-rice'));
  fireEvent.press(await findByTestId('region-NG-KD'));
  fireEvent.changeText(getByTestId('listing-quantity'), '250');
  fireEvent.changeText(getByTestId('listing-price'), '600');
  (pickListingPhotos as jest.Mock).mockResolvedValueOnce([photo]);
  fireEvent.press(getByTestId('add-photo-camera'));
  await waitFor(() => expect(getByTestId('remove-photo-0')).toBeTruthy());
}

describe('CreateListingScreen', () => {
  it('shows validation errors and does not submit an empty form', async () => {
    const utils = setup();
    fireEvent.press(await utils.findByTestId('listing-submit'));
    expect(await utils.findByText('Choose a commodity')).toBeTruthy();
    expect(utils.getByText('Choose a region')).toBeTruthy();
    expect(utils.getByText('Add at least one photo')).toBeTruthy();
    expect(listingApi.createListing).not.toHaveBeenCalled();
  });

  it('adds camera photos, submits the compressed files, and opens the new listing', async () => {
    (listingApi.createListing as jest.Mock).mockResolvedValue({ id: 'new-1' });
    const utils = setup();
    await fillValid(utils);
    expect(pickListingPhotos).toHaveBeenCalledWith('camera', 0);

    fireEvent.press(utils.getByTestId('listing-submit'));
    await waitFor(() =>
      expect(listingApi.createListing).toHaveBeenCalledWith({
        commodity: 'rice',
        region: 'NG-KD',
        quantity: '250',
        unit: 'kg',
        pricePerUnit: '600',
        description: undefined,
        photos: [photo],
      }),
    );
    expect(utils.navigation.replace).toHaveBeenCalledWith('ListingDetail', { listingId: 'new-1' });
  });

  it('lets the seller remove a photo', async () => {
    const utils = setup();
    await fillValid(utils);
    fireEvent.press(utils.getByTestId('remove-photo-0'));
    expect(utils.queryByTestId('remove-photo-0')).toBeNull();
  });

  it('surfaces photo permission errors', async () => {
    (pickListingPhotos as jest.Mock).mockRejectedValueOnce(new Error('Camera permission is needed'));
    const { getByTestId } = setup();
    fireEvent.press(getByTestId('add-photo-gallery'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Photo', 'Camera permission is needed'));
  });

  it('keeps the form and alerts when the API rejects the listing', async () => {
    (listingApi.createListing as jest.Mock).mockRejectedValue(new Error('quantity too large'));
    const utils = setup();
    await fillValid(utils);
    fireEvent.press(utils.getByTestId('listing-submit'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Could not create listing', 'quantity too large'));
    expect(utils.navigation.replace).not.toHaveBeenCalled();
    expect(utils.getByTestId('listing-quantity').props.value).toBe('250');
  });
});
