import { renderHook } from "@testing-library/react";
import { useFeatureFlags } from "../useFeatureFlags";

const originalEnv = process.env;

describe("useFeatureFlags", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("adminUI flag", () => {
    it("returns adminUI as false when not set", () => {
      delete process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI;
      const { result } = renderHook(() => useFeatureFlags());
      
      expect(result.current.adminUI).toBe(false);
    });

    it("returns adminUI as true when enabled", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "true";
      const { result } = renderHook(() => useFeatureFlags());
      
      expect(result.current.adminUI).toBe(true);
    });

    it("returns adminUI as false when explicitly disabled", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "false";
      const { result } = renderHook(() => useFeatureFlags());
      
      expect(result.current.adminUI).toBe(false);
    });
  });

  describe("isFeatureEnabled function", () => {
    it("correctly checks adminUI feature", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "true";
      const { result } = renderHook(() => useFeatureFlags());
      
      expect(result.current.isFeatureEnabled("adminUI")).toBe(true);
    });

    it("returns false for disabled feature", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "false";
      const { result } = renderHook(() => useFeatureFlags());
      
      expect(result.current.isFeatureEnabled("adminUI")).toBe(false);
    });
  });

  describe("hook stability", () => {
    it("memoizes flags and function", () => {
      process.env.NEXT_PUBLIC_ENABLE_ADMIN_UI = "true";
      const { result, rerender } = renderHook(() => useFeatureFlags());
      
      const firstFlags = result.current;
      const firstFunction = result.current.isFeatureEnabled;
      
      rerender();
      
      const secondFlags = result.current;
      const secondFunction = result.current.isFeatureEnabled;
      
      // Values should be stable across rerenders
      expect(firstFlags.adminUI).toBe(secondFlags.adminUI);
      expect(firstFunction).toBe(secondFunction);
    });
  });

  describe("returns all expected properties", () => {
    it("includes all feature flags and utility function", () => {
      const { result } = renderHook(() => useFeatureFlags());
      
      expect(result.current).toHaveProperty("adminUI");
      expect(result.current).toHaveProperty("isFeatureEnabled");
      expect(typeof result.current.isFeatureEnabled).toBe("function");
    });
  });
});
