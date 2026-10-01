import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import type { Listing } from '../types/listing';
import { listingApi } from '../api/listings';

type Props = StackScreenProps<RootStackParamList, 'ListingDetail'>;

export default function ListingDetailScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listingApi
      .getListing(listingId)
      .then((l) => !cancelled && setListing(l))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'Failed to load listing'));
    return () => {
      cancelled = true;
    };
  }, [listingId]);

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
          <Text style={styles.title}>{listing.commodity}</Text>
          <Text style={styles.price}>
            NGN {Number(listing.pricePerUnit).toLocaleString()} / {listing.unit}
          </Text>
          <Text style={styles.meta}>
            {listing.quantity} {listing.unit} available · {listing.region}
          </Text>
          {listing.description ? <Text style={styles.body}>{listing.description}</Text> : null}
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
  title: { fontSize: 22, fontWeight: '700', color: '#1a3a1a' },
  price: { fontSize: 18, fontWeight: '600', color: '#2d6a2d', marginTop: 4 },
  meta: { color: '#667', marginTop: 6 },
  body: { marginTop: 16, color: '#333', lineHeight: 20 },
  error: { color: '#EF4444', padding: 16 },
});
