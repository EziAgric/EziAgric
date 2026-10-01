import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { clampQuantity, minOrderQuantity, parseQuantity } from '../lib/tradePrefill';

interface Props {
  value: number;
  /** Maximum orderable quantity (what the listing still has available). */
  max: number;
  unit: string;
  onChange: (next: number) => void;
}

export function QuantityPicker({ value, max, unit, onChange }: Props) {
  const [text, setText] = useState(String(value));
  const min = minOrderQuantity(max);

  // Keep the field in sync when the parent changes the value (stepper, clamp).
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const next = clampQuantity(parseQuantity(raw), max);
    setText(String(next));
    onChange(next);
  };

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.stepBtn, value <= min && styles.stepBtnDisabled]}
          disabled={value <= min}
          onPress={() => commit(String(value - 1))}
          accessibilityLabel="Decrease quantity"
          testID="qty-decrease"
        >
          <Text style={styles.stepText}>−</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={text}
          onChangeText={setText}
          onEndEditing={() => commit(text)}
          onBlur={() => commit(text)}
          accessibilityLabel="Quantity"
          testID="qty-input"
        />
        <TouchableOpacity
          style={[styles.stepBtn, value >= max && styles.stepBtnDisabled]}
          disabled={value >= max}
          onPress={() => commit(String(value + 1))}
          accessibilityLabel="Increase quantity"
          testID="qty-increase"
        >
          <Text style={styles.stepText}>+</Text>
        </TouchableOpacity>
        <Text style={styles.unit}>{unit}</Text>
      </View>
      <Text style={styles.hint}>
        {max} {unit} available
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#2d6a2d', alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { opacity: 0.35 },
  stepText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  input: {
    minWidth: 80,
    marginHorizontal: 8,
    textAlign: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d0dcd0',
    borderRadius: 8,
    padding: 8,
    fontSize: 16,
  },
  unit: { marginLeft: 8, color: '#667' },
  hint: { marginTop: 6, color: '#667', fontSize: 12 },
});
