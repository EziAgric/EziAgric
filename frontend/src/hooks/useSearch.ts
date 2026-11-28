import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface SearchableTrade {
  id: string;
  commodity: string;
  buyer: string;
  seller: string;
  status: string;
  createdAt: string;
}

export interface SearchResult<T extends SearchableTrade> {
  trade: T;
  score: number;
}

const normalize = (value: string): string => value.toLowerCase().trim();

const fuzzyMatch = (haystack: string, needle: string): number => {
  if (!needle) return 0;
  const target = normalize(haystack);
  const query = normalize(needle);
  if (!target) return -1;

  const directIndex = target.indexOf(query);
  if (directIndex !== -1) {
    // Prefer prefix matches, then earlier matches.
    return 100 - directIndex + (directIndex === 0 ? 50 : 0);
  }

  // Subsequence fuzzy match: all query chars appear in order.
  let queryIdx = 0;
  let gaps = 0;
  let lastMatch = -1;
  for (let i = 0; i < target.length && queryIdx < query.length; i += 1) {
    if (target[i] === query[queryIdx]) {
      if (lastMatch !== -1) gaps += i - lastMatch - 1;
      lastMatch = i;
      queryIdx += 1;
    }
  }

  if (queryIdx !== query.length) return -1;
  return Math.max(1, 40 - gaps);
};

const scoreTrade = <T extends SearchableTrade>(trade: T, query: string): number => {
  if (!query.trim()) return 1;
  const fields = [trade.id, trade.commodity, trade.buyer, trade.seller];
  let best = -1;
  for (const field of fields) {
    const score = fuzzyMatch(field, query);
    if (score > best) best = score;
  }
  return best;
};

export interface UseSearchOptions<T extends SearchableTrade> {
  trades: T[];
  limit?: number;
}

export interface UseSearchResult<T extends SearchableTrade> {
  query: string;
  setQuery: (value: string) => void;
  results: SearchResult<T>[];
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  moveActive: (delta: number) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

export function useSearch<T extends SearchableTrade>({
  trades,
  limit = 8,
}: UseSearchOptions<T>): UseSearchResult<T> {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const results = useMemo(() => {
    const scored: SearchResult<T>[] = [];
    for (const trade of trades) {
      const score = scoreTrade(trade, query);
      if (score >= 0) scored.push({ trade, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }, [trades, query, limit]);

  const open = useCallback(() => {
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
    const previous = previouslyFocused.current;
    if (previous && typeof previous.focus === 'function') {
      previous.focus();
    }
    previouslyFocused.current = null;
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        setQuery('');
        setActiveIndex(0);
        const previous = previouslyFocused.current;
        if (previous && typeof previous.focus === 'function') previous.focus();
        previouslyFocused.current = null;
        return false;
      }
      previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
      return true;
    });
  }, []);

  const moveActive = useCallback(
    (delta: number) => {
      setActiveIndex((prev) => {
        if (results.length === 0) return 0;
        const next = (prev + delta + results.length) % results.length;
        return next;
      });
    },
    [results.length],
  );

  // Reset active index when the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Global Cmd+K / Ctrl+K shortcut.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isShortcut) {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  // Focus the input when the modal opens.
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  return {
    query,
    setQuery,
    results,
    isOpen,
    open,
    close,
    toggle,
    activeIndex,
    setActiveIndex,
    moveActive,
    inputRef,
  };
}
