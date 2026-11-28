import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../i18n';
import { ONBOARDING_COMPLETED_KEY } from './OnboardingScreen';

export default function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { t, i18n } = useTranslation();

  const replayOnboarding = async () => {
    try {
      await AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY);
    } catch (e) {
      // Non-fatal: still navigate so the demo can proceed.
    }
    navigation.navigate('Onboarding');
  };

  const changeLanguage = (code: LanguageCode) => {
    i18n.changeLanguage(code);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('settings')}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('language')}</Text>
        <View style={styles.languageRow}>
          {SUPPORTED_LANGUAGES.map(({ code, label }) => {
            const selected = i18n.language === code;
            return (
              <TouchableOpacity
                key={code}
                style={[styles.languageButton, selected && styles.languageButtonSelected]}
                onPress={() => changeLanguage(code)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text
                  style={[styles.languageLabel, selected && styles.languageLabelSelected]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Text style={styles.sectionTitle}>General</Text>
      <TouchableOpacity style={styles.row} onPress={replayOnboarding}>
        <Text style={styles.rowLabel}>Replay onboarding</Text>
        <Text style={styles.rowChevron}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 12,
  },
  languageButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  languageButtonSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  languageLabel: {
    fontSize: 15,
    color: '#374151',
  },
  languageLabelSelected: {
    color: '#16a34a',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  rowLabel: { fontSize: 16, color: '#1a1a1a' },
  rowChevron: { fontSize: 20, color: '#bbbbbb' },
});