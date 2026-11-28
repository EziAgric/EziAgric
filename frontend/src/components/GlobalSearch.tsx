"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, type SearchResultItem } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface GroupedResults {
  trades: SearchResultItem[];
  users: SearchResultItem[];
  contracts: SearchResultItem[];
}

const EMPTY_RESULTS: GroupedResults = { trades: [], users: [], contracts: [] };

const CATEGORY_LABELS: Record<keyof GroupedResults, string> = {
  trades: "Trades",
  users: "Users",
  contracts: "Contracts",
};

const CATEGORY_PATHS: Record<keyof GroupedResults, string> = {
  trades: "/trades",
  users: "/users",
  contracts: "/contracts",
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface GlobalSearchProps {
  /** Called when the overlay is dismissed without a selection */
  onClose?: () => void;
}

export function GlobalSearch({ onClose }: GlobalSearchProps) {
  const router = useRouter();
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GroupedResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allItems = useMemo(
    () => [
      ...results.trades.map((r) => ({ ...r, category: "trades" as const })),
      ...results.users.map((r) => ({ ...r, category: "users" as const })),
      ...results.contracts.map((r) => ({ ...r, category: "contracts" as const })),
    ],
    [results]
  );

  const open = useCallback(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsOpen(true);
    setQuery("");
    setResults(EMPTY_RESULTS);
    setError(null);
    setActiveIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults(EMPTY_RESULTS);
    setActiveIndex(-1);
    onClose?.();
  }, [onClose]);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
      }
      if (e.key === "Escape" && isOpen) {
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, open, close]);

  // Keep Tab / Shift+Tab focus cycling within the dialog while open
  useEffect(() => {
    if (!isOpen) return;

    function handleFocusTrap(e: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (e.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const focusInside = active instanceof Node && dialog.contains(active);

      if (e.shiftKey) {
        if (!focusInside || active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!focusInside || active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleFocusTrap);
    return () => document.removeEventListener("keydown", handleFocusTrap);
  }, [isOpen]);

  // Return focus to the previously focused element once the dialog closes
  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const previous = previousFocusRef.current;
      if (previous && document.contains(previous)) {
        previous.focus();
      } else {
        triggerRef.current?.focus();
      }
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    if (!query.trim()) {
      setResults(EMPTY_RESULTS);
      setError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (!token) {
        setError("Please sign in to search");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await api.search.query(token, query.trim());
        setResults(data);
        setActiveIndex(-1);
      } catch {
        setError("Search failed. Please try again.");
        setResults(EMPTY_RESULTS);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, isOpen, token]);

  function handleSelect(item: SearchResultItem & { category: keyof GroupedResults }) {
    router.push(`${CATEGORY_PATHS[item.category]}/${item.id}`);
    close();
  }

  function handleKeyNavigation(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = activeIndex >= 0 ? allItems[activeIndex] : allItems[0];
      if (target) handleSelect(target);
    }
  }

  const hasResults =
    results.trades.length > 0 ||
    results.users.length > 0 ||
    results.contracts.length > 0;

  if (!isOpen) {
    return (
      <button
        ref={triggerRef}
        onClick={open}
        aria-label="Open global search"
        className="flex items-center gap-2 rounded-lg border border-border-default bg-bg-elevated px-3 py-1.5 text-sm text-text-muted hover:border-border-hover hover:text-text-secondary transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="6.5" cy="6.5" r="4.5" />
          <path d="M10 10l3 3" strokeLinecap="round" />
        </svg>
        <span>Search</span>
        <kbd className="ml-1 hidden sm:inline-flex items-center gap-0.5 rounded border border-border-default px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
          <span>⌘</span>K
        </kbd>
      </button>
    );
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-overlay backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-border-default bg-bg-card shadow-modal overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-default">
          <svg className="w-4 h-4 flex-shrink-0 text-text-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l3 3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            aria-label="Search trades, users, and contracts"
            placeholder="Search trades, users, contracts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyNavigation}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          />
          {loading && (
            <svg className="w-4 h-4 animate-spin text-text-muted" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
              <path d="M14 8a6 6 0 0 0-6-6" strokeLinecap="round" />
            </svg>
          )}
          <kbd className="hidden sm:inline-flex items-center rounded border border-border-default px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {error && (
            <p className="px-4 py-6 text-center text-sm text-text-muted">{error}</p>
          )}

          {!error && !query.trim() && (
            <p className="px-4 py-6 text-center text-sm text-text-muted">
              Search trades by ID, commodity, buyer, or seller…
            </p>
          )}

          {!error && query.trim() && !loading && !hasResults && (
            <p className="px-4 py-6 text-center text-sm text-text-muted">
              No results for “{query.trim()}”
            </p>
          )}

          {!error && hasResults && (
            <ul role="listbox" aria-label="Search results">
              {(Object.keys(CATEGORY_LABELS) as (keyof GroupedResults)[]).map((category) => {
                const items = results[category];
                if (items.length === 0) return null;
                return (
                  <li key={category}>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      {CATEGORY_LABELS[category]}
                    </p>
                    <ul>
                      {items.map((item) => {
                        const index = allItems.findIndex(
                          (i) => i.category === category && i.id === item.id
                        );
                        const isActive = index === activeIndex;
                        return (
                          <li key={`${category}-${item.id}`}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={isActive}
                              onClick={() => handleSelect({ ...item, category })}
                              onMouseEnter={() => setActiveIndex(index)}
                              className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                                isActive
                                  ? "bg-bg-elevated text-text-primary"
                                  : "text-text-secondary hover:bg-bg-elevated"
                              }`}
                            >
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate font-medium text-text-primary">
                                  {item.title}
                                </span>
                                {item.subtitle && (
                                  <span className="truncate text-xs text-text-muted">
                                    {item.subtitle}
                                  </span>
                                )}
                              </span>
                              <span className="flex flex-shrink-0 items-center gap-2">
                                {item.status && (
                                  <span className="rounded-full border border-border-default px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                                    {item.status}
                                  </span>
                                )}
                                {item.createdAt && (
                                  <span className="text-xs text-text-muted">
                                    {new Date(item.createdAt).toLocaleDateString()}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
