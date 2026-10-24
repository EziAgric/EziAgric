/**
 * i18n Locale Validation Script
 * 
 * This script validates that all locale JSON files have the same keys.
 * Run with: npx ts-node src/i18n/validateLocales.ts
 * 
 * Or import and call validateLocales() in tests to check locale sync
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(__dirname, 'locales');

const EXPECTED_KEYS = [
  'common',
  'home',
  'profile',
  'trustScore',
  'vault',
  'wallet',
  'dispute',
  'review',
  'marketplace',
  'trades',
  'navigation',
];

/**
 * Get all keys from a nested JSON object
 */
function getAllKeys(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  
  if (typeof obj !== 'object' || obj === null) {
    return keys;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value, fullKey));
    }
  }
  
  return keys;
}

/**
 * Compare two objects and find missing keys
 */
function findMissingKeys(reference: unknown, target: unknown, prefix = ''): string[] {
  const missing: string[] = [];
  
  if (typeof reference !== 'object' || reference === null) {
    return missing;
  }
  
  if (typeof target !== 'object' || target === null) {
    // All keys from reference are missing in target
    return getAllKeys(reference, prefix);
  }
  
  for (const [key, refValue] of Object.entries(reference)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (!(key in target)) {
      missing.push(fullKey);
      continue;
    }
    
    const targetValue = (target as Record<string, unknown>)[key];
    
    if (typeof refValue === 'object' && refValue !== null && !Array.isArray(refValue)) {
      if (typeof targetValue === 'object' && targetValue !== null) {
        missing.push(...findMissingKeys(refValue, targetValue, fullKey));
      }
    }
  }
  
  return missing;
}

/**
 * Validate all locale files have matching keys
 */
export function validateLocales(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Read all locale files
  const locales = ['en', 'ha', 'yo', 'ig', 'sw'];
  const localeData: Record<string, unknown> = {};
  
  for (const locale of locales) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`);
    
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing locale file: ${locale}.json`);
      continue;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      localeData[locale] = JSON.parse(content);
    } catch (e) {
      errors.push(`Invalid JSON in ${locale}.json: ${(e as Error).message}`);
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  // Use English as reference
  const reference = localeData['en'];
  
  if (!reference) {
    return { valid: false, errors: ['Reference locale (en) not found'] };
  }
  
  // Check each locale against English
  for (const locale of locales) {
    if (locale === 'en') continue;
    
    const target = localeData[locale];
    if (!target) continue;
    
    const missing = findMissingKeys(reference, target);
    
    if (missing.length > 0) {
      errors.push(`${locale}.json is missing keys: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if all expected top-level keys exist
 */
export function validateTopLevelKeys(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const locales = ['en', 'ha', 'yo', 'ig', 'sw'];
  
  for (const locale of locales) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`);
    
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing locale file: ${locale}.json`);
      continue;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;
      
      for (const key of EXPECTED_KEYS) {
        if (!(key in data)) {
          errors.push(`${locale}.json is missing top-level key: ${key}`);
        }
      }
    } catch (e) {
      errors.push(`Invalid JSON in ${locale}.json: ${(e as Error).message}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// Run if executed directly
if (require.main === module) {
  console.log('Validating i18n locale files...\n');
  
  const topLevelResult = validateTopLevelKeys();
  const result = validateLocales();
  
  if (!topLevelResult.valid) {
    console.log('Top-level key validation FAILED:');
    topLevelResult.errors.forEach((e) => console.log(`  - ${e}`));
    console.log('');
  }
  
  if (!result.valid) {
    console.log('Key synchronization validation FAILED:');
    result.errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
  
  console.log('All locale files are valid!');
  process.exit(0);
}

export default validateLocales;