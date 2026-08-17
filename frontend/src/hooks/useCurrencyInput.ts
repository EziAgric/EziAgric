"use client";

import { useState, useCallback } from "react";
import {
  validateAmountFormat,
  validateAmountRange,
  amountToStroops,
  type AssetInfo,
} from "@/lib/stellar/assets";

interface UseCurrencyInputOptions {
  asset: AssetInfo;
  min?: string; // in stroops
  max?: string; // in stroops
  onValidChange?: (stroops: string) => void;
}

interface UseCurrencyInputResult {
  value: string;
  stroops: string | null;
  error: string | null;
  isValid: boolean;
  setValue: (value: string) => void;
  clear: () => void;
}

/**
 * Hook for managing currency input with validation
 */
export function useCurrencyInput({
  asset,
  min,
  max,
  onValidChange,
}: UseCurrencyInputOptions): UseCurrencyInputResult {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stroops, setStroops] = useState<string | null>(null);

  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue);
      setError(null);
      setStroops(null);

      if (!newValue.trim()) {
        return;
      }

      // Validate format
      const formatValidation = validateAmountFormat(newValue, asset.decimals);
      if (!formatValidation.valid) {
        setError(formatValidation.error || "Invalid format");
        return;
      }

      // Convert to stroops
      try {
        const stroopsValue = amountToStroops(newValue, asset.decimals);
        
        // Validate range if provided
        if (min || max) {
          const rangeValidation = validateAmountRange(
            stroopsValue,
            min || "0",
            max || stroopsValue
          );
          
          if (!rangeValidation.valid) {
            setError(rangeValidation.error || "Amount out of range");
            return;
          }
        }

        setStroops(stroopsValue);
        onValidChange?.(stroopsValue);
      } catch {
        setError("Invalid amount");
      }
    },
    [asset.decimals, min, max, onValidChange]
  );

  const clear = useCallback(() => {
    setValue("");
    setError(null);
    setStroops(null);
  }, []);

  return {
    value,
    stroops,
    error,
    isValid: stroops !== null && error === null,
    setValue: handleChange,
    clear,
  };
}
