/* eslint-disable no-undef */
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  MAX_PHOTO_WIDTH,
  PHOTO_JPEG_QUALITY,
  PhotoPermissionError,
  pickListingPhotos,
  prepareListingPhoto,
} from '../listingPhotos';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

const manipulate = ImageManipulator.manipulateAsync as jest.Mock;
const camera = ImagePicker.launchCameraAsync as jest.Mock;
const library = ImagePicker.launchImageLibraryAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  manipulate.mockImplementation(async (uri: string) => ({ uri: `processed://${uri}`, width: 1280, height: 960 }));
});

describe('prepareListingPhoto (EXIF stripping + compression)', () => {
  it('re-encodes as JPEG at the configured quality and returns the NEW uri, not the original', async () => {
    const photo = await prepareListingPhoto({ uri: 'file://orig-with-gps.jpg', width: 800, height: 600 });
    expect(manipulate).toHaveBeenCalledWith('file://orig-with-gps.jpg', [], {
      compress: PHOTO_JPEG_QUALITY,
      format: 'jpeg',
    });
    expect(photo.uri).toBe('processed://file://orig-with-gps.jpg');
    expect(photo.uri).not.toBe('file://orig-with-gps.jpg');
    expect(photo.type).toBe('image/jpeg');
    expect(photo.name).toMatch(/\.jpg$/);
  });

  it('downscales images wider than the max width, leaves smaller ones alone', async () => {
    await prepareListingPhoto({ uri: 'file://big.jpg', width: 4000, height: 3000 });
    expect(manipulate.mock.calls[0][1]).toEqual([{ resize: { width: MAX_PHOTO_WIDTH } }]);
    await prepareListingPhoto({ uri: 'file://small.jpg', width: 1000, height: 800 });
    expect(manipulate.mock.calls[1][1]).toEqual([]);
  });
});

describe('pickListingPhotos', () => {
  it('requests no EXIF from the picker and processes every picked asset', async () => {
    library.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file://a.jpg', width: 3000, height: 2000, exif: { GPSLatitude: 1 } },
        { uri: 'file://b.jpg', width: 3000, height: 2000, exif: { GPSLatitude: 2 } },
      ],
    });
    const photos = await pickListingPhotos('gallery', 0);
    expect(library).toHaveBeenCalledWith(expect.objectContaining({ exif: false, allowsMultipleSelection: true, selectionLimit: 5 }));
    expect(photos.map((p) => p.uri)).toEqual(['processed://file://a.jpg', 'processed://file://b.jpg']);
    // Nothing from the original picker result (uri/exif) leaks into the output.
    expect(JSON.stringify(photos)).not.toMatch(/GPS/);
  });

  it('limits the selection to the remaining photo slots', async () => {
    library.mockResolvedValue({
      canceled: false,
      assets: [1, 2, 3].map((n) => ({ uri: `file://${n}.jpg`, width: 100, height: 100 })),
    });
    const photos = await pickListingPhotos('gallery', 3);
    expect(library).toHaveBeenCalledWith(expect.objectContaining({ selectionLimit: 2 }));
    expect(photos).toHaveLength(2);
  });

  it('does nothing when all slots are used', async () => {
    expect(await pickListingPhotos('camera', 5)).toEqual([]);
    expect(camera).not.toHaveBeenCalled();
  });

  it('uses the camera, and returns [] when the user cancels', async () => {
    camera.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickListingPhotos('camera', 0)).toEqual([]);
    expect(camera).toHaveBeenCalledWith(expect.objectContaining({ exif: false }));
    expect(manipulate).not.toHaveBeenCalled();
  });

  it('throws a PhotoPermissionError when permission is denied and never opens the picker', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    await expect(pickListingPhotos('camera', 0)).rejects.toBeInstanceOf(PhotoPermissionError);
    expect(camera).not.toHaveBeenCalled();
  });
});
