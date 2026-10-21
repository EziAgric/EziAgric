import { View, Text, TouchableOpacity, StyleSheet, FlatList } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n';

export default function LanguageSettingScreen() {
  const { t, i18n } = useTranslation();
  const current = i18n.language as LanguageCode;

  const handleSelect = (code: LanguageCode) => {
    i18n.changeLanguage(code);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{t('language.select_language')}</Text>
      <FlatList
        data={SUPPORTED_LANGUAGES}
        keyExtractor={(item) => item.code}
        renderItem={({ item }) => {
          const selected = item.code === current;
          return (
            <TouchableOpacity
              style={[styles.row, selected && styles.rowSelected]}
              onPress={() => handleSelect(item.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {item.label}
              </Text>
              {selected && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0', padding: 24 },
  heading: { fontSize: 20, fontWeight: '700', color: '#1a3a1a', marginBottom: 20 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 10,
  },
  rowSelected: { borderWidth: 2, borderColor: '#2d6a2d' },
  label: { fontSize: 16, color: '#333' },
  labelSelected: { color: '#2d6a2d', fontWeight: '600' },
  check: { fontSize: 18, color: '#2d6a2d' },
});
