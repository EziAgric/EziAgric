import { useCallback, useEffect, useRef, useState } from 'react';

interface CommodityPrice {
  commodity: string;
  pricePerKg: number;
  pricePerTonne: number;
  currency: string;
}

interface PriceFeedResponse {
  prices: CommodityPrice[];
  updatedAt?: string;
}

const TOP_COMMODITIES = ['maize', 'rice', 'cassava', 'sorghum'];
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const PRICE_FEED_URL = '/api/prices';

const formatAmount = (value: number, currency: string): string =>
  `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const PriceWidget = () => {
  const [prices, setPrices] = useState<CommodityPrice[]>([]);
  const [previousPrices, setPreviousPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const previousPricesRef = useRef<Record<string, number>>({});

  const fetchPrices = useCallback(async () => {
    try {
      const response = await fetch(PRICE_FEED_URL);
      if (!response.ok) {
        throw new Error(`Price feed request failed: ${response.status}`);
      }
      const data: PriceFeedResponse = await response.json();
      const nextPrices = (data.prices ?? []).filter((price) =>
        TOP_COMMODITIES.includes(price.commodity.toLowerCase()),
      );

      setPreviousPrices(previousPricesRef.current);
      previousPricesRef.current = nextPrices.reduce<Record<string, number>>(
        (acc, price) => {
          acc[price.commodity.toLowerCase()] = price.pricePerKg;
          return acc;
        },
        {},
      );
      setPrices(nextPrices);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load prices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrices();
    const intervalId = window.setInterval(() => {
      void fetchPrices();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [fetchPrices]);

  const renderDelta = (price: CommodityPrice) => {
    const previous = previousPrices[price.commodity.toLowerCase()];
    if (previous === undefined || previous === price.pricePerKg) {
      return <span className="price-widget__delta price-widget__delta--flat">—</span>;
    }

    const diff = price.pricePerKg - previous;
    const isUp = diff > 0;
    const percent = previous === 0 ? 0 : (diff / previous) * 100;

    return (
      <span
        className={`price-widget__delta ${isUp ? 'price-widget__delta--up' : 'price-widget__delta--down'}`}
      >
        {isUp ? '▲' : '▼'} {Math.abs(percent).toFixed(2)}%
      </span>
    );
  };

  return (
    <aside className="price-widget" aria-label="Commodity prices">
      <header className="price-widget__header">
        <h3 className="price-widget__title">Market Prices</h3>
        <button
          type="button"
          className="price-widget__toggle"
          aria-expanded={!collapsed}
          aria-controls="price-widget-body"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? 'Show' : 'Hide'}
        </button>
      </header>

      {!collapsed && (
        <div id="price-widget-body" className="price-widget__body">
          {loading && <p className="price-widget__status">Loading prices…</p>}
          {!loading && error && (
            <p className="price-widget__status price-widget__status--error">{error}</p>
          )}
          {!loading && !error && prices.length === 0 && (
            <p className="price-widget__status">No prices available.</p>
          )}
          {!loading && !error && prices.length > 0 && (
            <ul className="price-widget__list">
              {prices.map((price) => (
                <li key={price.commodity} className="price-widget__item">
                  <span className="price-widget__commodity">{price.commodity}</span>
                  <span className="price-widget__values">
                    <span className="price-widget__per-kg">
                      {formatAmount(price.pricePerKg, price.currency)}/kg
                    </span>
                    <span className="price-widget__per-tonne">
                      {formatAmount(price.pricePerTonne, price.currency)}/tonne
                    </span>
                  </span>
                  {renderDelta(price)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
};

export default PriceWidget;
