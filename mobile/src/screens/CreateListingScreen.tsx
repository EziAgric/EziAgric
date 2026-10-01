import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import { listingApi } from '../api/listings';
import { useReferenceData } from '../hooks/useReferenceData';
import { pickListingPhotos, type ListingPhoto, type PhotoSource } from '../lib/listingPhotos';
import {
  LISTING_LIMITS,
  LISTING_UNITS,
  validateListingForm,
  type ListingFormErrors,
} from '../lib/listingValidation';

type Props = StackScreenProps<RootStackParamList, 'CreateListing'>;

export default function CreateListingScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { commodities, regions } = useReferenceData();

  const [commodity, setCommodity] = useState('');
  const [region, setRegion] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<string>('kg');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [errors, setErrors] = useState<ListingFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);

  const addPhotos = async (source: PhotoSource) => {
    setAddingPhoto(true);
    try {
      const picked = await pickListingPhotos(source, photos.length);
      if (picked.length > 0) {
        setPhotos((prev) => [...prev, ...picked].slice(0, LISTING_LIMITS.maxPhotos));
        setErrors((e) => ({ ...e, photoCount: undefined }));
      }
    } catch (err) {
      Alert.alert('Photo', err instanceof Error ? err.message : 'Could not add photo');
    } finally {
      setAddingPhoto(false);
    }
  };

  const handleSubmit = async () => {
    const found = validateListingForm({
      commodity,
      region,
      quantity,
      unit,
      pricePerUnit,
      description,
      photoCount: photos.length,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      const listing = await listingApi.createListing({
        commodity,
        region,
        quantity: quantity.trim(),
        unit,
        pricePerUnit: pricePerUnit.trim(),
        description: description.trim() || undefined,
        photos,
      });
      navigation.replace('ListingDetail', { listingId: listing.id });
    } catch (err) {
      Alert.alert('Could not create listing', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New listing</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Photos ({photos.length}/{LISTING_LIMITS.maxPhotos})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {photos.map((p, i) => (
            <View key={p.uri} style={styles.photoWrap}>
              <Image source={{ uri: p.uri }} style={styles.photo} />
              <TouchableOpacity
                style={styles.removePhoto}
                onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                testID={`remove-photo-${i}`}
              >
                <Text style={styles.removeText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.photoBtn, (addingPhoto || photos.length >= LISTING_LIMITS.maxPhotos) && styles.disabled]}
            disabled={addingPhoto || photos.length >= LISTING_LIMITS.maxPhotos}
            onPress={() => addPhotos('camera')}
            testID="add-photo-camera"
          >
            <Text style={styles.photoBtnText}>📷 Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.photoBtn, (addingPhoto || photos.length >= LISTING_LIMITS.maxPhotos) && styles.disabled]}
            disabled={addingPhoto || photos.length >= LISTING_LIMITS.maxPhotos}
            onPress={() => addPhotos('gallery')}
            testID="add-photo-gallery"
          >
            <Text style={styles.photoBtnText}>🖼 Gallery</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Photos are resized and location data is removed before upload.</Text>
        {errors.photoCount && <Text style={styles.error}>{errors.photoCount}</Text>}

        <Text style={styles.label}>Commodity</Text>
        <View style={styles.chips}>
          {commodities.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[styles.chip, commodity === c.code && styles.chipActive]}
              onPress={() => setCommodity(c.code)}
              testID={`commodity-${c.code}`}
            >
              <Text style={[styles.chipText, commodity === c.code && styles.chipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.commodity && <Text style={styles.error}>{errors.commodity}</Text>}

        <Text style={styles.label}>Region</Text>
        <View style={styles.chips}>
          {regions.map((r) => (
            <TouchableOpacity
              key={r.code}
              style={[styles.chip, region === r.code && styles.chipActive]}
              onPress={() => setRegion(r.code)}
              testID={`region-${r.code}`}
            >
              <Text style={[styles.chipText, region === r.code && styles.chipTextActive]}>{r.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {errors.region && <Text style={styles.error}>{errors.region}</Text>}

        <Text style={styles.label}>Quantity</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 500"
          value={quantity}
          onChangeText={setQuantity}
          testID="listing-quantity"
        />
        {errors.quantity && <Text style={styles.error}>{errors.quantity}</Text>}

        <Text style={styles.label}>Unit</Text>
        <View style={styles.chips}>
          {LISTING_UNITS.map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.chip, unit === u && styles.chipActive]}
              onPress={() => setUnit(u)}
              testID={`unit-${u}`}
            >
              <Text style={[styles.chipText, unit === u && styles.chipTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Price per unit (NGN)</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="e.g. 450"
          value={pricePerUnit}
          onChangeText={setPricePerUnit}
          testID="listing-price"
        />
        {errors.pricePerUnit && <Text style={styles.error}>{errors.pricePerUnit}</Text>}

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          multiline
          placeholder="Quality, harvest date, packaging…"
          value={description}
          onChangeText={setDescription}
          testID="listing-description"
        />
        {errors.description && <Text style={styles.error}>{errors.description}</Text>}

        <TouchableOpacity
          style={[styles.submit, submitting && styles.disabled]}
          disabled={submitting}
          onPress={handleSubmit}
          testID="listing-submit"
        >
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Publish listing</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f9f5' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a3a1a' },
  link: { color: '#2d6a2d', fontWeight: '600' },
  content: { padding: 16, paddingBottom: 48 },
  label: { fontWeight: '600', marginTop: 16, marginBottom: 6 },
  row: { flexDirection: 'row', marginTop: 8, gap: 8 },
  photoWrap: { marginRight: 8 },
  photo: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#e0e8e0' },
  removePhoto: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 11 },
  photoBtn: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#2d6a2d', borderRadius: 8, padding: 12, alignItems: 'center' },
  photoBtnText: { color: '#2d6a2d', fontWeight: '600' },
  hint: { marginTop: 6, color: '#667', fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e0e8e0' },
  chipActive: { backgroundColor: '#2d6a2d' },
  chipText: { color: '#333' },
  chipTextActive: { color: '#fff' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#d0dcd0', borderRadius: 8, padding: 10 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  error: { color: '#EF4444', marginTop: 4, fontSize: 12 },
  submit: { marginTop: 24, backgroundColor: '#2d6a2d', borderRadius: 10, padding: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
});
