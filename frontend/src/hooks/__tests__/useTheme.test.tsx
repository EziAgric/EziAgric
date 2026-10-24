import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../useTheme";

const STORAGE_KEY = "amana-theme-preference";

type ChangeListener = (event: MediaQueryListEvent) => void;

/** Install a controllable window.matchMedia for the dark-scheme query. */
function mockMatchMedia(initiallyDark: boolean) {
  let matches = initiallyDark;
  const listeners = new Set<ChangeListener>();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      get matches() {
        return matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: ChangeListener) =>
        listeners.delete(listener),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });

  return {
    listenerCount: () => listeners.size,
    setSystemDark(dark: boolean) {
      matches = dark;
      listeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent));
    },
  };
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  it("persists the theme preference to localStorage and restores it on mount", () => {
    mockMatchMedia(true);
    const { result, unmount } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("light");
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(result.current.themePreference).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement).toHaveClass("light");
    unmount();

    const { result: remounted } = renderHook(() => useTheme(), { wrapper });
    expect(remounted.current.themePreference).toBe("light");
    expect(remounted.current.resolvedTheme).toBe("light");
  });

  it("defaults to the system preference when nothing is stored", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.themePreference).toBe("system");
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("updates resolvedTheme when the OS preference changes while on system", () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper });

    expect(result.current.themePreference).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");

    act(() => {
      media.setSystemDark(false);
    });
    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement).toHaveClass("light");

    act(() => {
      media.setSystemDark(true);
    });
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
  });

  it("ignores OS preference changes once an explicit theme is chosen", () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper });

    act(() => {
      result.current.setTheme("dark");
    });
    expect(media.listenerCount()).toBe(0);

    act(() => {
      media.setSystemDark(false);
    });
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("returns a dark fallback without throwing when rendered outside the provider", () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.resolvedTheme).toBe("dark");
    expect(result.current.themePreference).toBe("system");
    expect(() => result.current.setTheme("light")).not.toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
