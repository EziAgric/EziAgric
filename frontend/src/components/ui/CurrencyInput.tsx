import { type InputHTMLAttributes } from "react";
import type { AssetInfo } from "@/lib/stellar/assets";

interface CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  asset: AssetInfo;
  error?: string | null;
  label?: string;
  helperText?: string;
}

export function CurrencyInput({
  value,
  onChange,
  asset,
  error,
  label,
  helperText,
  disabled,
  placeholder,
  id,
  "aria-describedby": ariaDescribedBy,
  ...props
}: CurrencyInputProps) {
  const inputId = id ?? `currency-input-${asset.symbol.toLowerCase()}`;
  const errorId = error ? `${inputId}-error` : undefined;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const precisionId = `${inputId}-precision`;
  const describedBy = [ariaDescribedBy, error ? errorId : null, helperText ? helperId : null, !error ? precisionId : null]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-text-primary">
          {label}
        </label>
     )}
      
      <div className="relative">
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            if (disabled) return;
            onChange(e.target.value);
          }}
          disabled={disabled}
          placeholder={placeholder || `0.${"0".repeat(Math.min(asset.decimals, 2))}`}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`w-full rounded-lg border px-4 py-2 pr-16 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary disabled:cursor-not-allowed disabled:opacity-60 ${
            error
              ? "border-status-danger bg-status-danger/5 focus:border-status-danger"
              : "border-border-default bg-bg-elevated focus:border-gold"
          }`}
          {...props}
        />
        
        {/* Asset symbol badge — decorative */}
        <div aria-hidden="true" className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-bg-primary px-2 py-1">
          <span className="text-xs font-semibold text-text-secondary">
            {asset.symbol}
          </span>
        </div>
      </div>

      {/* Helper text or error — linked via aria-describedby, errors announced */}
      {(helperText || error) && (
        <p
          id={error ? errorId : helperId}
          role={error ? "alert" : undefined}
          aria-live={error ? "polite" : undefined}
          className={`text-xs ${
            error ? "text-status-danger" : "text-text-muted"
          }`}
        >
          {error || helperText}
        </p>
      )}

      {/* Decimal precision info */}
      {!error && (
        <p id={precisionId} className="text-xs text-text-muted">
          Precision: {asset.decimals} decimal places ({asset.name})
        </p>
      )}
    </div>
  );
}
