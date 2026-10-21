import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MarketplaceItem {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  seller: string;
  location: string;
  rating: number;
}

/**
 * MarketplaceScreen - Browse and search product listings
 * Localized with i18n for high-traffic screen requirement
 */
export default function MarketplaceScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = ['All', 'Grains', 'Vegetables', 'Fruits', 'Livestock'];

  const fetchListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Simulated API call - replace with actual API
      const mockItems: MarketplaceItem[] = [
        {
          id: 'item-001',
          name: 'Maize (Yellow, 50kg)',
          category: 'Grains',
          price: 25000,
          unit: 'per bag',
          seller: 'Abuja Farmers Coop',
          location: 'Abuja',
          rating: 4.5,
        },
        {
          id: 'item-002',
          name: 'Fresh Tomatoes (crate)',
          category: 'Vegetables',
          price: 8000,
          unit: 'per crate',
          seller: 'Kano Market',
          location: 'Kano',
          rating: 4.2,
        },
        {
          id: 'item-003',
          name: 'Rice (Local, 25kg)',
          category: 'Grains',
          price: 15000,
          unit: 'per bag',
          seller: 'Delta Rice Ltd',
          location: 'Asaba',
          rating: 4.8,
        },
      ];
      setItems(mockItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.seller.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === null || selectedCategory === 'All' ||
      item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const renderItem = ({ item }: { item: MarketplaceItem }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.ratingContainer}>
          <Text style={styles.ratingStar}>★</Text>
          <Text style={styles.ratingValue}>{item.rating}</Text>
        </View>
      </View>
      <Text style={styles.itemCategory}>{item.category}</Text>
      <Text style={styles.itemPrice}>{item.price.toLocaleString()} NGN {item.unit}</Text>
      <View style={styles.itemFooter}>
        <Text style={styles.sellerName}>{item.seller}</Text>
        <Text style={styles.location}>{item.location}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2d6a2d" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity testID="retry-button" style={styles.retryButton} onPress={fetchListings}>
          <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('marketplace.title')}</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          testID="search-input"
          style={styles.searchInput}
          placeholder={t('common.search')}
          placeholderTextColor="#9ca3af"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Category Filter */}
      <View style={styles.categoryContainer}>
        <FlatList
          horizontal
          data={categories}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`category-${item}`}
              style={[
                styles.categoryChip,
                (selectedCategory === item || (item === 'All' && selectedCategory === null)) &&
                  styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(item === 'All' ? null : item)}
            >
              <Text
                style={[
                  styles.categoryText,
                  (selectedCategory === item || (item === 'All' && selectedCategory === null)) &&
                    styles.categoryTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Items List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('common.noResults')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f7f4',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1f3d1f',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1f3d1f',
  },
  categoryContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryChipActive: {
    backgroundColor: '#2d6a2d',
    borderColor: '#2d6a2d',
  },
  categoryText: {
    fontSize: 14,
    color: '#6b7280',
  },
  categoryTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f3d1f',
    flex: 1,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStar: {
    fontSize: 14,
    color: '#fbbf24',
    marginRight: 4,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f3d1f',
  },
  itemCategory: {
    fontSize: 13,
    color: '#2d6a2d',
    marginBottom: 8,
  },
  itemPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f3d1f',
    marginBottom: 8,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sellerName: {
    fontSize: 13,
    color: '#6b7280',
  },
  location: {
    fontSize: 13,
    color: '#9ca3af',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2d6a2d',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
});