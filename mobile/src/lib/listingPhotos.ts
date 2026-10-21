import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { LISTING_LIMITS } from './listingValidation';

export const MAX_PHOTO_WIDTH = 1280;
export const PHOTO_JPEG_QUALITY = 0.7;

export interface ListingPhoto {
  uri: string;
  name: string;
  type: 'image/jpeg';
  width: number;
  height: number;
}

export type PhotoSource = 'camera' | 'gallery';

/**
 * Downscale and re-encode a picked image as JPEG.
 *
 * Re-encoding through the manipulator writes a brand-new file, which drops all
 * EXIF metadata (including GPS coordinates) from the original. The upload must
 * only ever use the returned `uri`, never the original asset uri.
 */
export async function prepareListingPhoto(
  asset: { uri: string; width: number; height: number },
  index = 0,
): Promise<ListingPhoto> {
  const actions: ImageManipulator.Action[] =
    asset.width > MAX_PHOTO_WIDTH ? [{ resize: { width: MAX_PHOTO_WIDTH } }] : [];
  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return {
    uri: result.uri,
    name: `listing-${Date.now()}-${index}.jpg`,
    type: 'image/jpeg',
    width: result.width,
    height: result.height,
  };
}

export class PhotoPermissionError extends Error {
  constructor(source: PhotoSource) {
    super(
      source === 'camera'
        ? 'Camera permission is needed to take photos. Enable it in Settings.'
        : 'Photo library permission is needed to choose photos. Enable it in Settings.',
    );
    this.name = 'PhotoPermissionError';
  }
}

/**
 * Take or choose photos and return compressed, EXIF-free copies. Picks are
 * limited to the remaining photo slots. Returns [] if the user cancels.
 */
export async function pickListingPhotos(source: PhotoSource, alreadyHave: number): Promise<ListingPhoto[]> {
  const remaining = LISTING_LIMITS.maxPhotos - alreadyHave;
  if (remaining <= 0) return [];

  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PhotoPermissionError(source);

  // `exif: false` asks the picker not to return EXIF; the manipulator re-encode
  // below is what actually guarantees the stored file carries none.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    exif: false,
    quality: 1,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync({
          ...options,
          allowsMultipleSelection: true,
          selectionLimit: remaining,
        });

  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, remaining).map((a, i) => prepareListingPhoto(a, alreadyHave + i)));
}
