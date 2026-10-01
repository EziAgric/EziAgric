import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import type { Listing } from '../types/listing';
import { listingApi } from '../api/listings';
import { useAuthStore } from '../stores/authStore';
import { QuantityPicker } from '../components/QuantityPicker';
import { buildTradePrefill, clampQuantity, minOrderQuantity } from '../lib/tradePrefill';

type Props = StackScreenProps<RootStackParamList, 'ListingDetail'>;

export default function ListingDetailScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const walletAddress = useAuthStore((s) => s.walletAddress);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let cancelled = false;
    listingApi
      .getListing(listingId)
      .then((l) => {
        if (cancelled) return;
        setListing(l);
        setQuantity(minOrderQuantity(Number(l.quantity)));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load listing'));
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const available = listing ? Number(listing.quantity) : 0;
  const isOwnListing = !!listing && !!walletAddress && listing.sellerAddress === walletAddress;
  const isAvailable = !!listing && listing.status === 'ACTIVE' && available > 0;
  const canStart = isAvailable && !isOwnListing;
  const total = listing ? quantity * Number(listing.pricePerUnit) : 0;

  const startTrade = () => {
    if (!listing || !canStart) return;
    navigation.navigate('CreateTrade', {
      prefill: buildTradePrefill(listing, clampQuantity(quantity, available)),
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
        <Text style={styles.link}>← Back</Text>
      </TouchableOpacity>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : !listing ? (
        <ActivityIndicator color="#2d6a2d" testID="listing-loading" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {listing.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photos}>
              {listing.photos.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.photo} />
              ))}
            </ScrollView>
          )}
          <Text style={styles.title}>{listing.commodity}</Text>
          <Text style={styles.price}>
            NGN {Number(listing.pricePerUnit).toLocaleString()} / {listing.unit}
          </Text>
          <Text style={styles.meta}>{listing.region}</Text>
          {listing.description ? <Text style={styles.body}>{listing.description}</Text> : null}

          {isAvailable ? (
            <View style={styles.section}>
              <Text style={styles.label}>Quantity</Text>
              <QuantityPicker value={quantity} max={available} unit={listing.unit} onChange={setQuantity} />
              <Text style={styles.total} testID="listing-total">
                Estimated total: NGN {total.toLocaleString()}
              </Text>
            </View>
          ) : (
            <Text style={styles.notice} testID="listing-unavailable">
              This listing is no longer available.
            </Text>
          )}

          {isOwnListing && (
            <Text style={styles.notice} testID="listing-own">
              This is your own listing.
            </Text>
          )}

          <TouchableOpacity
            style={[styles.cta, !canStart && styles.ctaDisabled]}
            disabled={!canStart}
            onPress={startTrade}
            testID="start-trade"
          >
            <Text style={styles.ctaText}>Start trade</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f9f5' },
  back: { padding: 16 },
  link: { color: '#2d6a2d', fontWeight: '600' },
  content: { padding: 16 },
  photos: { marginBottom: 12 },
  photo: { width: 220, height: 160, borderRadius: 12, marginRight: 8, backgroundColor: '#e0e8e0' },
  title: { fontSize: 22, fontWeight: '700', color: '#1a3a1a' },
  price: { fontSize: 18, fontWeight: '600', color: '#2d6a2d', marginTop: 4 },
  meta: { color: '#667', marginTop: 6 },
  body: { marginTop: 16, color: '#333', lineHeight: 20 },
  section: { marginTop: 20 },
  label: { fontWeight: '600', marginBottom: 8 },
  total: { marginTop: 12, fontWeight: '700', color: '#1a3a1a' },
  notice: { marginTop: 16, color: '#B45309' },
  cta: { marginTop: 24, backgroundColor: '#2d6a2d', borderRadius: 10, padding: 14, alignItems: 'center' },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#EF4444', padding: 16 },
});
