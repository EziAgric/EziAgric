import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useExchangeRate } from '../hooks/useExchangeRate';
import { createTrade } from '../services/tradeService';
import { formatCurrency } from '../utils/format';
import type { TradeFormData } from '../types/trade';

const RATE_REFRESH_MS = 60_000;

export default function CreateTrade() {
  const navigate = useNavigate();
  const { address, isConnected } = useWallet();
  const { rate, lastUpdated, isLoading: isRateLoading, error: rateError, refetch } = useExchangeRate();

  const [formData, setFormData] = useState<TradeFormData>({
    amount: '',
    commodity: '',
    quantity: '',
    pricePerUnit: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, RATE_REFRESH_MS);
    return () => clearInterval(interval);
  }, [refetch]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const cngnAmount = parseFloat(formData.amount);
  const ngnEquivalent = !isNaN(cngnAmount) && rate ? cngnAmount * rate : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      setSubmitError('Please connect your wallet first.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await createTrade({ ...formData, seller: address });
      navigate('/trades');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create trade.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="create-trade-page">
      <h1>Create Trade</h1>

      <div className="exchange-rate-banner" aria-live="polite">
        {isRateLoading && !rate ? (
          <span>Loading exchange rate…</span>
        ) : rateError ? (
          <span className="error">Unable to load exchange rate</span>
        ) : (
          <>
            <span className="rate-value">1 cNGN = ₦{rate?.toFixed(2)}</span>
            {lastUpdated && (
              <span className="rate-timestamp">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="trade-form">
        <div className="form-group">
          <label htmlFor="amount">Amount (cNGN)</label>
          <div className="amount-input-row">
            <input
              id="amount"
              name="amount"
              type="number"
              min="0"
              step="any"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              required
            />
            {rate && (
              <span className="inline-rate">1 cNGN = ₦{rate.toFixed(2)}</span>
            )}
          </div>
          {ngnEquivalent !== null && (
            <p className="ngn-equivalent">
              ≈ {formatCurrency(ngnEquivalent, 'NGN')}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="commodity">Commodity</label>
          <input
            id="commodity"
            name="commodity"
            type="text"
            value={formData.commodity}
            onChange={handleChange}
            placeholder="e.g. Maize"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="quantity">Quantity</label>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            step="any"
            value={formData.quantity}
            onChange={handleChange}
            placeholder="0"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="pricePerUnit">Price per unit (cNGN)</label>
          <input
            id="pricePerUnit"
            name="pricePerUnit"
            type="number"
            min="0"
            step="any"
            value={formData.pricePerUnit}
            onChange={handleChange}
            placeholder="0.00"
            required
          />
        </div>

        {submitError && <p className="error">{submitError}</p>}

        <button type="submit" disabled={isSubmitting || !isConnected}>
          {isSubmitting ? 'Creating…' : 'Create Trade'}
        </button>
      </form>
    </div>
  );
}
